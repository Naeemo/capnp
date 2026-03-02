/**
 * Connection Manager
 *
 * Manages multiple RPC connections for Level 3 RPC (Three-way introductions).
 * Handles connection pooling, automatic connection establishment, and routing
 * of messages between vats.
 *
 * Level 3 RPC allows capabilities to be passed between vats that don't have
 * a direct connection, and enables those vats to form direct connections.
 */

import type { RpcConnection, RpcConnectionOptions } from './rpc-connection.js';
import type { RpcTransport } from './transport.js';
import type { RecipientId, ThirdPartyCapId, ProvisionId } from './rpc-types.js';

/** Unique identifier for a vat */
export interface VatId {
  /** The raw vat identifier */
  id: Uint8Array;
}

/** Connection metadata */
export interface ConnectionInfo {
  /** The connection instance */
  connection: RpcConnection;
  /** The vat ID of the remote peer */
  remoteVatId: VatId;
  /** When the connection was established */
  establishedAt: Date;
  /** Last activity timestamp */
  lastActivity: Date;
  /** Connection state */
  state: 'connecting' | 'connected' | 'closing' | 'closed';
}

/** Pending provision waiting for acceptance */
export interface PendingProvision {
  /** Unique provision ID */
  provisionId: ProvisionId;
  /** The vat ID of the intended recipient */
  recipientId: VatId;
  /** The capability being provided */
  targetExportId: number;
  /** When the provision was created */
  createdAt: Date;
  /** Question ID from the Provide message */
  questionId: number;
  /** Whether this provision is embargoed (for cycle breaking) */
  embargoed: boolean;
}

/** Options for ConnectionManager */
export interface ConnectionManagerOptions {
  /** This vat's own ID */
  selfVatId: VatId;
  /** Factory function to create connections */
  connectionFactory: (vatId: VatId, address?: string) => Promise<RpcTransport>;
  /** Default connection options */
  connectionOptions?: RpcConnectionOptions;
  /** Maximum number of concurrent connections */
  maxConnections?: number;
  /** Connection idle timeout in milliseconds */
  idleTimeoutMs?: number;
  /** Whether to automatically establish connections to third parties */
  autoConnect?: boolean;
}

/**
 * ConnectionManager manages multiple RPC connections for Level 3 RPC.
 *
 * Key responsibilities:
 * 1. Maintain a pool of connections to other vats
 * 2. Handle automatic connection establishment for third-party capabilities
 * 3. Manage pending provisions (capabilities waiting to be picked up)
 * 4. Route messages to the appropriate connection
 * 5. Handle connection lifecycle (connect, disconnect, reconnect)
 */
export class ConnectionManager {
  private options: ConnectionManagerOptions;
  private connections = new Map<string, ConnectionInfo>();
  private pendingProvisions = new Map<string, PendingProvision>();
  private connectionPromises = new Map<string, Promise<RpcConnection>>();

  constructor(options: ConnectionManagerOptions) {
    this.options = {
      maxConnections: 100,
      idleTimeoutMs: 300000, // 5 minutes
      autoConnect: true,
      ...options,
    };
  }

  // ========================================================================================
  // Connection Management
  // ========================================================================================

  /**
   * Register an existing connection with the manager.
   * This is called when a connection is established (either inbound or outbound).
   */
  registerConnection(vatId: VatId, connection: RpcConnection): ConnectionInfo {
    const vatIdKey = this.vatIdToKey(vatId);
    
    const info: ConnectionInfo = {
      connection,
      remoteVatId: vatId,
      establishedAt: new Date(),
      lastActivity: new Date(),
      state: 'connected',
    };

    this.connections.set(vatIdKey, info);
    
    // Set up cleanup on connection close
    // Note: The connection's onClose handler should be set by the caller
    
    return info;
  }

  /**
   * Get or establish a connection to a vat.
   * If autoConnect is enabled and no connection exists, a new one will be created.
   */
  async getConnection(vatId: VatId): Promise<RpcConnection | undefined> {
    const vatIdKey = this.vatIdToKey(vatId);
    
    // Check for existing connection
    const existing = this.connections.get(vatIdKey);
    if (existing && existing.state === 'connected') {
      existing.lastActivity = new Date();
      return existing.connection;
    }

    // Check for in-progress connection
    const pending = this.connectionPromises.get(vatIdKey);
    if (pending) {
      return pending;
    }

    // Auto-connect if enabled
    if (this.options.autoConnect) {
      return this.establishConnection(vatId);
    }

    return undefined;
  }

  /**
   * Establish a new connection to a vat.
   */
  async establishConnection(vatId: VatId, address?: string): Promise<RpcConnection> {
    const vatIdKey = this.vatIdToKey(vatId);
    
    // Check if already connecting
    if (this.connectionPromises.has(vatIdKey)) {
      return this.connectionPromises.get(vatIdKey)!;
    }

    // Create connection promise
    const connectPromise = this.doEstablishConnection(vatId, address);
    this.connectionPromises.set(vatIdKey, connectPromise);

    try {
      const connection = await connectPromise;
      return connection;
    } finally {
      this.connectionPromises.delete(vatIdKey);
    }
  }

  private async doEstablishConnection(vatId: VatId, address?: string): Promise<RpcConnection> {
    const { RpcConnection } = await import('./rpc-connection.js');
    
    // Create transport using the factory
    const transport = await this.options.connectionFactory(vatId, address);
    
    // Create and start the connection
    const connection = new RpcConnection(transport, this.options.connectionOptions);
    await connection.start();
    
    // Register the connection
    this.registerConnection(vatId, connection);
    
    return connection;
  }

  /**
   * Close a connection to a vat.
   */
  async closeConnection(vatId: VatId): Promise<void> {
    const vatIdKey = this.vatIdToKey(vatId);
    const info = this.connections.get(vatIdKey);
    
    if (info) {
      info.state = 'closing';
      await info.connection.stop();
      this.connections.delete(vatIdKey);
    }
  }

  /**
   * Close all connections.
   */
  async closeAll(): Promise<void> {
    const closePromises: Promise<void>[] = [];
    
    for (const [vatIdKey, info] of this.connections) {
      info.state = 'closing';
      closePromises.push(
        info.connection.stop().catch(() => {
          // Ignore errors during shutdown
        })
      );
    }
    
    await Promise.all(closePromises);
    this.connections.clear();
    this.pendingProvisions.clear();
  }

  // ========================================================================================
  // Provision Management (for Provide/Accept)
  // ========================================================================================

  /**
   * Create a pending provision for a third-party capability.
   * Called when we receive a Provide message.
   */
  createPendingProvision(
    provisionId: ProvisionId,
    recipientId: VatId,
    targetExportId: number,
    questionId: number,
    embargoed: boolean
  ): PendingProvision {
    const provisionKey = this.provisionIdToKey(provisionId);
    
    const provision: PendingProvision = {
      provisionId,
      recipientId,
      targetExportId,
      questionId,
      createdAt: new Date(),
      embargoed,
    };

    this.pendingProvisions.set(provisionKey, provision);
    return provision;
  }

  /**
   * Get a pending provision by ID.
   */
  getPendingProvision(provisionId: ProvisionId): PendingProvision | undefined {
    const provisionKey = this.provisionIdToKey(provisionId);
    return this.pendingProvisions.get(provisionKey);
  }

  /**
   * Remove a pending provision (when it's been accepted or expired).
   */
  removePendingProvision(provisionId: ProvisionId): boolean {
    const provisionKey = this.provisionIdToKey(provisionId);
    return this.pendingProvisions.delete(provisionKey);
  }

  /**
   * Find provisions for a specific recipient.
   */
  findProvisionsForRecipient(recipientId: VatId): PendingProvision[] {
    const recipientKey = this.vatIdToKey(recipientId);
    const result: PendingProvision[] = [];
    
    for (const provision of this.pendingProvisions.values()) {
      if (this.vatIdToKey(provision.recipientId) === recipientKey) {
        result.push(provision);
      }
    }
    
    return result;
  }

  /**
   * Clean up expired provisions.
   */
  cleanupExpiredProvisions(maxAgeMs: number = 300000): number {
    const now = Date.now();
    let removed = 0;
    
    for (const [key, provision] of this.pendingProvisions) {
      if (now - provision.createdAt.getTime() > maxAgeMs) {
        this.pendingProvisions.delete(key);
        removed++;
      }
    }
    
    return removed;
  }

  // ========================================================================================
  // Third-Party Capability Resolution
  // ========================================================================================

  /**
   * Resolve a third-party capability ID to a connection.
   * This is the core of Level 3 RPC - automatically establishing connections
   * to third parties when capabilities are passed between vats.
   */
  async resolveThirdPartyCap(thirdPartyCapId: ThirdPartyCapId): Promise<{
    connection: RpcConnection;
    provisionId: ProvisionId;
  } | undefined> {
    // Parse the ThirdPartyCapId to extract vat ID and provision ID
    const parsed = this.parseThirdPartyCapId(thirdPartyCapId);
    if (!parsed) {
      return undefined;
    }

    // Get or establish connection to the third party
    const connection = await this.getConnection(parsed.vatId);
    if (!connection) {
      return undefined;
    }

    return {
      connection,
      provisionId: parsed.provisionId,
    };
  }

  /**
   * Parse a ThirdPartyCapId to extract vat ID and provision ID.
   * The format is implementation-specific, but typically:
   * - First N bytes: vat ID
   * - Remaining bytes: provision ID
   */
  private parseThirdPartyCapId(thirdPartyCapId: ThirdPartyCapId): {
    vatId: VatId;
    provisionId: ProvisionId;
  } | undefined {
    // Default implementation: first 32 bytes are vat ID, rest is provision ID
    // This can be overridden by the application
    const data = thirdPartyCapId.id;
    
    if (data.length < 32) {
      return undefined;
    }

    const vatIdBytes = data.slice(0, 32);
    const provisionIdBytes = data.slice(32);

    return {
      vatId: { id: vatIdBytes },
      provisionId: { id: provisionIdBytes },
    };
  }

  // ========================================================================================
  // Utility Methods
  // ========================================================================================

  /**
   * Get all active connections.
   */
  getAllConnections(): ConnectionInfo[] {
    return Array.from(this.connections.values());
  }

  /**
   * Get the number of active connections.
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Get the number of pending provisions.
   */
  getPendingProvisionCount(): number {
    return this.pendingProvisions.size;
  }

  /**
   * Check if a connection exists to a vat.
   */
  hasConnection(vatId: VatId): boolean {
    const vatIdKey = this.vatIdToKey(vatId);
    const info = this.connections.get(vatIdKey);
    return info !== undefined && info.state === 'connected';
  }

  /**
   * Update the last activity timestamp for a connection.
   */
  touchConnection(vatId: VatId): void {
    const vatIdKey = this.vatIdToKey(vatId);
    const info = this.connections.get(vatIdKey);
    if (info) {
      info.lastActivity = new Date();
    }
  }

  // ========================================================================================
  // Private Helpers
  // ========================================================================================

  private vatIdToKey(vatId: VatId): string {
    // Convert Uint8Array to hex string for use as Map key
    return Array.from(vatId.id)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private provisionIdToKey(provisionId: ProvisionId): string {
    return Array.from(provisionId.id)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}

/**
 * Create a ThirdPartyCapId from vat ID and provision ID.
 */
export function createThirdPartyCapId(
  vatId: VatId,
  provisionId: ProvisionId
): ThirdPartyCapId {
  // Concatenate vat ID and provision ID
  const combined = new Uint8Array(vatId.id.length + provisionId.id.length);
  combined.set(vatId.id, 0);
  combined.set(provisionId.id, vatId.id.length);
  
  return { id: combined };
}

/**
 * Create a RecipientId from a vat ID.
 */
export function createRecipientId(vatId: VatId): RecipientId {
  return { id: vatId.id };
}

/**
 * Create a ProvisionId from raw bytes.
 */
export function createProvisionId(id: Uint8Array): ProvisionId {
  return { id };
}

/**
 * Generate a random provision ID.
 */
export function generateProvisionId(): ProvisionId {
  const id = new Uint8Array(32);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(id);
  } else {
    // Fallback for Node.js
    const { randomBytes } = require('crypto');
    randomBytes(32).copy(id);
  }
  return { id };
}

/**
 * Generate a random vat ID.
 */
export function generateVatId(): VatId {
  const id = new Uint8Array(32);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(id);
  } else {
    // Fallback for Node.js
    const { randomBytes } = require('crypto');
    randomBytes(32).copy(id);
  }
  return { id };
}
