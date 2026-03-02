/**
 * Stream Management - Unified stream lifecycle management
 *
 * Phase 5: Flow Control and Realtime Communication
 *
 * Manages:
 * - Stream creation and registration
 * - Bidirectional stream support
 * - Stream lifecycle (open, close, error handling)
 * - Stream multiplexing over a single connection
 */

import {
  type BulkTransfer,
  type BulkTransferConfig,
  BulkTransferManager,
  type BulkTransferMetadata,
} from './bulk.js';
import {
  type RealtimeConfig,
  type RealtimeStream,
  type RealtimeStreamHandlers,
  RealtimeStreamManager,
} from './realtime.js';
import type { RpcConnection } from './rpc-connection.js';
import {
  Stream,
  type StreamDirection,
  type StreamOptions,
  StreamPriority,
  type StreamState,
} from './stream.js';
import type { RpcTransport } from './transport.js';

/** Stream type */
export enum StreamType {
  /** Standard stream */
  STANDARD = 'standard',
  /** Bulk transfer stream */
  BULK = 'bulk',
  /** Realtime stream */
  REALTIME = 'realtime',
}

/** Stream info */
export interface StreamInfo {
  /** Stream ID */
  id: number;
  /** Stream type */
  type: StreamType;
  /** Stream direction */
  direction: StreamDirection;
  /** Stream priority */
  priority: StreamPriority;
  /** Current state */
  state: StreamState;
  /** Creation timestamp */
  createdAt: number;
  /** Bytes transferred */
  bytesTransferred: number;
  /** Metadata */
  metadata?: Record<string, string>;
}

/** Stream manager configuration */
export interface StreamManagerConfig {
  /** Maximum number of concurrent streams */
  maxStreams: number;
  /** Default stream priority */
  defaultPriority: StreamPriority;
  /** Enable stream multiplexing */
  enableMultiplexing: boolean;
  /** Idle timeout in milliseconds */
  idleTimeoutMs: number;
}

/** Default stream manager configuration */
export const DEFAULT_STREAM_MANAGER_CONFIG: StreamManagerConfig = {
  maxStreams: 100,
  defaultPriority: StreamPriority.NORMAL,
  enableMultiplexing: true,
  idleTimeoutMs: 300000, // 5 minutes
};

/** Stream creation options */
export interface CreateStreamOptions {
  /** Stream type */
  type?: StreamType;
  /** Stream direction */
  direction?: StreamDirection;
  /** Stream priority */
  priority?: StreamPriority;
  /** Stream metadata */
  metadata?: Record<string, string>;
  /** Flow control configuration */
  flowControl?: Partial<import('./stream.js').FlowControlConfig>;
}

/** Stream manager event handlers */
export interface StreamManagerHandlers {
  /** Called when a stream is created */
  onStreamCreate?: (info: StreamInfo) => void;
  /** Called when a stream is opened */
  onStreamOpen?: (info: StreamInfo) => void;
  /** Called when a stream is closed */
  onStreamClose?: (info: StreamInfo) => void;
  /** Called when a stream errors */
  onStreamError?: (info: StreamInfo, error: Error) => void;
  /** Called when stream count changes */
  onStreamCountChange?: (count: number) => void;
}

/**
 * Stream manager
 *
 * Manages all streams for an RPC connection.
 */
export class StreamManager {
  private config: StreamManagerConfig;
  private handlers: StreamManagerHandlers;
  private connection?: RpcConnection;
  private transport?: RpcTransport;

  // Stream registries
  private streams: Map<number, Stream> = new Map();
  private streamTypes: Map<number, StreamType> = new Map();
  private streamInfos: Map<number, StreamInfo> = new Map();
  private nextStreamId = 1;

  // Sub-managers
  private bulkManager: BulkTransferManager;
  private realtimeManager: RealtimeStreamManager;

  // Lifecycle
  private idleTimeout?: ReturnType<typeof setTimeout>;
  private isRunning = false;

  constructor(config: Partial<StreamManagerConfig> = {}, handlers: StreamManagerHandlers = {}) {
    this.config = { ...DEFAULT_STREAM_MANAGER_CONFIG, ...config };
    this.handlers = handlers;
    this.bulkManager = new BulkTransferManager();
    this.realtimeManager = new RealtimeStreamManager();
  }

  /** Get the number of active streams */
  get streamCount(): number {
    return this.streams.size;
  }

  /** Get the maximum number of streams */
  get maxStreams(): number {
    return this.config.maxStreams;
  }

  /** Get all stream infos */
  get allStreamInfos(): StreamInfo[] {
    return Array.from(this.streamInfos.values());
  }

  /**
   * Attach to an RPC connection
   */
  attach(connection: RpcConnection, transport?: RpcTransport): void {
    this.connection = connection;
    this.transport = transport;
    this.isRunning = true;
    this.resetIdleTimeout();
  }

  /**
   * Detach from connection
   */
  detach(): void {
    this.closeAllStreams();
    this.isRunning = false;
    this.connection = undefined;
    this.transport = undefined;

    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
      this.idleTimeout = undefined;
    }
  }

  /**
   * Create a new stream
   */
  createStream(options: CreateStreamOptions = {}): Stream {
    if (this.streams.size >= this.config.maxStreams) {
      throw new Error(`Maximum number of streams (${this.config.maxStreams}) reached`);
    }

    const streamId = this.nextStreamId++;
    const type = options.type ?? StreamType.STANDARD;

    const streamOptions: StreamOptions = {
      streamId,
      direction: options.direction ?? 'bidirectional',
      priority: options.priority ?? this.config.defaultPriority ?? StreamPriority.NORMAL,
      metadata: options.metadata,
      flowControl: options.flowControl,
    };

    const stream = new Stream(streamOptions, {
      onOpen: () => {
        this.updateStreamState(streamId, 'open');
        this.handlers.onStreamOpen?.(this.getStreamInfo(streamId)!);
      },
      onClose: () => {
        this.updateStreamState(streamId, 'closed');
        this.handlers.onStreamClose?.(this.getStreamInfo(streamId)!);
        this.removeStream(streamId);
      },
      onError: (error) => {
        this.updateStreamState(streamId, 'error');
        const info = this.getStreamInfo(streamId);
        if (info) {
          this.handlers.onStreamError?.(info, error);
        }
      },
    });

    this.streams.set(streamId, stream);
    this.streamTypes.set(streamId, type);

    const info: StreamInfo = {
      id: streamId,
      type,
      direction: streamOptions.direction,
      priority: streamOptions.priority ?? StreamPriority.NORMAL,
      state: 'connecting',
      createdAt: Date.now(),
      bytesTransferred: 0,
      metadata: options.metadata,
    };
    this.streamInfos.set(streamId, info);

    this.handlers.onStreamCreate?.(info);
    this.handlers.onStreamCountChange?.(this.streams.size);

    this.resetIdleTimeout();

    return stream;
  }

  /**
   * Create a bulk transfer stream
   */
  createBulkStream(
    direction: 'upload' | 'download',
    metadata: BulkTransferMetadata,
    config?: Partial<BulkTransferConfig>,
    handlers?: import('./bulk.js').BulkTransferHandlers
  ): BulkTransfer {
    const _stream = this.createStream({
      type: StreamType.BULK,
      direction: direction === 'upload' ? 'outbound' : 'inbound',
      priority: StreamPriority.NORMAL,
      metadata: metadata.custom,
    });

    return this.bulkManager.createTransfer(direction, metadata, config, handlers);
  }

  /**
   * Create a realtime stream
   */
  createRealtimeStream(
    config?: Partial<RealtimeConfig>,
    handlers?: RealtimeStreamHandlers
  ): RealtimeStream {
    const stream = this.createStream({
      type: StreamType.REALTIME,
      direction: 'bidirectional',
      priority: StreamPriority.HIGH,
    });

    return this.realtimeManager.createStream(stream, config, handlers);
  }

  /**
   * Get a stream by ID
   */
  getStream(id: number): Stream | undefined {
    return this.streams.get(id);
  }

  /**
   * Get stream info by ID
   */
  getStreamInfo(id: number): StreamInfo | undefined {
    return this.streamInfos.get(id);
  }

  /**
   * Get stream type by ID
   */
  getStreamType(id: number): StreamType | undefined {
    return this.streamTypes.get(id);
  }

  /**
   * Get bulk transfer by ID
   */
  getBulkTransfer(id: string): BulkTransfer | undefined {
    return this.bulkManager.getTransfer(id);
  }

  /**
   * Get realtime stream by ID
   */
  getRealtimeStream(id: number): RealtimeStream | undefined {
    return this.realtimeManager.getStream(id);
  }

  /**
   * Close a specific stream
   */
  async closeStream(id: number): Promise<boolean> {
    const stream = this.streams.get(id);
    if (!stream) {
      return false;
    }

    await stream.close();
    this.removeStream(id);
    return true;
  }

  /**
   * Close all streams
   */
  async closeAllStreams(): Promise<void> {
    const closePromises: Promise<void>[] = [];

    for (const [_id, stream] of this.streams) {
      closePromises.push(
        stream.close().catch(() => {
          // Ignore errors during bulk close
        })
      );
    }

    await Promise.all(closePromises);

    this.streams.clear();
    this.streamTypes.clear();
    this.streamInfos.clear();
    this.bulkManager.closeAll();
    this.realtimeManager.stopAll();

    this.handlers.onStreamCountChange?.(0);
  }

  /**
   * Get streams by type
   */
  getStreamsByType(type: StreamType): StreamInfo[] {
    return this.allStreamInfos.filter((info) => info.type === type);
  }

  /**
   * Get streams by state
   */
  getStreamsByState(state: StreamState): StreamInfo[] {
    return this.allStreamInfos.filter((info) => info.state === state);
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    totalStreams: number;
    activeStreams: number;
    streamsByType: Record<StreamType, number>;
    streamsByState: Record<StreamState, number>;
    totalBytesTransferred: number;
  } {
    const infos = this.allStreamInfos;
    const active = infos.filter((i) => i.state === 'open');

    const byType: Record<StreamType, number> = {
      [StreamType.STANDARD]: 0,
      [StreamType.BULK]: 0,
      [StreamType.REALTIME]: 0,
    };

    const byState: Record<StreamState, number> = {
      connecting: 0,
      open: 0,
      closing: 0,
      closed: 0,
      error: 0,
    };

    let totalBytes = 0;

    for (const info of infos) {
      byType[info.type]++;
      byState[info.state]++;
      totalBytes += info.bytesTransferred;
    }

    return {
      totalStreams: infos.length,
      activeStreams: active.length,
      streamsByType: byType,
      streamsByState: byState,
      totalBytesTransferred: totalBytes,
    };
  }

  /**
   * Update stream priority
   */
  updatePriority(id: number, priority: StreamPriority): boolean {
    const info = this.streamInfos.get(id);
    if (!info) {
      return false;
    }

    info.priority = priority;
    return true;
  }

  /**
   * Pause all streams (backpressure)
   */
  pauseAll(): void {
    for (const _stream of this.streams.values()) {
      // Streams don't have a direct pause method, but we can use backpressure
      // This is a simplified implementation
    }
  }

  /**
   * Resume all streams
   */
  resumeAll(): void {
    for (const _stream of this.streams.values()) {
      // Resume from backpressure
    }
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  private removeStream(id: number): void {
    this.streams.delete(id);
    this.streamTypes.delete(id);
    this.streamInfos.delete(id);

    this.handlers.onStreamCountChange?.(this.streams.size);
    this.resetIdleTimeout();
  }

  private updateStreamState(id: number, state: StreamState): void {
    const info = this.streamInfos.get(id);
    if (info) {
      info.state = state;
    }
  }

  private resetIdleTimeout(): void {
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
    }

    if (!this.isRunning || this.streams.size > 0) {
      return;
    }

    this.idleTimeout = setTimeout(() => {
      if (this.streams.size === 0) {
        // No active streams, could emit an event or take action
      }
    }, this.config.idleTimeoutMs);
  }
}

/**
 * Create a stream manager
 */
export function createStreamManager(
  config?: Partial<StreamManagerConfig>,
  handlers?: StreamManagerHandlers
): StreamManager {
  return new StreamManager(config, handlers);
}

// Re-export types
export type { Stream, StreamOptions, StreamState, StreamDirection } from './stream.js';
export { StreamPriority } from './stream.js';
export type {
  BulkTransfer,
  BulkTransferConfig,
  BulkTransferMetadata,
} from './bulk.js';
export { BulkTransferManager } from './bulk.js';
export type {
  RealtimeStream,
  RealtimeConfig,
  RealtimeStreamHandlers,
} from './realtime.js';
export { RealtimeStreamManager } from './realtime.js';
