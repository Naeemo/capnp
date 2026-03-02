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
}

/** Options for WebSocket transport */
export interface WebSocketTransportOptions {
  /** Binary type for WebSocket ('arraybuffer' or 'blob') */
  binaryType?: 'arraybuffer' | 'blob';

  /** Connection timeout in milliseconds */
  connectTimeoutMs?: number;
}
