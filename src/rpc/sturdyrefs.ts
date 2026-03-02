/**
 * SturdyRefs - Level 2 RPC Feature
 *
 * SturdyRefs provide persistent capability references that survive
 * connection disconnections and can be restored on reconnection.
 *
 * Key concepts:
 * - SturdyRef: A persistent reference to a capability
 * - Restore: Reconnect to a capability using its SturdyRef
 * - Save: Create a SturdyRef from a live capability
 */

import type { RpcConnection } from './rpc-connection.js';
import type { ExportId, ImportId, QuestionId, RpcMessage } from './rpc-types.js';

// ========================================================================================
// Types
// ========================================================================================

/**
 * A SturdyRef token that can be persisted and later used to restore a capability
 */
export interface SturdyRef {
  /** The vat ID where the capability lives */
  vatId: string;
  /** The local ID of the capability within that vat */
  localId: string;
  /** Optional: Version or generation number for validation */
  version?: number;
  /** Optional: Expiration timestamp */
  expiresAt?: number;
  /** Optional: Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * A stored SturdyRef with its associated capability info
 */
interface StoredSturdyRef {
  ref: SturdyRef;
  exportId: ExportId;
  capability: unknown;
  createdAt: number;
  lastAccessedAt: number;
}

/**
 * Options for saving a capability as a SturdyRef
 */
export interface SaveOptions {
  /** Custom local ID (auto-generated if not provided) */
  localId?: string;
  /** Expiration time in milliseconds from now */
  ttlMs?: number;
  /** Metadata to attach to the SturdyRef */
  metadata?: Record<string, unknown>;
}

/**
 * Options for restoring a capability from a SturdyRef
 */
export interface RestoreOptions {
  /** Timeout for the restore operation */
  timeoutMs?: number;
}

// ========================================================================================
// SturdyRef Manager (Server-side)
// ========================================================================================

/**
 * Manages SturdyRefs on the server side.
 * Stores the mapping between SturdyRef tokens and live capabilities.
 */
export class SturdyRefManager {
  private vatId: string;
  private storedRefs = new Map<string, StoredSturdyRef>();
  private localIdCounter = 0;

  constructor(vatId: string) {
    this.vatId = vatId;
  }

  /**
   * Save a capability as a SturdyRef
   */
  saveCapability(capability: unknown, exportId: ExportId, options?: SaveOptions): SturdyRef {
    const localId = options?.localId ?? this.generateLocalId();
    const now = Date.now();

    const ref: SturdyRef = {
      vatId: this.vatId,
      localId,
      version: 1,
      expiresAt: options?.ttlMs ? now + options.ttlMs : undefined,
      metadata: options?.metadata,
    };

    const stored: StoredSturdyRef = {
      ref,
      exportId,
      capability,
      createdAt: now,
      lastAccessedAt: now,
    };

    this.storedRefs.set(localId, stored);
    return ref;
  }

  /**
   * Restore a capability from a SturdyRef token
   */
  restoreCapability(ref: SturdyRef): { capability: unknown; exportId: ExportId } | null {
    // Validate the SturdyRef belongs to this vat
    if (ref.vatId !== this.vatId) {
      console.warn(`SturdyRef vatId mismatch: ${ref.vatId} !== ${this.vatId}`);
      return null;
    }

    const stored = this.storedRefs.get(ref.localId);
    if (!stored) {
      console.warn(`SturdyRef not found: ${ref.localId}`);
      return null;
    }

    // Check expiration
    if (stored.ref.expiresAt && Date.now() > stored.ref.expiresAt) {
      console.warn(`SturdyRef expired: ${ref.localId}`);
      this.storedRefs.delete(ref.localId);
      return null;
    }

    // Update last accessed time
    stored.lastAccessedAt = Date.now();

    return {
      capability: stored.capability,
      exportId: stored.exportId,
    };
  }

  /**
   * Drop a SturdyRef
   */
  dropSturdyRef(localId: string): boolean {
    return this.storedRefs.delete(localId);
  }

  /**
   * Get all active SturdyRefs
   */
  getActiveRefs(): SturdyRef[] {
    const now = Date.now();
    const active: SturdyRef[] = [];

    for (const [localId, stored] of this.storedRefs) {
      // Clean up expired refs
      if (stored.ref.expiresAt && now > stored.ref.expiresAt) {
        this.storedRefs.delete(localId);
        continue;
      }
      active.push(stored.ref);
    }

    return active;
  }

  /**
   * Clean up expired SturdyRefs
   */
  cleanupExpired(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [localId, stored] of this.storedRefs) {
      if (stored.ref.expiresAt && now > stored.ref.expiresAt) {
        this.storedRefs.delete(localId);
        cleaned++;
      }
    }

    return cleaned;
  }

  private generateLocalId(): string {
    return `ref-${++this.localIdCounter}-${Date.now()}`;
  }
}

// ========================================================================================
// Restore Handler (Client-side)
// ========================================================================================

/**
 * Handles Restore messages on the client side.
 * Manages reconnecting to capabilities after disconnections.
 */
export class RestoreHandler {
  private connection: RpcConnection;
  private pendingRestores = new Map<
    QuestionId,
    {
      resolve: (importId: ImportId) => void;
      reject: (error: Error) => void;
      timeout: ReturnType<typeof setTimeout>;
    }
  >();
  private questionIdCounter = 0;

  constructor(connection: RpcConnection) {
    this.connection = connection;
  }

  /**
   * Send a Restore message to restore a capability from a SturdyRef
   */
  async restore(ref: SturdyRef, options?: RestoreOptions): Promise<ImportId> {
    const questionId = ++this.questionIdCounter;
    const timeoutMs = options?.timeoutMs ?? 30000;

    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingRestores.delete(questionId);
        reject(new Error(`Restore timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRestores.set(questionId, { resolve, reject, timeout });

      // Send Restore message (using Call message with special interface)
      // In the actual protocol, this would be a specific Restore message type
      // For now, we use a special method call
      this.sendRestoreMessage(questionId, ref).catch((error) => {
        clearTimeout(timeout);
        this.pendingRestores.delete(questionId);
        reject(error);
      });
    });
  }

  /**
   * Handle a Restore response
   */
  handleRestoreResponse(questionId: QuestionId, importId: ImportId): void {
    const pending = this.pendingRestores.get(questionId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRestores.delete(questionId);
      pending.resolve(importId);
    }
  }

  /**
   * Handle a Restore failure
   */
  handleRestoreFailure(questionId: QuestionId, reason: string): void {
    const pending = this.pendingRestores.get(questionId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRestores.delete(questionId);
      pending.reject(new Error(`Restore failed: ${reason}`));
    }
  }

  /**
   * Cancel all pending restores (e.g., on disconnect)
   */
  cancelAll(reason: string): void {
    for (const [_questionId, pending] of this.pendingRestores) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(`Restore canceled: ${reason}`));
    }
    this.pendingRestores.clear();
  }

  private async sendRestoreMessage(questionId: QuestionId, ref: SturdyRef): Promise<void> {
    // Serialize the SturdyRef
    const refData = JSON.stringify(ref);

    // In the actual implementation, this would send a proper Restore message
    // For now, we simulate it
    const restoreMsg: RpcMessage = {
      type: 'call',
      call: {
        questionId,
        target: { type: 'importedCap', importId: 0 }, // Special import for restore service
        interfaceId: BigInt('0xffffffffffffffff'), // Special interface ID for restore
        methodId: 0, // restore method
        allowThirdPartyTailCall: false,
        noPromisePipelining: false,
        onlyPromisePipeline: false,
        params: {
          content: new TextEncoder().encode(refData),
          capTable: [],
        },
        sendResultsTo: { type: 'caller' },
      },
    };

    // This would be sent through the connection
    // await this.connection.send(restoreMsg);
    console.log('Sending restore message:', restoreMsg);
  }
}

// ========================================================================================
// SturdyRef Utilities
// ========================================================================================

/**
 * Serialize a SturdyRef to a string for storage
 */
export function serializeSturdyRef(ref: SturdyRef): string {
  return JSON.stringify(ref);
}

/**
 * Deserialize a SturdyRef from a string
 */
export function deserializeSturdyRef(data: string): SturdyRef | null {
  try {
    const parsed = JSON.parse(data);

    // Validate required fields
    if (typeof parsed.vatId !== 'string' || typeof parsed.localId !== 'string') {
      return null;
    }

    return {
      vatId: parsed.vatId,
      localId: parsed.localId,
      version: parsed.version,
      expiresAt: parsed.expiresAt,
      metadata: parsed.metadata,
    };
  } catch {
    return null;
  }
}

/**
 * Check if a SturdyRef is valid (not expired)
 */
export function isSturdyRefValid(ref: SturdyRef): boolean {
  if (ref.expiresAt && Date.now() > ref.expiresAt) {
    return false;
  }
  return true;
}

/**
 * Create a SturdyRef from components
 */
export function createSturdyRef(
  vatId: string,
  localId: string,
  options?: Omit<SaveOptions, 'localId'>
): SturdyRef {
  return {
    vatId,
    localId,
    version: 1,
    expiresAt: options?.ttlMs ? Date.now() + options.ttlMs : undefined,
    metadata: options?.metadata,
  };
}
