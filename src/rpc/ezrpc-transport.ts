/**
 * EzRpc TCP Transport
 *
 * Implements RpcTransport over raw TCP socket for C++ EzRpc compatibility.
 * Does NOT use length-prefixed framing - sends raw Cap'n Proto messages.
 */

import * as net from 'node:net';
import { deserializeRpcMessage, serializeRpcMessage } from './message-serializer.js';
import type { RpcMessage } from './rpc-types.js';
import type { CompressionState, RpcTransport } from './transport.js';

export interface EzRpcTransportOptions {
  connectTimeoutMs?: number;
}

/**
 * EzRpc TCP Transport
 *
 * Compatible with Cap'n Proto C++ EzRpcServer/EzRpcClient.
 * Sends raw Cap'n Proto messages without length prefix.
 */
export class EzRpcTransport implements RpcTransport {
  private socket: net.Socket | null = null;
  private messageQueue: RpcMessage[] = [];
  private receiveQueue: Array<{
    resolve: (msg: RpcMessage | null) => void;
    reject: (err: Error) => void;
  }> = [];
  private _connected = false;
  private pendingBuffer = Buffer.alloc(0);

  onClose?: (reason?: Error) => void;
  onError?: (error: Error) => void;

  constructor(
    private host: string,
    private port: number,
    private options: EzRpcTransportOptions = {}
  ) {}

  static async connect(
    host: string,
    port: number,
    options?: EzRpcTransportOptions
  ): Promise<EzRpcTransport> {
    const transport = new EzRpcTransport(host, port, options);
    await transport.doConnect();
    return transport;
  }

  get connected(): boolean {
    return this._connected && this.socket !== null && !this.socket.destroyed;
  }

  getCompressionState(): CompressionState {
    return {
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

  private doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.socket?.destroy();
        reject(new Error(`Connection timeout: failed to connect to ${this.host}:${this.port}`));
      }, this.options.connectTimeoutMs ?? 10000);

      this.socket = new net.Socket();

      this.socket.on('connect', () => {
        clearTimeout(timeout);
        this._connected = true;
        resolve();
      });

      this.socket.on('data', (data: Buffer) => {
        try {
          this.handleData(data);
        } catch (err) {
          this.onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      });

      this.socket.on('close', (hadError: boolean) => {
        const wasConnected = this._connected;
        this._connected = false;

        // Reject pending receive calls
        const error = hadError
          ? new Error('Connection closed with error')
          : new Error('Connection closed');
        this.flushReceiveQueueWithError(error);

        if (wasConnected) {
          this.onClose?.(hadError ? error : undefined);
        }
      });

      this.socket.on('error', (err: Error) => {
        clearTimeout(timeout);
        this._connected = false;
        this.flushReceiveQueueWithError(err);
        this.onError?.(err);
        reject(err);
      });

      this.socket.connect(this.port, this.host);
    });
  }

  private handleData(data: Buffer): void {
    // For EzRpc, we assume each 'data' event contains exactly one message
    // This is how KJ async I/O typically works

    // If we have pending data, append it
    if (this.pendingBuffer.length > 0) {
      this.pendingBuffer = Buffer.concat([this.pendingBuffer, data]);
    } else {
      this.pendingBuffer = Buffer.from(data);
    }

    // Try to parse messages from the buffer
    // Cap'n Proto messages have an 8-byte header we can use to determine size
    while (this.pendingBuffer.length >= 8) {
      const segmentCount = this.pendingBuffer.readUInt32LE(0) + 1;
      const firstSegmentSize = this.pendingBuffer.readUInt32LE(4);

      // Calculate total message size
      // Header: 8 bytes
      // Segment sizes: (segmentCount - 1) * 4 bytes (if segmentCount > 1)
      // Data: sum of all segment sizes * 8 bytes
      let headerSize = 8;
      if (segmentCount > 1) {
        headerSize += (segmentCount - 1) * 4;
      }

      // For now, assume single segment
      const messageSize = headerSize + firstSegmentSize * 8;

      if (this.pendingBuffer.length < messageSize) {
        // Not enough data yet
        break;
      }

      // Extract the message
      const messageData = this.pendingBuffer.subarray(0, messageSize);
      this.pendingBuffer = this.pendingBuffer.subarray(messageSize);

      try {
        const message = deserializeRpcMessage(new Uint8Array(messageData));
        if (this.receiveQueue.length > 0) {
          const { resolve } = this.receiveQueue.shift()!;
          resolve(message);
        } else {
          this.messageQueue.push(message);
        }
      } catch (err) {
        this.onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  async send(message: RpcMessage): Promise<void> {
    if (!this.connected) {
      throw new Error(`Cannot send: socket not connected to ${this.host}:${this.port}`);
    }

    const data = serializeRpcMessage(message);

    return new Promise((resolve, reject) => {
      this.socket!.write(Buffer.from(data), (err) => {
        if (err) {
          reject(new Error(`Failed to send message: ${err.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  async receive(): Promise<RpcMessage | null> {
    // 先检查队列中的消息
    if (this.messageQueue.length > 0) {
      return this.messageQueue.shift()!;
    }

    // 如果已断开连接，返回 null
    if (!this.connected) {
      return null;
    }

    // 等待下一条消息
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        // 从队列中移除自己
        const index = this.receiveQueue.findIndex((item) => item.resolve === resolve);
        if (index !== -1) {
          this.receiveQueue.splice(index, 1);
        }
        reject(new Error('Receive timeout'));
      }, 30000); // 30 秒超时

      this.receiveQueue.push({
        resolve: (msg) => {
          clearTimeout(timeoutId);
          resolve(msg);
        },
        reject: (err) => {
          clearTimeout(timeoutId);
          reject(err);
        },
      });
    });
  }

  close(reason?: Error): void {
    this._connected = false;
    this.socket?.end();
    this.socket?.destroy();
    this.flushReceiveQueue(null);
    this.onClose?.(reason);
  }

  private flushReceiveQueueWithError(error: Error): void {
    while (this.receiveQueue.length > 0) {
      const { reject } = this.receiveQueue.shift()!;
      reject(error);
    }
  }

  private flushReceiveQueue(value: RpcMessage | null): void {
    while (this.receiveQueue.length > 0) {
      const { resolve } = this.receiveQueue.shift()!;
      resolve(value);
    }
  }
}
