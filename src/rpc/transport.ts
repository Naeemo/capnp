/**
 * RpcTransport Interface
 *
 * Abstract transport layer for Cap'n Proto RPC.
 * Implementations can use WebSocket, TCP, or other transports.
 */

import type { RpcMessage } from './rpc-types.js';

export interface RpcTransport {
  /** Whether the transport is currently connected */
  readonly connected: boolean;

  /** Send a message to the peer */
  send(message: RpcMessage): Promise<void>;

  /** Receive the next message from the peer (returns null when closed) */
  receive(): Promise<RpcMessage | null>;

  /** Close the transport connection */
  close(reason?: Error): void;

  /** Event handler called when the transport is closed */
  onClose?: (reason?: Error) => void;

  /** Event handler called when an error occurs */
  onError?: (error: Error) => void;

  /** Get current compression state */
  getCompressionState(): CompressionState;
}

/** Compression configuration options */
export interface CompressionOptions {
  /** Enable compression (default: true) */
  enabled?: boolean;

  /** Compression algorithm (default: 'lz4') */
  algorithm?: 'lz4' | 'none';

  /** Minimum message size to compress in bytes (default: 256) */
  thresholdBytes?: number;

  /** Compression level (algorithm-specific, default: 1) */
  level?: number;
}

/** Current compression state */
export interface CompressionState {
  /** Whether compression is currently enabled */
  enabled: boolean;

  /** Compression algorithm in use */
  algorithm: string;

  /** Total bytes sent (compressed) */
  bytesSent: number;

  /** Total bytes received (compressed) */
  bytesReceived: number;

  /** Total uncompressed bytes sent */
  uncompressedBytesSent: number;

  /** Total uncompressed bytes received */
  uncompressedBytesReceived: number;

  /** Number of messages compressed */
  messagesCompressed: number;

  /** Number of messages decompressed */
  messagesDecompressed: number;
}

/** Options for WebSocket transport */
export interface WebSocketTransportOptions {
  /** Binary type for WebSocket ('arraybuffer' or 'blob') */
  binaryType?: 'arraybuffer' | 'blob';

  /** Connection timeout in milliseconds */
  connectTimeoutMs?: number;

  /** Compression options */
  compression?: CompressionOptions;
}

/** Options for TCP transport */
export interface TcpTransportOptions {
  /** Connection timeout in milliseconds */
  connectTimeoutMs?: number;

  /** Compression options */
  compression?: CompressionOptions;
}
