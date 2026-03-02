/**
 * Realtime API - Real-time communication with prioritization
 *
 * Phase 5: Flow Control and Realtime Communication
 *
 * Features:
 * - Message priority queues
 * - Message drop policies for latency-sensitive scenarios
 * - Bandwidth adaptation
 * - Jitter buffer management
 */

import {
  Stream,
  StreamPriority,
  type StreamOptions,
  type StreamChunk,
  type FlowControlConfig,
} from './stream.js';

/** Message priority levels (extends StreamPriority) */
export { StreamPriority as MessagePriority };

/** Message drop policy for latency-sensitive scenarios */
export enum DropPolicy {
  /** Never drop messages */
  NEVER = 'never',
  /** Drop oldest messages when queue is full */
  DROP_OLDEST = 'drop_oldest',
  /** Drop newest messages when queue is full */
  DROP_NEWEST = 'drop_newest',
  /** Drop low priority messages first */
  DROP_LOW_PRIORITY = 'drop_low_priority',
  /** Drop messages that exceed max latency */
  DROP_STALE = 'drop_stale',
}

/** Realtime stream configuration */
export interface RealtimeConfig {
  /** Target latency in milliseconds */
  targetLatencyMs: number;
  /** Maximum acceptable latency in milliseconds */
  maxLatencyMs: number;
  /** Jitter buffer size in milliseconds */
  jitterBufferMs: number;
  /** Message queue size limit */
  maxQueueSize: number;
  /** Drop policy for queue management */
  dropPolicy: DropPolicy;
  /** Enable adaptive bitrate */
  adaptiveBitrate: boolean;
  /** Minimum bitrate in bytes per second */
  minBitrate: number;
  /** Maximum bitrate in bytes per second */
  maxBitrate: number;
  /** Bandwidth measurement window in milliseconds */
  bandwidthWindowMs: number;
}

/** Default realtime configuration */
export const DEFAULT_REALTIME_CONFIG: RealtimeConfig = {
  targetLatencyMs: 50,
  maxLatencyMs: 200,
  jitterBufferMs: 30,
  maxQueueSize: 1000,
  dropPolicy: DropPolicy.DROP_STALE,
  adaptiveBitrate: true,
  minBitrate: 16000,    // 16 KB/s
  maxBitrate: 10485760, // 10 MB/s
  bandwidthWindowMs: 1000,
};

/** Realtime message */
export interface RealtimeMessage {
  /** Message ID */
  id: string;
  /** Message priority */
  priority: StreamPriority;
  /** Message timestamp */
  timestamp: number;
  /** Message data */
  data: Uint8Array;
  /** Message type/category */
  type?: string;
  /** Sequence number for ordering */
  sequenceNumber: number;
  /** Whether message is critical (cannot be dropped) */
  critical?: boolean;
}

/** Bandwidth statistics */
export interface BandwidthStats {
  /** Current bitrate in bytes per second */
  currentBitrate: number;
  /** Measured bandwidth in bytes per second */
  measuredBandwidth: number;
  /** Packet loss rate (0-1) */
  packetLossRate: number;
  /** Average latency in milliseconds */
  averageLatencyMs: number;
  /** Jitter in milliseconds */
  jitterMs: number;
  /** Congestion level (0-1) */
  congestionLevel: number;
}

/** Jitter buffer entry */
interface JitterBufferEntry {
  message: RealtimeMessage;
  receivedAt: number;
  playoutTime: number;
}

/** Realtime stream event handlers */
export interface RealtimeStreamHandlers {
  /** Called when a message is received */
  onMessage?: (message: RealtimeMessage) => void | Promise<void>;
  /** Called when messages are dropped */
  onDrop?: (messages: RealtimeMessage[], reason: string) => void;
  /** Called when bandwidth is adapted */
  onBandwidthAdapt?: (newBitrate: number, stats: BandwidthStats) => void;
  /** Called when latency changes */
  onLatencyChange?: (latencyMs: number) => void;
  /** Called when stream is ready to play */
  onReady?: () => void;
  /** Called on error */
  onError?: (error: Error) => void;
}

/**
 * Priority queue for realtime messages
 */
class PriorityMessageQueue {
  private queues: Map<StreamPriority, RealtimeMessage[]> = new Map();
  private totalSize = 0;
  private maxSize: number;
  private dropPolicy: DropPolicy;
  private maxLatencyMs: number;

  constructor(maxSize: number, dropPolicy: DropPolicy, maxLatencyMs: number) {
    this.maxSize = maxSize;
    this.dropPolicy = dropPolicy;
    this.maxLatencyMs = maxLatencyMs;

    // Initialize queues for each priority level
    for (let i = 0; i <= 4; i++) {
      this.queues.set(i as StreamPriority, []);
    }
  }

  /** Get total queue size */
  get size(): number {
    return this.totalSize;
  }

  /** Check if queue is empty */
  get isEmpty(): boolean {
    return this.totalSize === 0;
  }

  /** Enqueue a message */
  enqueue(message: RealtimeMessage): boolean {
    // Check if message is stale
    if (this.dropPolicy === DropPolicy.DROP_STALE) {
      const age = Date.now() - message.timestamp;
      if (age > this.maxLatencyMs && !message.critical) {
        return false; // Message dropped
      }
    }

    // Check if queue is full
    if (this.totalSize >= this.maxSize) {
      if (!this.handleQueueFull(message)) {
        return false;
      }
    }

    const queue = this.queues.get(message.priority)!;
    queue.push(message);
    this.totalSize++;

    return true;
  }

  /** Dequeue the highest priority message */
  dequeue(): RealtimeMessage | undefined {
    // Check queues from highest to lowest priority
    for (let priority = 0; priority <= 4; priority++) {
      const queue = this.queues.get(priority as StreamPriority)!;
      if (queue.length > 0) {
        this.totalSize--;
        return queue.shift()!;
      }
    }
    return undefined;
  }

  /** Peek at the highest priority message without removing */
  peek(): RealtimeMessage | undefined {
    for (let priority = 0; priority <= 4; priority++) {
      const queue = this.queues.get(priority as StreamPriority)!;
      if (queue.length > 0) {
        return queue[0];
      }
    }
    return undefined;
  }

  /** Remove stale messages */
  removeStale(): RealtimeMessage[] {
    const now = Date.now();
    const removed: RealtimeMessage[] = [];

    for (const [priority, queue] of this.queues) {
      const remaining: RealtimeMessage[] = [];
      for (const msg of queue) {
        if (now - msg.timestamp <= this.maxLatencyMs || msg.critical) {
          remaining.push(msg);
        } else {
          removed.push(msg);
          this.totalSize--;
        }
      }
      this.queues.set(priority, remaining);
    }

    return removed;
  }

  /** Clear all messages */
  clear(): RealtimeMessage[] {
    const all: RealtimeMessage[] = [];
    for (const queue of this.queues.values()) {
      all.push(...queue);
    }
    this.queues.forEach((queue) => (queue.length = 0));
    this.totalSize = 0;
    return all;
  }

  private handleQueueFull(newMessage: RealtimeMessage): boolean {
    switch (this.dropPolicy) {
      case DropPolicy.NEVER:
        return false;

      case DropPolicy.DROP_OLDEST:
        // Remove oldest message from lowest priority queue
        for (let priority = 4; priority >= 0; priority--) {
          const queue = this.queues.get(priority as StreamPriority)!;
          if (queue.length > 0 && priority >= newMessage.priority) {
            queue.shift();
            this.totalSize--;
            return true;
          }
        }
        return false;

      case DropPolicy.DROP_NEWEST:
        // Don't add the new message if it's lower priority
        if (newMessage.priority >= StreamPriority.NORMAL) {
          return false;
        }
        return true;

      case DropPolicy.DROP_LOW_PRIORITY:
        // Remove a message from lower priority than the new message
        for (let priority = 4; priority > newMessage.priority; priority--) {
          const queue = this.queues.get(priority as StreamPriority)!;
          if (queue.length > 0) {
            queue.shift();
            this.totalSize--;
            return true;
          }
        }
        return false;

      case DropPolicy.DROP_STALE:
        // Remove stale messages first
        const stale = this.removeStale();
        if (stale.length > 0) {
          return true;
        }
        // Fall through to DROP_OLDEST
        for (let priority = 4; priority >= 0; priority--) {
          const queue = this.queues.get(priority as StreamPriority)!;
          if (queue.length > 0 && priority >= newMessage.priority) {
            queue.shift();
            this.totalSize--;
            return true;
          }
        }
        return false;

      default:
        return false;
    }
  }
}

/**
 * Realtime stream for low-latency communication
 *
 * Manages message prioritization, jitter buffering, and bandwidth adaptation.
 */
export class RealtimeStream {
  private stream: Stream;
  private config: RealtimeConfig;
  private handlers: RealtimeStreamHandlers;

  // Message queues
  private sendQueue: PriorityMessageQueue;
  private receiveQueue: PriorityMessageQueue;

  // Jitter buffer
  private jitterBuffer: JitterBufferEntry[] = [];
  private jitterBufferTargetSize: number;

  // Bandwidth adaptation
  private bandwidthStats: BandwidthStats = {
    currentBitrate: 0,
    measuredBandwidth: 0,
    packetLossRate: 0,
    averageLatencyMs: 0,
    jitterMs: 0,
    congestionLevel: 0,
  };
  private bitrateHistory: number[] = [];
  private latencyHistory: number[] = [];
  private lastBandwidthUpdate = 0;

  // Sequence numbers
  private nextSendSequence = 0;
  private nextExpectedSequence = 0;
  private receivedSequences: Set<number> = new Set();

  // State
  private isRunning = false;
  private sendInterval?: ReturnType<typeof setInterval>;
  private jitterInterval?: ReturnType<typeof setInterval>;
  private bandwidthInterval?: ReturnType<typeof setInterval>;

  constructor(stream: Stream, config: Partial<RealtimeConfig> = {}, handlers: RealtimeStreamHandlers = {}) {
    this.stream = stream;
    this.config = { ...DEFAULT_REALTIME_CONFIG, ...config };
    this.handlers = handlers;

    this.sendQueue = new PriorityMessageQueue(
      this.config.maxQueueSize,
      this.config.dropPolicy,
      this.config.maxLatencyMs
    );

    this.receiveQueue = new PriorityMessageQueue(
      this.config.maxQueueSize,
      this.config.dropPolicy,
      this.config.maxLatencyMs
    );

    // Calculate jitter buffer target size based on jitter buffer time
    this.jitterBufferTargetSize = Math.ceil(this.config.jitterBufferMs / this.config.targetLatencyMs);

    this.setupStreamHandlers();
  }

  /** Get current bandwidth statistics */
  get stats(): BandwidthStats {
    return { ...this.bandwidthStats };
  }

  /** Get current send queue size */
  get sendQueueSize(): number {
    return this.sendQueue.size;
  }

  /** Get current receive queue size */
  get receiveQueueSize(): number {
    return this.receiveQueue.size;
  }

  /** Get jitter buffer size */
  get jitterBufferSize(): number {
    return this.jitterBuffer.length;
  }

  /**
   * Start the realtime stream
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;

    // Start send loop
    this.sendInterval = setInterval(() => {
      this.processSendQueue();
    }, this.config.targetLatencyMs / 2);

    // Start jitter buffer processing
    this.jitterInterval = setInterval(() => {
      this.processJitterBuffer();
    }, this.config.targetLatencyMs / 4);

    // Start bandwidth monitoring
    if (this.config.adaptiveBitrate) {
      this.bandwidthInterval = setInterval(() => {
        this.updateBandwidthStats();
      }, this.config.bandwidthWindowMs);
    }

    this.handlers.onReady?.();
  }

  /**
   * Stop the realtime stream
   */
  stop(): void {
    this.isRunning = false;

    if (this.sendInterval) {
      clearInterval(this.sendInterval);
      this.sendInterval = undefined;
    }

    if (this.jitterInterval) {
      clearInterval(this.jitterInterval);
      this.jitterInterval = undefined;
    }

    if (this.bandwidthInterval) {
      clearInterval(this.bandwidthInterval);
      this.bandwidthInterval = undefined;
    }

    // Clear queues
    const dropped = this.sendQueue.clear();
    if (dropped.length > 0) {
      this.handlers.onDrop?.(dropped, 'stream stopped');
    }
  }

  /**
   * Send a realtime message
   */
  sendMessage(
    data: Uint8Array,
    priority: StreamPriority = StreamPriority.NORMAL,
    options: { type?: string; critical?: boolean } = {}
  ): boolean {
    if (!this.isRunning) {
      return false;
    }

    const message: RealtimeMessage = {
      id: this.generateMessageId(),
      priority,
      timestamp: Date.now(),
      data,
      type: options.type,
      sequenceNumber: this.nextSendSequence++,
      critical: options.critical,
    };

    const enqueued = this.sendQueue.enqueue(message);

    if (!enqueued) {
      this.handlers.onDrop?.([message], 'queue full');
      return false;
    }

    return true;
  }

  /**
   * Receive the next message (blocking)
   */
  async receiveMessage(): Promise<RealtimeMessage | undefined> {
    return new Promise((resolve) => {
      const checkQueue = () => {
        const message = this.receiveQueue.dequeue();
        if (message) {
          resolve(message);
        } else if (!this.isRunning) {
          resolve(undefined);
        } else {
          setTimeout(checkQueue, 5);
        }
      };
      checkQueue();
    });
  }

  /**
   * Set target bitrate (for manual bitrate control)
   */
  setTargetBitrate(bitrate: number): void {
    this.bandwidthStats.currentBitrate = Math.max(
      this.config.minBitrate,
      Math.min(this.config.maxBitrate, bitrate)
    );
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  private setupStreamHandlers(): void {
    // Set up stream data handler
    const originalOnData = (this.stream as unknown as { handlers?: { onData?: (chunk: StreamChunk) => void } }).handlers?.onData;

    (this.stream as unknown as { handlers: { onData?: (chunk: StreamChunk) => void } }).handlers = {
      ...(this.stream as unknown as { handlers: { onData?: (chunk: StreamChunk) => void } }).handlers,
      onData: (chunk: StreamChunk) => {
        this.handleIncomingData(chunk);
        originalOnData?.(chunk);
      },
    };
  }

  private handleIncomingData(chunk: StreamChunk): void {
    try {
      // Parse message from chunk
      const message = this.deserializeMessage(chunk.data);

      // Track sequence number for packet loss calculation
      if (message.sequenceNumber > this.nextExpectedSequence) {
        // Packet loss detected
        const lost = message.sequenceNumber - this.nextExpectedSequence;
        this.bandwidthStats.packetLossRate =
          this.bandwidthStats.packetLossRate * 0.9 + lost * 0.1;
      }
      this.nextExpectedSequence = message.sequenceNumber + 1;

      // Calculate latency
      const latency = Date.now() - message.timestamp;
      this.latencyHistory.push(latency);
      if (this.latencyHistory.length > 100) {
        this.latencyHistory.shift();
      }

      // Add to jitter buffer
      const playoutTime = Date.now() + this.config.jitterBufferMs;
      this.jitterBuffer.push({
        message,
        receivedAt: Date.now(),
        playoutTime,
      });

      // Sort jitter buffer by sequence number
      this.jitterBuffer.sort((a, b) => a.message.sequenceNumber - b.message.sequenceNumber);
    } catch (error) {
      this.handlers.onError?.(error as Error);
    }
  }

  private processSendQueue(): void {
    if (!this.isRunning || this.sendQueue.isEmpty) {
      return;
    }

    // Check bandwidth limit
    if (this.config.adaptiveBitrate) {
      const currentBitrate = this.bandwidthStats.currentBitrate;
      const maxBytesPerInterval = (currentBitrate * this.config.targetLatencyMs) / 1000 / 2;

      let bytesSent = 0;
      while (bytesSent < maxBytesPerInterval) {
        const message = this.sendQueue.dequeue();
        if (!message) break;

        this.sendMessageToStream(message);
        bytesSent += message.data.length;
      }
    } else {
      // Send one message per interval
      const message = this.sendQueue.dequeue();
      if (message) {
        this.sendMessageToStream(message);
      }
    }

    // Remove stale messages from queue
    if (this.config.dropPolicy === DropPolicy.DROP_STALE) {
      const stale = this.sendQueue.removeStale();
      if (stale.length > 0) {
        this.handlers.onDrop?.(stale, 'stale');
      }
    }
  }

  private sendMessageToStream(message: RealtimeMessage): void {
    try {
      const data = this.serializeMessage(message);
      this.stream.send(data).catch((err) => {
        this.handlers.onError?.(err);
      });

      // Track bitrate
      this.bitrateHistory.push(data.length);
      if (this.bitrateHistory.length > 100) {
        this.bitrateHistory.shift();
      }
    } catch (error) {
      this.handlers.onError?.(error as Error);
    }
  }

  private processJitterBuffer(): void {
    if (!this.isRunning || this.jitterBuffer.length === 0) {
      return;
    }

    const now = Date.now();

    // Process messages that have reached their playout time
    while (this.jitterBuffer.length > 0) {
      const entry = this.jitterBuffer[0];

      // Wait until we have enough messages in the buffer
      if (this.jitterBuffer.length < this.jitterBufferTargetSize && entry.playoutTime > now) {
        break;
      }

      if (entry.playoutTime <= now) {
        this.jitterBuffer.shift();
        this.receiveQueue.enqueue(entry.message);
        this.handlers.onMessage?.(entry.message);
      } else {
        break;
      }
    }

    // Remove stale messages from jitter buffer
    const maxAge = this.config.maxLatencyMs * 2;
    const stale: RealtimeMessage[] = [];
    this.jitterBuffer = this.jitterBuffer.filter((entry) => {
      if (now - entry.receivedAt > maxAge && !entry.message.critical) {
        stale.push(entry.message);
        return false;
      }
      return true;
    });

    if (stale.length > 0) {
      this.handlers.onDrop?.(stale, 'jitter buffer stale');
    }
  }

  private updateBandwidthStats(): void {
    const now = Date.now();
    const windowMs = this.config.bandwidthWindowMs;

    // Calculate measured bandwidth
    if (this.bitrateHistory.length >= 2) {
      const totalBytes = this.bitrateHistory.reduce((a, b) => a + b, 0);
      this.bandwidthStats.measuredBandwidth = (totalBytes / windowMs) * 1000;
    }

    // Calculate average latency
    if (this.latencyHistory.length > 0) {
      const avgLatency =
        this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length;
      this.bandwidthStats.averageLatencyMs = avgLatency;

      // Calculate jitter (standard deviation of latency)
      const variance =
        this.latencyHistory.reduce((sum, lat) => sum + Math.pow(lat - avgLatency, 2), 0) /
        this.latencyHistory.length;
      this.bandwidthStats.jitterMs = Math.sqrt(variance);

      this.handlers.onLatencyChange?.(avgLatency);
    }

    // Calculate congestion level
    const queueUtilization = this.sendQueue.size / this.config.maxQueueSize;
    const latencyRatio = this.bandwidthStats.averageLatencyMs / this.config.targetLatencyMs;
    this.bandwidthStats.congestionLevel = Math.min(1, (queueUtilization + latencyRatio) / 2);

    // Adapt bitrate
    if (this.config.adaptiveBitrate) {
      this.adaptBitrate();
    }

    this.lastBandwidthUpdate = now;
  }

  private adaptBitrate(): void {
    const { congestionLevel, packetLossRate, measuredBandwidth } = this.bandwidthStats;
    let newBitrate = this.bandwidthStats.currentBitrate;

    if (congestionLevel > 0.7 || packetLossRate > 0.05) {
      // Decrease bitrate
      newBitrate = newBitrate * 0.8;
    } else if (congestionLevel < 0.3 && packetLossRate < 0.01) {
      // Increase bitrate
      newBitrate = newBitrate * 1.05;
    }

    // Clamp to min/max
    newBitrate = Math.max(this.config.minBitrate, Math.min(this.config.maxBitrate, newBitrate));

    if (newBitrate !== this.bandwidthStats.currentBitrate) {
      this.bandwidthStats.currentBitrate = newBitrate;
      this.handlers.onBandwidthAdapt?.(newBitrate, this.bandwidthStats);
    }
  }

  private serializeMessage(message: RealtimeMessage): Uint8Array {
    // Simple serialization: JSON header + binary data
    const header = JSON.stringify({
      id: message.id,
      priority: message.priority,
      timestamp: message.timestamp,
      type: message.type,
      sequenceNumber: message.sequenceNumber,
      critical: message.critical,
      dataLength: message.data.length,
    });

    const headerBytes = new TextEncoder().encode(header);
    const headerLength = new Uint8Array(4);
    new DataView(headerLength.buffer).setUint32(0, headerBytes.length, true);

    const result = new Uint8Array(4 + headerBytes.length + message.data.length);
    result.set(headerLength, 0);
    result.set(headerBytes, 4);
    result.set(message.data, 4 + headerBytes.length);

    return result;
  }

  private deserializeMessage(data: Uint8Array): RealtimeMessage {
    const headerLength = new DataView(data.buffer, data.byteOffset, 4).getUint32(0, true);
    const headerBytes = data.slice(4, 4 + headerLength);
    const header = JSON.parse(new TextDecoder().decode(headerBytes));

    return {
      id: header.id,
      priority: header.priority,
      timestamp: header.timestamp,
      type: header.type,
      sequenceNumber: header.sequenceNumber,
      critical: header.critical,
      data: data.slice(4 + headerLength, 4 + headerLength + header.dataLength),
    };
  }

  private generateMessageId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Realtime stream manager
 */
export class RealtimeStreamManager {
  private streams: Map<number, RealtimeStream> = new Map();
  private nextStreamId = 1;

  /**
   * Create a new realtime stream
   */
  createStream(
    baseStream: Stream,
    config?: Partial<RealtimeConfig>,
    handlers?: RealtimeStreamHandlers
  ): RealtimeStream {
    const streamId = this.nextStreamId++;
    const stream = new RealtimeStream(baseStream, config, handlers);
    this.streams.set(streamId, stream);
    return stream;
  }

  /**
   * Get a stream by ID
   */
  getStream(id: number): RealtimeStream | undefined {
    return this.streams.get(id);
  }

  /**
   * Remove a stream
   */
  removeStream(id: number): boolean {
    const stream = this.streams.get(id);
    if (stream) {
      stream.stop();
      this.streams.delete(id);
      return true;
    }
    return false;
  }

  /**
   * Get all active streams
   */
  getActiveStreams(): RealtimeStream[] {
    return Array.from(this.streams.values());
  }

  /**
   * Stop all streams
   */
  stopAll(): void {
    for (const stream of this.streams.values()) {
      stream.stop();
    }
    this.streams.clear();
  }
}

/**
 * Create a realtime stream manager
 */
export function createRealtimeStreamManager(): RealtimeStreamManager {
  return new RealtimeStreamManager();
}
