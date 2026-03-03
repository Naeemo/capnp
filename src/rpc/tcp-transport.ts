/**
 * TCP Transport Implementation for Node.js
 *
 * Implements RpcTransport over raw TCP socket for C++ interop testing.
 * This allows direct communication with the official Cap'n Proto C++ implementation.
 */

import * as net from 'node:net';
import { deserializeRpcMessage, serializeRpcMessage } from './message-serializer.js';
import type { RpcMessage } from './rpc-types.js';
import type { RpcTransport } from './transport.js';

export interface TcpTransportOptions {
  /** Connection timeout in milliseconds */
  connectTimeoutMs?: number;
}

/**
 * TCP Transport for Cap'n Proto RPC
 *
 * Uses length-prefixed binary message framing compatible with Cap'n Proto C++ implementation.
 * Format: [4 bytes: message length (little-endian)] [N bytes: message data]
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

  onClose?: (reason?: Error) => void;
  onError?: (error: Error) => void;

  constructor(
    private host: string,
    private port: number,
    private options: TcpTransportOptions = {}
  ) {}

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

  private connect(): Promise<void> {
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

      // Extract message data
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

    const data = serializeRpcMessage(message);
    const frame = Buffer.allocUnsafe(4 + data.length);
    frame.writeUInt32LE(data.length, 0);
    frame.set(data, 4);

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
