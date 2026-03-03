/**
 * EzRpc TCP Transport
 *
 * Implements RpcTransport over raw TCP socket for C++ EzRpc compatibility.
 * Does NOT use length-prefixed framing - sends raw Cap'n Proto messages.
 */

import * as net from 'node:net';
import { deserializeRpcMessage, serializeRpcMessage } from './message-serializer.js';
import type { RpcMessage } from './rpc-types.js';
import type { RpcTransport } from './transport.js';

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
    return this._connected && this.socket?.readyState === 'open';
  }

  private doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.socket?.destroy();
        reject(new Error('Connection timeout'));
      }, this.options.connectTimeoutMs ?? 10000);

      this.socket = new net.Socket();

      this.socket.on('connect', () => {
        clearTimeout(timeout);
        this._connected = true;
        resolve();
      });

      this.socket.on('data', (data: Buffer) => {
        this.handleData(data);
      });

      this.socket.on('close', () => {
        this._connected = false;
        this.flushReceiveQueue(null);
        this.onClose?.();
      });

      this.socket.on('error', (err: Error) => {
        clearTimeout(timeout);
        this._connected = false;
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
      this.pendingBuffer = data;
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
    if (!this.socket || this.socket.readyState !== 'open') {
      throw new Error('Socket not connected');
    }

    const data = serializeRpcMessage(message);

    return new Promise((resolve, reject) => {
      this.socket!.write(Buffer.from(data), (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async receive(): Promise<RpcMessage | null> {
    if (this.messageQueue.length > 0) {
      return this.messageQueue.shift()!;
    }

    if (!this._connected) {
      return null;
    }

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
