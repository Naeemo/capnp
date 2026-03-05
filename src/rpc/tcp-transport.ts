/**
 * TCP Transport Implementation for Node.js
 *
 * Implements RpcTransport over raw TCP socket for C++ interop testing.
 * This allows direct communication with the official Cap'n Proto C++ implementation.
 */

import * as net from 'node:net';
import * as lz4 from 'lz4';
import { deserializeRpcMessage, serializeRpcMessage } from './message-serializer.js';
import type { RpcMessage } from './rpc-types.js';
import type { CompressionOptions, CompressionState, RpcTransport } from './transport.js';

export interface TcpTransportOptions {
  /** Connection timeout in milliseconds */
  connectTimeoutMs?: number;

  /** Compression options */
  compression?: CompressionOptions;
}

/** Capability negotiation message */
interface CapabilityNegotiation {
  type: 'capabilities';
  supportsLz4: boolean;
  version: number;
}

/** Compression frame header */
interface CompressionFrame {
  /** Original uncompressed size */
  originalSize: number;
  /** Compressed size (0 if not compressed) */
  compressedSize: number;
  /** Compression algorithm: 0=none, 1=lz4 */
  algorithm: number;
}

// Frame constants
const FRAME_MAGIC = 0x4C5A3443; // 'LZ4C' in hex
const ALGORITHM_NONE = 0;
const ALGORITHM_LZ4 = 1;
const CAPABILITY_VERSION = 1;
const DEFAULT_COMPRESSION_THRESHOLD = 256;

/**
 * TCP Transport for Cap'n Proto RPC
 *
 * Uses length-prefixed binary message framing compatible with Cap'n Proto C++ implementation.
 * Format: [4 bytes: message length (little-endian)] [N bytes: message data]
 * 
 * With compression support:
 * - Connection establishment includes capability negotiation
 * - Messages larger than threshold are automatically compressed
 * - Frame header indicates compression algorithm used
 */
export class TcpTransport implements RpcTransport {
  private socket: net.Socket | null = null;
  private messageQueue: RpcMessage[] = [];
  private receiveQueue: Array<{
    resolve: (msg: RpcMessage | null) => void;
    reject: (err: Error) => void;
  }> = [];
  private _connected = false;
  private pendingBuffer: Buffer = Buffer.alloc(0);
  private pendingLength = 0;
  private hasPendingLength = false;

  // Compression state
  private compressionConfig: Required<CompressionOptions>;
  private localSupportsLz4 = false;
  private remoteSupportsLz4 = false;
  private compressionEnabled = false;
  private compressionState: CompressionState;
  private negotiationComplete = false;

  onClose?: (reason?: Error) => void;
  onError?: (error: Error) => void;

  constructor(
    private host: string,
    private port: number,
    private options: TcpTransportOptions = {}
  ) {
    // Set default compression options
    this.compressionConfig = {
      enabled: options.compression?.enabled ?? true,
      algorithm: options.compression?.algorithm ?? 'lz4',
      thresholdBytes: options.compression?.thresholdBytes ?? DEFAULT_COMPRESSION_THRESHOLD,
      level: options.compression?.level ?? 1,
    };

    // Local LZ4 support
    this.localSupportsLz4 = this.compressionConfig.enabled && this.compressionConfig.algorithm === 'lz4';

    // Initialize compression state
    this.compressionState = {
      enabled: false,
      algorithm: 'none',
      bytesSent: 0,
      bytesReceived: 0,
      uncompressedBytesSent: 0,
      uncompressedBytesReceived: 0,
      messagesCompressed: 0,
      messagesDecompressed: 0,
    };
  }

  static async connect(
    host: string,
    port: number,
    options?: TcpTransportOptions
  ): Promise<TcpTransport> {
    const transport = new TcpTransport(host, port, options);
    await transport.connect();
    return transport;
  }

  static fromSocket(socket: net.Socket, options?: TcpTransportOptions): TcpTransport {
    const transport = new TcpTransport('', 0, options);
    transport.attachSocket(socket);
    return transport;
  }

  get connected(): boolean {
    return this._connected && this.socket?.readyState === 'open';
  }

  getCompressionState(): CompressionState {
    return { ...this.compressionState };
  }

  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.socket?.destroy();
        reject(new Error('Connection timeout'));
      }, this.options.connectTimeoutMs ?? 10000);

      this.socket = new net.Socket();

      this.socket.on('connect', async () => {
        clearTimeout(timeout);
        this._connected = true;
        
        // Perform capability negotiation
        try {
          await this.performCapabilityNegotiation();
          resolve();
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });

      this.socket.on('data', (data: Buffer) => {
        this.handleData(data);
      });

      this.socket.on('close', (hadError: boolean) => {
        this._connected = false;
        this.flushReceiveQueue(null);
        if (hadError) {
          this.onClose?.(new Error('Connection closed with error'));
        } else {
          this.onClose?.();
        }
      });

      this.socket.on('error', (err: Error) => {
        clearTimeout(timeout);
        this._connected = false;
        this.onError?.(err);
        reject(err);
      });

      this.socket.on('end', () => {
        this._connected = false;
      });

      this.socket.connect(this.port, this.host);
    });
  }

  private attachSocket(socket: net.Socket): void {
    this.socket = socket;
    this._connected = socket.readyState === 'open';

    socket.on('data', (data: Buffer) => {
      this.handleData(data);
    });

    socket.on('close', (hadError: boolean) => {
      this._connected = false;
      this.flushReceiveQueue(null);
      if (hadError) {
        this.onClose?.(new Error('Connection closed with error'));
      } else {
        this.onClose?.();
      }
    });

    socket.on('error', (err: Error) => {
      this._connected = false;
      this.onError?.(err);
    });

    socket.on('end', () => {
      this._connected = false;
    });

    // Perform capability negotiation for server-side connections
    if (this._connected) {
      this.performCapabilityNegotiation().catch((err) => {
        this.onError?.(err instanceof Error ? err : new Error(String(err)));
      });
    }
  }

  /**
   * Perform capability negotiation with the remote peer
   */
  private async performCapabilityNegotiation(): Promise<void> {
    if (!this.socket) {
      throw new Error('Socket not connected');
    }

    const isServer = this.host === '' && this.port === 0;

    if (isServer) {
      // Server: wait for client's capabilities
      const clientCaps = await this.readCapabilityNegotiation();
      this.remoteSupportsLz4 = clientCaps.supportsLz4;
      
      // Send our capabilities
      await this.sendCapabilityNegotiation();
    } else {
      // Client: send our capabilities first
      await this.sendCapabilityNegotiation();
      
      // Wait for server's capabilities
      const serverCaps = await this.readCapabilityNegotiation();
      this.remoteSupportsLz4 = serverCaps.supportsLz4;
    }

    // Determine if compression can be enabled
    this.compressionEnabled = this.localSupportsLz4 && this.remoteSupportsLz4;
    this.compressionState.enabled = this.compressionEnabled;
    this.compressionState.algorithm = this.compressionEnabled ? 'lz4' : 'none';
    this.negotiationComplete = true;
  }

  /**
   * Send capability negotiation message
   */
  private async sendCapabilityNegotiation(): Promise<void> {
    const caps: CapabilityNegotiation = {
      type: 'capabilities',
      supportsLz4: this.localSupportsLz4,
      version: CAPABILITY_VERSION,
    };

    const data = Buffer.from(JSON.stringify(caps), 'utf-8');
    const frame = Buffer.allocUnsafe(4 + data.length);
    frame.writeUInt32LE(data.length, 0);
    frame.set(data, 4);

    return new Promise((resolve, reject) => {
      this.socket!.write(frame, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Read capability negotiation message
   */
  private async readCapabilityNegotiation(): Promise<CapabilityNegotiation> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Capability negotiation timeout'));
      }, 5000);

      const checkBuffer = () => {
        if (this.pendingBuffer.length < 4) {
          // Wait for more data
          const originalHandler = this.socket!.listenerCount('data') > 0;
          const dataHandler = () => {
            this.socket!.off('data', dataHandler);
            checkBuffer();
          };
          this.socket!.once('data', dataHandler);
          return;
        }

        const length = this.pendingBuffer.readUInt32LE(0);
        if (this.pendingBuffer.length < 4 + length) {
          // Wait for more data
          const dataHandler = () => {
            this.socket!.off('data', dataHandler);
            checkBuffer();
          };
          this.socket!.once('data', dataHandler);
          return;
        }

        clearTimeout(timeout);

        // Extract capability data
        const capsData = this.pendingBuffer.subarray(4, 4 + length);
        this.pendingBuffer = this.pendingBuffer.subarray(4 + length);

        try {
          const caps: CapabilityNegotiation = JSON.parse(capsData.toString('utf-8'));
          resolve(caps);
        } catch (err) {
          reject(new Error(`Failed to parse capability negotiation: ${err}`));
        }
      };

      checkBuffer();
    });
  }

  private handleData(data: Buffer): void {
    // Append new data to pending buffer
    this.pendingBuffer = Buffer.concat([this.pendingBuffer, data]);

    // Process complete messages
    while (this.pendingBuffer.length >= 4) {
      if (!this.hasPendingLength) {
        // Read message length (4 bytes, little-endian)
        this.pendingLength = this.pendingBuffer.readUInt32LE(0);
        this.hasPendingLength = true;

        // Sanity check: max message size 64MB
        if (this.pendingLength > 64 * 1024 * 1024) {
          this.onError?.(new Error(`Message too large: ${this.pendingLength} bytes`));
          this.close(new Error('Message too large'));
          return;
        }
      }

      // Check if we have the full message
      const totalLength = 4 + this.pendingLength;
      if (this.pendingBuffer.length < totalLength) {
        break; // Wait for more data
      }

      // Check if this is a compressed frame (magic number)
      const magic = this.pendingBuffer.readUInt32LE(4);
      const isCompressedFrame = magic === FRAME_MAGIC && this.negotiationComplete;

      if (isCompressedFrame) {
        // Compressed frame format: [4 bytes: length] [4 bytes: magic] [12 bytes: header] [N bytes: data]
        if (this.pendingLength < 16) {
          this.onError?.(new Error('Invalid compressed frame'));
          this.close(new Error('Invalid compressed frame'));
          return;
        }

        const headerOffset = 4;
        const originalSize = this.pendingBuffer.readUInt32LE(headerOffset + 4);
        const compressedSize = this.pendingBuffer.readUInt32LE(headerOffset + 8);
        const algorithm = this.pendingBuffer.readUInt32LE(headerOffset + 12);

        const frameTotalLength = 4 + 16 + compressedSize;
        if (this.pendingBuffer.length < frameTotalLength) {
          break; // Wait for more data
        }

        // Extract compressed data
        const compressedData = this.pendingBuffer.subarray(headerOffset + 16, frameTotalLength);
        this.pendingBuffer = this.pendingBuffer.subarray(frameTotalLength);
        this.hasPendingLength = false;

        // Decompress
        try {
          let messageData: Uint8Array;
          if (algorithm === ALGORITHM_LZ4) {
            messageData = lz4.decode(compressedData);
            this.compressionState.messagesDecompressed++;
            this.compressionState.bytesReceived += compressedData.length;
            this.compressionState.uncompressedBytesReceived += messageData.length;
          } else {
            messageData = new Uint8Array(compressedData);
            this.compressionState.bytesReceived += compressedData.length;
            this.compressionState.uncompressedBytesReceived += compressedData.length;
          }

          const message = deserializeRpcMessage(messageData);
          this.handleRpcMessage(message);
        } catch (err) {
          this.onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      } else {
        // Standard message format
        const messageData = this.pendingBuffer.subarray(4, totalLength);
        this.pendingBuffer = this.pendingBuffer.subarray(totalLength);
        this.hasPendingLength = false;

        // Parse and handle the message
        try {
          const message = deserializeRpcMessage(new Uint8Array(messageData));
          this.handleRpcMessage(message);
        } catch (err) {
          this.onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      }
    }
  }

  private handleRpcMessage(message: RpcMessage): void {
    if (this.receiveQueue.length > 0) {
      const { resolve } = this.receiveQueue.shift()!;
      resolve(message);
    } else {
      this.messageQueue.push(message);
    }
  }

  async send(message: RpcMessage): Promise<void> {
    if (!this.socket || this.socket.readyState !== 'open') {
      throw new Error('Socket not connected');
    }

    if (!this.negotiationComplete) {
      throw new Error('Capability negotiation not complete');
    }

    const data = serializeRpcMessage(message);
    
    // Decide whether to compress
    const shouldCompress = this.compressionEnabled && data.length >= this.compressionConfig.thresholdBytes;

    let frame: Buffer;

    if (shouldCompress) {
      // Compress the data
      const compressed = lz4.encode(Buffer.from(data), { 
        blockMaxSize: this.compressionConfig.level 
      });
      
      // Build compressed frame: [4 bytes: length] [4 bytes: magic] [4 bytes: original] [4 bytes: compressed] [4 bytes: algo] [N bytes: compressed data]
      const frameLength = 16 + compressed.length;
      frame = Buffer.allocUnsafe(4 + frameLength);
      frame.writeUInt32LE(frameLength, 0);
      frame.writeUInt32LE(FRAME_MAGIC, 4);
      frame.writeUInt32LE(data.length, 8);
      frame.writeUInt32LE(compressed.length, 12);
      frame.writeUInt32LE(ALGORITHM_LZ4, 16);
      frame.set(compressed, 20);

      // Update stats
      this.compressionState.bytesSent += compressed.length;
      this.compressionState.uncompressedBytesSent += data.length;
      this.compressionState.messagesCompressed++;
    } else {
      // Standard frame: [4 bytes: length] [N bytes: data]
      frame = Buffer.allocUnsafe(4 + data.length);
      frame.writeUInt32LE(data.length, 0);
      frame.set(data, 4);

      // Update stats
      this.compressionState.bytesSent += data.length;
      this.compressionState.uncompressedBytesSent += data.length;
    }

    return new Promise((resolve, reject) => {
      this.socket!.write(frame, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async receive(): Promise<RpcMessage | null> {
    // Check queued messages first
    if (this.messageQueue.length > 0) {
      return this.messageQueue.shift()!;
    }

    // If closed, return null
    if (!this._connected) {
      return null;
    }

    // Wait for next message
    return new Promise((resolve, reject) => {
      this.receiveQueue.push({ resolve, reject });
    });
  }

  close(reason?: Error): void {
    this._connected = false;
    this.socket?.end();
    this.socket?.destroy();
    this.flushReceiveQueue(null);
    this.onClose?.(reason);
  }

  private flushReceiveQueue(value: RpcMessage | null): void {
    while (this.receiveQueue.length > 0) {
      const { resolve } = this.receiveQueue.shift()!;
      resolve(value);
    }
  }
}
