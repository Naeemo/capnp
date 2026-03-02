/**
 * WebSocket Transport Implementation
 *
 * Implements RpcTransport over WebSocket for browser and Node.js compatibility.
 */

import { deserializeRpcMessage, serializeRpcMessage } from './message-serializer.js';
import type { RpcMessage } from './rpc-types.js';
import type { RpcTransport, WebSocketTransportOptions } from './transport.js';

// Message framing: length-prefixed binary messages
// Format: [4 bytes: message length (little-endian)] [N bytes: message data]

export class WebSocketTransport implements RpcTransport {
  private ws: WebSocket | null = null;
  private messageQueue: RpcMessage[] = [];
  private receiveQueue: Array<{
    resolve: (msg: RpcMessage | null) => void;
    reject: (err: Error) => void;
  }> = [];
  private _connected = false;
  private pendingBuffer: Uint8Array | null = null;
  private pendingLength = 0;

  onClose?: (reason?: Error) => void;
  onError?: (error: Error) => void;

  constructor(
    url: string,
    private options: WebSocketTransportOptions = {}
  ) {
    this.connect(url);
  }

  static async connect(
    url: string,
    options?: WebSocketTransportOptions
  ): Promise<WebSocketTransport> {
    const transport = new WebSocketTransport(url, options);
    await transport.waitForConnection();
    return transport;
  }

  static fromWebSocket(ws: WebSocket, options?: WebSocketTransportOptions): WebSocketTransport {
    const transport = new WebSocketTransport('internal', options);
    transport.attachWebSocket(ws);
    return transport;
  }

  get connected(): boolean {
    return this._connected;
  }

  private connect(url: string): void {
    this.ws = new WebSocket(url);
    this.ws.binaryType = this.options.binaryType ?? 'arraybuffer';

    this.ws.onopen = () => {
      this._connected = true;
    };

    this.ws.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    this.ws.onclose = () => {
      this._connected = false;
      this.flushReceiveQueue(null);
      this.onClose?.();
    };

    this.ws.onerror = (_error) => {
      const err = new Error('WebSocket error');
      this.onError?.(err);
    };
  }

  private attachWebSocket(ws: WebSocket): void {
    this.ws = ws;
    this.ws.binaryType = this.options.binaryType ?? 'arraybuffer';
    this._connected = ws.readyState === WebSocket.OPEN;

    this.ws.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    this.ws.onclose = () => {
      this._connected = false;
      this.flushReceiveQueue(null);
      this.onClose?.();
    };

    this.ws.onerror = (_error) => {
      const err = new Error('WebSocket error');
      this.onError?.(err);
    };
  }

  private waitForConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this._connected) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, this.options.connectTimeoutMs ?? 10000);

      const checkConnection = () => {
        if (this._connected) {
          clearTimeout(timeout);
          resolve();
        } else if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
          clearTimeout(timeout);
          reject(new Error('Connection failed'));
        } else {
          setTimeout(checkConnection, 10);
        }
      };

      checkConnection();
    });
  }

  private handleMessage(data: ArrayBuffer | Blob): void {
    // For Phase 1, we'll implement basic message handling
    // Full implementation would parse the Cap'n Proto message
    if (data instanceof ArrayBuffer) {
      this.processBinaryMessage(new Uint8Array(data));
    } else {
      // Blob handling for browser compatibility
      const reader = new FileReader();
      reader.onload = () => {
        this.processBinaryMessage(new Uint8Array(reader.result as ArrayBuffer));
      };
      reader.readAsArrayBuffer(data);
    }
  }

  private processBinaryMessage(data: Uint8Array): void {
    // Length-prefixed framing
    let offset = 0;

    while (offset < data.length) {
      if (this.pendingBuffer === null) {
        // Start of new message
        if (offset + 4 > data.length) {
          // Not enough data for length header
          this.pendingBuffer = data.slice(offset);
          this.pendingLength = -1;
          break;
        }

        const length = new DataView(data.buffer, data.byteOffset + offset, 4).getUint32(0, true);
        offset += 4;

        if (offset + length > data.length) {
          // Not enough data for full message
          this.pendingBuffer = data.slice(offset - 4);
          this.pendingLength = length;
          break;
        }

        const messageData = data.slice(offset, offset + length);
        offset += length;
        this.handleRpcMessage(messageData);
      } else {
        // Continuation of pending message
        if (this.pendingLength === -1) {
          // Still need length header
          const needed = 4 - this.pendingBuffer.length;
          if (data.length - offset < needed) {
            this.pendingBuffer = new Uint8Array([...this.pendingBuffer, ...data.slice(offset)]);
            break;
          }

          const tempBuffer = new Uint8Array(this.pendingBuffer.length + needed);
          tempBuffer.set(this.pendingBuffer);
          tempBuffer.set(data.slice(offset, offset + needed), this.pendingBuffer.length);

          this.pendingLength = new DataView(tempBuffer.buffer, 0, 4).getUint32(0, true);
          this.pendingBuffer = null;
          offset += needed;
        } else {
          // Have length, need message body
          const needed = this.pendingLength - this.pendingBuffer.length;
          if (data.length - offset < needed) {
            this.pendingBuffer = new Uint8Array([...this.pendingBuffer, ...data.slice(offset)]);
            break;
          }

          const messageData = new Uint8Array(this.pendingLength);
          messageData.set(this.pendingBuffer);
          messageData.set(data.slice(offset, offset + needed), this.pendingBuffer.length);

          offset += needed;
          this.pendingBuffer = null;
          this.handleRpcMessage(messageData);
        }
      }
    }
  }

  private handleRpcMessage(data: Uint8Array): void {
    // Parse the RPC message from binary data
    // For Phase 1, this is a placeholder - full implementation would deserialize
    const message = this.deserializeMessage(data);

    // Fulfill pending receive
    if (this.receiveQueue.length > 0) {
      const { resolve } = this.receiveQueue.shift()!;
      resolve(message);
    } else {
      this.messageQueue.push(message);
    }
  }

  private deserializeMessage(data: Uint8Array): RpcMessage {
    return deserializeRpcMessage(data);
  }

  private serializeMessage(message: RpcMessage): Uint8Array {
    return serializeRpcMessage(message);
  }

  async send(message: RpcMessage): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const data = this.serializeMessage(message);
    const frame = new Uint8Array(4 + data.length);
    new DataView(frame.buffer).setUint32(0, data.length, true);
    frame.set(data, 4);

    this.ws.send(frame);
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
    this.ws?.close();
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
