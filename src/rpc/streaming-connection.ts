/**
 * Streaming RpcConnection Extension
 *
 * Phase 5: Flow Control and Realtime Communication
 *
 * Extends RpcConnection with streaming capabilities:
 * - Stream creation and management
 * - Integration with existing Pipeline
 * * Stream capability negotiation
 */

import type { BulkTransferConfig, BulkTransferHandlers, BulkTransferMetadata } from './bulk.js';
import type { RealtimeConfig, RealtimeStreamHandlers } from './realtime.js';
import { RpcConnection, type RpcConnectionOptions } from './rpc-connection.js';
import type { ExportId, ImportId, RpcMessage } from './rpc-types.js';
import {
  type BulkTransfer,
  type CreateStreamOptions,
  type RealtimeStream,
  type Stream,
  StreamManager,
  type StreamManagerConfig,
  type StreamManagerHandlers,
  StreamType,
} from './stream-manager.js';
import type { RpcTransport } from './transport.js';

/** Streaming capability flags */
export interface StreamingCapabilities {
  /** Standard streaming supported */
  standardStreams: boolean;
  /** Bulk transfer supported */
  bulkTransfer: boolean;
  /** Realtime streaming supported */
  realtimeStreams: boolean;
  /** Maximum concurrent streams */
  maxConcurrentStreams: number;
  /** Maximum stream window size */
  maxWindowSize: number;
  /** Supported flow control algorithms */
  flowControlAlgorithms: string[];
}

/** Default streaming capabilities */
export const DEFAULT_STREAMING_CAPABILITIES: StreamingCapabilities = {
  standardStreams: true,
  bulkTransfer: true,
  realtimeStreams: true,
  maxConcurrentStreams: 100,
  maxWindowSize: 1048576, // 1MB
  flowControlAlgorithms: ['sliding-window', 'rate-based'],
};

/** Extended RPC connection options with streaming */
export interface StreamingRpcConnectionOptions extends RpcConnectionOptions {
  /** Stream manager configuration */
  streamManagerConfig?: Partial<StreamManagerConfig>;
  /** Stream manager event handlers */
  streamManagerHandlers?: StreamManagerHandlers;
  /** Local streaming capabilities */
  localCapabilities?: Partial<StreamingCapabilities>;
  /** Enable streaming support */
  enableStreaming?: boolean;
}

/**
 * Extended RPC connection with streaming support
 *
 * This class wraps RpcConnection and adds stream management capabilities.
 * It can be used as a drop-in replacement for RpcConnection.
 */
export class StreamingRpcConnection extends RpcConnection {
  private streamManager: StreamManager;
  private localCapabilities: StreamingCapabilities;
  private remoteCapabilities?: StreamingCapabilities;
  private streamingEnabled: boolean;

  constructor(transport: RpcTransport, options: StreamingRpcConnectionOptions = {}) {
    super(transport, options);

    this.streamingEnabled = options.enableStreaming ?? true;
    this.localCapabilities = { ...DEFAULT_STREAMING_CAPABILITIES, ...options.localCapabilities };

    // Create stream manager
    this.streamManager = new StreamManager(
      options.streamManagerConfig,
      options.streamManagerHandlers
    );

    // Attach to this connection
    this.streamManager.attach(this, transport);

    // Set up capability negotiation if streaming is enabled
    if (this.streamingEnabled) {
      this.negotiateCapabilities();
    }
  }

  /** Get the stream manager */
  get streams(): StreamManager {
    return this.streamManager;
  }

  /** Get local streaming capabilities */
  get capabilities(): StreamingCapabilities {
    return this.localCapabilities;
  }

  /** Get remote streaming capabilities (if negotiated) */
  get remoteStreamingCapabilities(): StreamingCapabilities | undefined {
    return this.remoteCapabilities;
  }

  /** Check if streaming is enabled */
  get isStreamingEnabled(): boolean {
    return this.streamingEnabled;
  }

  /**
   * Create a new standard stream
   */
  createStream(options?: CreateStreamOptions): Stream {
    this.ensureStreamingEnabled();
    return this.streamManager.createStream(options);
  }

  /**
   * Create a bulk transfer stream
   */
  createBulkTransfer(
    direction: 'upload' | 'download',
    metadata: BulkTransferMetadata,
    config?: Partial<BulkTransferConfig>,
    handlers?: BulkTransferHandlers
  ): BulkTransfer {
    this.ensureStreamingEnabled();
    this.ensureCapability('bulkTransfer');
    return this.streamManager.createBulkStream(direction, metadata, config, handlers);
  }

  /**
   * Create a realtime stream
   */
  createRealtimeStream(
    config?: Partial<RealtimeConfig>,
    handlers?: RealtimeStreamHandlers
  ): RealtimeStream {
    this.ensureStreamingEnabled();
    this.ensureCapability('realtimeStreams');
    return this.streamManager.createRealtimeStream(config, handlers);
  }

  /**
   * Get stream statistics
   */
  getStreamStatistics(): ReturnType<StreamManager['getStatistics']> {
    return this.streamManager.getStatistics();
  }

  /**
   * Close all streams gracefully
   */
  async closeAllStreams(): Promise<void> {
    await this.streamManager.closeAllStreams();
  }

  /**
   * Override stop to properly clean up streams
   */
  override async stop(): Promise<void> {
    await this.closeAllStreams();
    this.streamManager.detach();
    await super.stop();
  }

  // =============================================================================
  // Capability Negotiation
  // =============================================================================

  /**
   * Negotiate streaming capabilities with remote peer
   *
   * This would typically be done during bootstrap or connection setup.
   * For now, we assume the remote has the same capabilities.
   */
  private async negotiateCapabilities(): Promise<void> {
    // In a full implementation, this would exchange capability messages
    // with the remote peer during connection setup.

    // For now, assume remote has same capabilities
    this.remoteCapabilities = { ...this.localCapabilities };

    // TODO: Implement actual capability exchange via RPC
  }

  /**
   * Update remote capabilities (called when received from peer)
   */
  setRemoteCapabilities(capabilities: StreamingCapabilities): void {
    this.remoteCapabilities = capabilities;
  }

  /**
   * Check if a specific capability is supported by both peers
   */
  isCapabilitySupported(capability: keyof StreamingCapabilities): boolean {
    const localValue = this.localCapabilities[capability];
    const remoteValue = this.remoteCapabilities?.[capability];

    // For boolean capabilities, both must be true
    if (typeof localValue === 'boolean' && typeof remoteValue === 'boolean') {
      return localValue && remoteValue;
    }

    // For numeric capabilities, use the minimum
    if (typeof localValue === 'number' && typeof remoteValue === 'number') {
      return localValue > 0 && remoteValue > 0;
    }

    return false;
  }

  // =============================================================================
  // Integration with Pipeline
  // =============================================================================

  /**
   * Create a stream for pipeline results
   *
   * This allows large pipeline results to be streamed instead of buffered.
   */
  createPipelineStream(questionId: number, options?: CreateStreamOptions): Stream {
    this.ensureStreamingEnabled();

    const stream = this.createStream({
      ...options,
      type: StreamType.STANDARD,
      metadata: {
        ...options?.metadata,
        pipelineQuestionId: questionId.toString(),
      },
    });

    return stream;
  }

  /**
   * Associate a stream with a capability
   *
   * This enables streaming data to/from a capability.
   */
  associateStreamWithCapability(streamId: number, _importId: ImportId | ExportId): void {
    const stream = this.streamManager.getStream(streamId);
    if (!stream) {
      throw new Error(`Stream ${streamId} not found`);
    }

    // Store association (would be used by the RPC layer)
    // This is a simplified implementation
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  private ensureStreamingEnabled(): void {
    if (!this.streamingEnabled) {
      throw new Error('Streaming is not enabled on this connection');
    }
  }

  private ensureCapability(capability: keyof StreamingCapabilities): void {
    if (!this.isCapabilitySupported(capability)) {
      throw new Error(`Capability '${capability}' is not supported by both peers`);
    }
  }
}

/**
 * Create a streaming RPC connection
 */
export function createStreamingConnection(
  transport: RpcTransport,
  options?: StreamingRpcConnectionOptions
): StreamingRpcConnection {
  return new StreamingRpcConnection(transport, options);
}

/**
 * Check if a connection supports streaming
 */
export function supportsStreaming(connection: RpcConnection): connection is StreamingRpcConnection {
  return connection instanceof StreamingRpcConnection;
}

// Re-export types
export type {
  StreamingCapabilities,
  StreamingRpcConnectionOptions,
  StreamManager,
  StreamType,
  CreateStreamOptions,
  StreamManagerConfig,
  StreamManagerHandlers,
  Stream,
  BulkTransfer,
  RealtimeStream,
};
