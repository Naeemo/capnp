/**
 * Stream Abstraction for Cap'n Proto RPC
 *
 * Phase 5: Flow Control and Realtime Communication
 *
 * Provides Stream interface for bidirectional streaming with:
 * - Backpressure handling
 * - Flow control window management
 * - Chunked transfer
 * - Progress notifications
 */

import type { RpcTransport } from './transport.js';
import type { RpcMessage } from './rpc-types.js';

/** Stream state */
export type StreamState = 'connecting' | 'open' | 'closing' | 'closed' | 'error';

/** Stream direction */
export type StreamDirection = 'inbound' | 'outbound' | 'bidirectional';

/** Stream priority levels */
export enum StreamPriority {
  CRITICAL = 0,   // Must not drop, immediate delivery
  HIGH = 1,       // High priority, minimal delay
  NORMAL = 2,     // Normal priority (default)
  LOW = 3,        // Low priority, can be delayed
  BACKGROUND = 4, // Background tasks, lowest priority
}

/** Flow control window configuration */
export interface FlowControlConfig {
  /** Initial window size in bytes */
  initialWindowSize: number;
  /** Maximum window size in bytes */
  maxWindowSize: number;
  /** Minimum window size before backpressure */
  minWindowSize: number;
  /** Window update threshold (update when window drops below this) */
  windowUpdateThreshold: number;
  /** Window update increment size */
  windowUpdateIncrement: number;
}

/** Default flow control configuration */
export const DEFAULT_FLOW_CONTROL: FlowControlConfig = {
  initialWindowSize: 65536,      // 64KB
  maxWindowSize: 1048576,        // 1MB
  minWindowSize: 4096,           // 4KB
  windowUpdateThreshold: 16384,  // 16KB
  windowUpdateIncrement: 32768,  // 32KB
};

/** Stream configuration options */
export interface StreamOptions {
  /** Stream ID (unique within connection) */
  streamId: number;
  /** Stream direction */
  direction: StreamDirection;
  /** Stream priority */
  priority?: StreamPriority;
  /** Flow control configuration */
  flowControl?: Partial<FlowControlConfig>;
  /** Enable progress notifications */
  enableProgress?: boolean;
  /** Progress notification interval in bytes */
  progressInterval?: number;
  /** Stream metadata */
  metadata?: Record<string, string>;
}

/** Chunk of data in a stream */
export interface StreamChunk {
  /** Chunk data */
  data: Uint8Array;
  /** Whether this is the final chunk */
  endOfStream?: boolean;
  /** Chunk sequence number (for ordering) */
  sequenceNumber?: number;
  /** Timestamp when chunk was sent */
  timestamp?: number;
}

/** Progress notification */
export interface StreamProgress {
  /** Stream ID */
  streamId: number;
  /** Total bytes sent/received */
  bytesTransferred: number;
  /** Total bytes expected (if known) */
  totalBytes?: number;
  /** Progress percentage (0-100) */
  percentage?: number;
  /** Transfer rate in bytes per second */
  transferRate?: number;
  /** Estimated time remaining in milliseconds */
  estimatedTimeRemaining?: number;
}

/** Flow control window state */
interface FlowControlWindow {
  /** Current window size */
  currentSize: number;
  /** Maximum window size */
  maxSize: number;
  /** Bytes sent/received in current window */
  bytesInWindow: number;
  /** Whether backpressure is active */
  backpressureActive: boolean;
}

/** Stream event handlers */
export interface StreamEventHandlers {
  /** Called when data is received */
  onData?: (chunk: StreamChunk) => void | Promise<void>;
  /** Called when stream is opened */
  onOpen?: () => void;
  /** Called when stream is closed */
  onClose?: () => void;
  /** Called when progress updates */
  onProgress?: (progress: StreamProgress) => void;
  /** Called when backpressure state changes */
  onBackpressure?: (active: boolean) => void;
  /** Called when an error occurs */
  onError?: (error: Error) => void;
}

/**
 * Stream abstraction for Cap'n Proto RPC
 *
 * Manages bidirectional streaming with flow control and backpressure.
 */
export class Stream {
  private options: StreamOptions;
  private handlers: StreamEventHandlers;
  private state: StreamState = 'connecting';
  private error?: Error;

  // Flow control
  private sendWindow: FlowControlWindow;
  private receiveWindow: FlowControlWindow;
  private flowControlConfig: FlowControlConfig;

  // Data buffering
  private sendBuffer: StreamChunk[] = [];
  private receiveBuffer: StreamChunk[] = [];
  private maxBufferSize = 1048576; // 1MB max buffer

  // Progress tracking
  private bytesSent = 0;
  private bytesReceived = 0;
  private totalBytesExpected?: number;
  private lastProgressUpdate = 0;
  private progressUpdateInterval: number;
  private transferStartTime?: number;

  // Chunk sequencing
  private nextSendSequence = 0;
  private nextExpectedSequence = 0;

  // Promise resolvers for async operations
  private openResolver?: () => void;
  private openRejector?: (error: Error) => void;
  private closeResolver?: () => void;

  constructor(options: StreamOptions, handlers: StreamEventHandlers = {}) {
    this.options = options;
    this.handlers = handlers;

    // Initialize flow control
    this.flowControlConfig = {
      ...DEFAULT_FLOW_CONTROL,
      ...options.flowControl,
    };

    this.sendWindow = {
      currentSize: this.flowControlConfig.initialWindowSize,
      maxSize: this.flowControlConfig.maxWindowSize,
      bytesInWindow: 0,
      backpressureActive: false,
    };

    this.receiveWindow = {
      currentSize: this.flowControlConfig.initialWindowSize,
      maxSize: this.flowControlConfig.maxWindowSize,
      bytesInWindow: 0,
      backpressureActive: false,
    };

    this.progressUpdateInterval = options.progressInterval ?? 65536; // 64KB default
  }

  /** Get stream ID */
  get id(): number {
    return this.options.streamId;
  }

  /** Get stream direction */
  get direction(): StreamDirection {
    return this.options.direction;
  }

  /** Get stream priority */
  get priority(): StreamPriority {
    return this.options.priority ?? StreamPriority.NORMAL;
  }

  /** Get current stream state */
  get currentState(): StreamState {
    return this.state;
  }

  /** Get whether stream is open */
  get isOpen(): boolean {
    return this.state === 'open';
  }

  /** Get whether backpressure is active for sending */
  get isBackpressureActive(): boolean {
    return this.sendWindow.backpressureActive;
  }

  /** Get bytes sent */
  get bytesSentCount(): number {
    return this.bytesSent;
  }

  /** Get bytes received */
  get bytesReceivedCount(): number {
    return this.bytesReceived;
  }

  /** Get metadata */
  get metadata(): Record<string, string> | undefined {
    return this.options.metadata;
  }

  /**
   * Open the stream
   */
  async open(): Promise<void> {
    if (this.state !== 'connecting') {
      throw new Error(`Cannot open stream in state: ${this.state}`);
    }

    return new Promise((resolve, reject) => {
      this.openResolver = resolve;
      this.openRejector = reject;

      // Transition to open state
      this.transitionState('open');
      this.transferStartTime = Date.now();

      // Notify handlers
      this.handlers.onOpen?.();
    });
  }

  /**
   * Send data through the stream
   *
   * Respects flow control and handles backpressure.
   */
  async send(data: Uint8Array, endOfStream = false): Promise<void> {
    if (this.state !== 'open') {
      throw new Error(`Cannot send in state: ${this.state}`);
    }

    // Check if we need to wait for window update
    if (this.sendWindow.bytesInWindow + data.length > this.sendWindow.currentSize) {
      // Wait for window update
      await this.waitForWindowUpdate();
    }

    // Create chunk
    const chunk: StreamChunk = {
      data,
      endOfStream,
      sequenceNumber: this.nextSendSequence++,
      timestamp: Date.now(),
    };

    // Update flow control
    this.sendWindow.bytesInWindow += data.length;
    this.bytesSent += data.length;

    // Check for backpressure
    this.checkBackpressure();

    // Send the chunk
    await this.sendChunk(chunk);

    // Report progress
    this.reportProgress();
  }

  /**
   * Send a chunk of data
   *
   * Override in subclasses to implement actual transport.
   */
  protected async sendChunk(chunk: StreamChunk): Promise<void> {
    // To be implemented by transport-specific subclass
    // This base class just buffers
    this.sendBuffer.push(chunk);
  }

  /**
   * Receive data from the stream
   *
   * Returns buffered data or waits for new data.
   */
  async receive(): Promise<StreamChunk | null> {
    if (this.receiveBuffer.length > 0) {
      return this.receiveBuffer.shift()!;
    }

    if (this.state === 'closed') {
      return null;
    }

    // Wait for data
    return new Promise((resolve, reject) => {
      const checkBuffer = () => {
        if (this.receiveBuffer.length > 0) {
          resolve(this.receiveBuffer.shift()!);
        } else if (this.state === 'closed') {
          resolve(null);
        } else if (this.state === 'error') {
          reject(this.error ?? new Error('Stream error'));
        } else {
          setTimeout(checkBuffer, 10);
        }
      };
      checkBuffer();
    });
  }

  /**
   * Handle incoming chunk from transport
   */
  handleIncomingChunk(chunk: StreamChunk): void {
    if (this.state !== 'open' && this.state !== 'closing') {
      return;
    }

    // Update receive window
    this.receiveWindow.bytesInWindow += chunk.data.length;
    this.bytesReceived += chunk.data.length;

    // Check if we need to send window update
    this.checkReceiveWindow();

    // Buffer or deliver chunk
    if (this.handlers.onData) {
      // Deliver immediately if handler is registered
      Promise.resolve(this.handlers.onData(chunk)).catch((err) => {
        this.handleError(err);
      });
    } else {
      // Buffer for later
      this.receiveBuffer.push(chunk);
    }

    // Report progress
    this.reportProgress();

    // Handle end of stream
    if (chunk.endOfStream) {
      this.transitionState('closing');
    }
  }

  /**
   * Update the send window (called when receiving window update from peer)
   */
  updateSendWindow(increment: number): void {
    this.sendWindow.currentSize = Math.min(
      this.sendWindow.currentSize + increment,
      this.sendWindow.maxSize
    );

    // Check if we can release backpressure
    if (this.sendWindow.backpressureActive) {
      const available = this.sendWindow.currentSize - this.sendWindow.bytesInWindow;
      if (available >= this.flowControlConfig.minWindowSize) {
        this.sendWindow.backpressureActive = false;
        this.handlers.onBackpressure?.(false);
      }
    }
  }

  /**
   * Acknowledge received bytes (called to update peer's send window)
   */
  acknowledgeBytes(bytes: number): void {
    this.receiveWindow.bytesInWindow = Math.max(0, this.receiveWindow.bytesInWindow - bytes);

    // Check if we should send window update
    if (this.receiveWindow.bytesInWindow < this.flowControlConfig.windowUpdateThreshold) {
      this.sendWindowUpdate();
    }
  }

  /**
   * Close the stream gracefully
   */
  async close(): Promise<void> {
    if (this.state === 'closed' || this.state === 'closing') {
      return;
    }

    this.transitionState('closing');

    // Wait for any pending sends to complete
    await this.drainSendBuffer();

    // Send end-of-stream marker
    await this.sendChunk({ data: new Uint8Array(0), endOfStream: true });

    this.transitionState('closed');
    this.handlers.onClose?.();
  }

  /**
   * Abort the stream with an error
   */
  abort(error: Error): void {
    this.error = error;
    this.transitionState('error');
    this.handlers.onError?.(error);
  }

  /**
   * Set total bytes expected (for progress calculation)
   */
  setTotalBytesExpected(total: number): void {
    this.totalBytesExpected = total;
  }

  /**
   * Wait for the stream to be ready for sending
   */
  async ready(): Promise<void> {
    if (this.state === 'open' && !this.sendWindow.backpressureActive) {
      return;
    }

    if (this.state !== 'open') {
      throw new Error(`Stream not open: ${this.state}`);
    }

    return this.waitForWindowUpdate();
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  private transitionState(newState: StreamState): void {
    const oldState = this.state;
    this.state = newState;

    // Resolve/reject pending promises
    if (newState === 'open' && this.openResolver) {
      this.openResolver();
      this.openResolver = undefined;
      this.openRejector = undefined;
    } else if (newState === 'error' && this.openRejector) {
      this.openRejector(this.error ?? new Error('Stream error'));
      this.openResolver = undefined;
      this.openRejector = undefined;
    }

    if (newState === 'closed' && this.closeResolver) {
      this.closeResolver();
      this.closeResolver = undefined;
    }
  }

  private checkBackpressure(): void {
    const available = this.sendWindow.currentSize - this.sendWindow.bytesInWindow;

    if (available < this.flowControlConfig.minWindowSize && !this.sendWindow.backpressureActive) {
      this.sendWindow.backpressureActive = true;
      this.handlers.onBackpressure?.(true);
    }
  }

  private checkReceiveWindow(): void {
    if (this.receiveWindow.bytesInWindow < this.flowControlConfig.windowUpdateThreshold) {
      this.sendWindowUpdate();
    }
  }

  private async waitForWindowUpdate(): Promise<void> {
    return new Promise((resolve, reject) => {
      const checkWindow = () => {
        const available = this.sendWindow.currentSize - this.sendWindow.bytesInWindow;

        if (this.state === 'error') {
          reject(this.error ?? new Error('Stream error'));
          return;
        }

        if (this.state !== 'open') {
          reject(new Error(`Stream closed`));
          return;
        }

        if (available >= this.flowControlConfig.minWindowSize) {
          resolve();
          return;
        }

        setTimeout(checkWindow, 10);
      };

      checkWindow();
    });
  }

  private async drainSendBuffer(): Promise<void> {
    // In the base Stream class, sendBuffer is just for buffering
    // Subclasses that actually send data should override this
    // For now, just clear the buffer
    this.sendBuffer.length = 0;
  }

  private sendWindowUpdate(): void {
    // To be implemented by transport layer
    // This would send a window update message to the peer
  }

  private reportProgress(): void {
    if (!this.options.enableProgress || !this.handlers.onProgress) {
      return;
    }

    const now = Date.now();
    const bytesTransferred = Math.max(this.bytesSent, this.bytesReceived);

    // Check if it's time to report progress
    if (bytesTransferred - this.lastProgressUpdate < this.progressUpdateInterval) {
      return;
    }

    this.lastProgressUpdate = bytesTransferred;

    // Calculate transfer rate
    let transferRate: number | undefined;
    if (this.transferStartTime) {
      const elapsed = (now - this.transferStartTime) / 1000;
      if (elapsed > 0) {
        transferRate = bytesTransferred / elapsed;
      }
    }

    // Calculate percentage and ETA
    let percentage: number | undefined;
    let estimatedTimeRemaining: number | undefined;

    if (this.totalBytesExpected && this.totalBytesExpected > 0) {
      percentage = Math.min(100, (bytesTransferred / this.totalBytesExpected) * 100);

      if (transferRate && transferRate > 0) {
        const remaining = this.totalBytesExpected - bytesTransferred;
        estimatedTimeRemaining = (remaining / transferRate) * 1000;
      }
    }

    const progress: StreamProgress = {
      streamId: this.id,
      bytesTransferred,
      totalBytes: this.totalBytesExpected,
      percentage,
      transferRate,
      estimatedTimeRemaining,
    };

    this.handlers.onProgress(progress);
  }

  private handleError(error: Error): void {
    this.error = error;
    this.transitionState('error');
    this.handlers.onError?.(error);
  }
}

/**
 * Create a new stream
 */
export function createStream(options: StreamOptions, handlers?: StreamEventHandlers): Stream {
  return new Stream(options, handlers);
}

/**
 * Check if an object is a Stream
 */
export function isStream(obj: unknown): obj is Stream {
  return obj instanceof Stream;
}
