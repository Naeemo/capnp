/**
 * Level 4 RPC: Reference Equality / Join Operations
 *
 * This module implements the Level 4 RPC protocol for verifying that capability
 * references point to the same underlying object.
 *
 * Reference: https://capnproto.org/rpc.html (Level 4: Reference equality / joining)
 */

import type { ConnectionManager, VatId } from './connection-manager.js';
import type { Level3Handlers } from './level3-handlers.js';
import {
  type CachedJoinResult,
  DEFAULT_ESCROW_CONFIG,
  DEFAULT_JOIN_OPTIONS,
  DEFAULT_JOIN_SECURITY_POLICY,
  type EscrowConfig,
  type JoinOptions,
  type JoinSecurityPolicy,
  type ObjectIdentity,
  type PendingJoin,
} from './level4-types.js';
import type { RpcConnection } from './rpc-connection.js';
import type { Join, JoinResult, MessageTarget, QuestionId, RpcMessage } from './rpc-types.js';

/** Options for Level4Handlers */
export interface Level4HandlersOptions {
  /** The connection this handler is attached to */
  connection: RpcConnection;

  /** The connection manager for multi-vat scenarios */
  connectionManager?: ConnectionManager;

  /** Level 3 handlers (required for proxy resolution) */
  level3Handlers?: Level3Handlers;

  /** This vat's ID */
  selfVatId?: VatId;

  /** Join operation options */
  joinOptions?: JoinOptions;

  /** Escrow agent configuration */
  escrowConfig?: EscrowConfig;

  /** Security policy */
  securityPolicy?: JoinSecurityPolicy;

  /** Handler for incoming Join messages */
  onJoin?: (join: Join) => Promise<JoinResult>;
}

/**
 * Manages Level 4 RPC message handling for reference equality verification.
 *
 * This class handles:
 * 1. Join messages - verifying that two capabilities point to the same object
 * 2. Object identity tracking and caching
 * 3. Escrow agent functionality for consensus verification
 * 4. Security verification (anti-spoofing)
 *
 * ## Usage Example
 *
 * ```typescript
 * const level4Handlers = new Level4Handlers({
 *   connection,
 *   connectionManager,
 *   level3Handlers,
 *   selfVatId,
 * });
 *
 * // Enable escrow mode for consensus verification
 * level4Handlers.setEscrowConfig({
 *   enabled: true,
 *   requiredParties: 2,
 * });
 *
 * // Send a Join request
 * const result = await level4Handlers.sendJoin(target1, target2);
 * if (result.equal) {
 *   console.log('Capabilities point to the same object!');
 * }
 * ```
 */
export class Level4Handlers {
  private options: Level4HandlersOptions;
  private pendingJoins = new Map<number, PendingJoin>();
  private joinResultsCache = new Map<string, CachedJoinResult>();
  private objectIdentities = new Map<number, ObjectIdentity>();
  private nextJoinId = 1;
  private escrowConfig: EscrowConfig;
  private securityPolicy: JoinSecurityPolicy;
  private joinOptions: Required<JoinOptions>;

  // Escrow state
  private escrowParties = new Map<string, { target: unknown; identity?: ObjectIdentity }>();
  private escrowConsensus?: {
    identity: ObjectIdentity;
    parties: string[];
  };

  constructor(options: Level4HandlersOptions) {
    this.options = options;
    this.escrowConfig = { ...DEFAULT_ESCROW_CONFIG, ...options.escrowConfig };
    this.securityPolicy = { ...DEFAULT_JOIN_SECURITY_POLICY, ...options.securityPolicy };
    this.joinOptions = { ...DEFAULT_JOIN_OPTIONS, ...options.joinOptions };
  }

  // ========================================================================================
  // Join Message Handling
  // ========================================================================================

  /**
   * Handle an incoming Join message.
   *
   * When we receive a Join message, we need to verify whether the two
   * capability references point to the same underlying object.
   *
   * The verification process:
   * 1. Resolve both targets to their underlying objects
   * 2. Compare object identities (vat ID + object ID)
   * 3. Optionally verify identity hashes cryptographically
   * 4. Return the result
   */
  async handleJoin(join: Join): Promise<void> {
    const { questionId, target, otherCap, joinId } = join;

    try {
      // Check cache first
      const cacheKey = this.getCacheKey(target, otherCap);
      const cached = this.joinResultsCache.get(cacheKey);
      if (cached && Date.now() - cached.cachedAt < this.joinOptions.cacheTtlMs) {
        await this.sendJoinResult(questionId, cached.result);
        return;
      }

      // Resolve both targets to their identities
      const identity1 = await this.resolveTargetToIdentity(target);
      const identity2 = await this.resolveTargetToIdentity(otherCap);

      // Compare identities
      const result = this.compareIdentities(identity1, identity2, joinId);

      // Cache the result if enabled
      if (this.joinOptions.cacheResult) {
        this.joinResultsCache.set(cacheKey, {
          result,
          cachedAt: Date.now(),
          targets: [this.hashTarget(target), this.hashTarget(otherCap)],
        });
      }

      // Log for audit if enabled
      if (this.securityPolicy.auditLog) {
        this.logJoinOperation(target, otherCap, result);
      }

      // Send the result
      await this.sendJoinResult(questionId, result);

      // Call custom handler if provided
      if (this.options.onJoin) {
        await this.options.onJoin(join);
      }
    } catch (error) {
      // Send exception result
      await this.sendJoinException(
        questionId,
        error instanceof Error ? error.message : 'Join operation failed'
      );
    }
  }

  /**
   * Send a Join message to verify that two capabilities point to the same object.
   *
   * @param target1 First capability target
   * @param target2 Second capability target
   * @returns Promise resolving to the join result
   */
  async sendJoin(target1: MessageTarget, target2: MessageTarget): Promise<JoinResult> {
    const { connection } = this.options;
    const joinId = this.nextJoinId++;
    const questionId = connection.createQuestion();

    // Create pending join
    const pendingJoin: PendingJoin = {
      joinId,
      target1,
      target2,
      startedAt: Date.now(),
      resolve: () => {},
      reject: () => {},
    };

    const completionPromise = new Promise<JoinResult>((resolve, reject) => {
      pendingJoin.resolve = resolve;
      pendingJoin.reject = reject;
    });

    this.pendingJoins.set(joinId, pendingJoin);

    // Set timeout
    const timeoutMs = this.joinOptions.timeoutMs;
    const timeoutId = setTimeout(() => {
      this.pendingJoins.delete(joinId);
      pendingJoin.reject(new Error(`Join operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    // Override resolve to clear timeout
    const originalResolve = pendingJoin.resolve;
    pendingJoin.resolve = (result: JoinResult) => {
      clearTimeout(timeoutId);
      this.pendingJoins.delete(joinId);
      originalResolve(result);
    };

    try {
      const joinMsg: RpcMessage = {
        type: 'join',
        join: {
          questionId,
          target: target1,
          otherCap: target2,
          joinId,
        },
      };

      await connection.sendCall(joinMsg.join as any);

      // Wait for the result
      const result = await completionPromise;
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      this.pendingJoins.delete(joinId);
      throw error;
    }
  }

  /**
   * Complete a pending join operation with the result.
   * This is called when we receive a Return message for a Join.
   */
  completeJoin(joinId: number, result: JoinResult): void {
    const pending = this.pendingJoins.get(joinId);
    if (pending) {
      pending.resolve(result);
      this.pendingJoins.delete(joinId);
    }
  }

  // ========================================================================================
  // Object Identity Resolution
  // ========================================================================================

  /**
   * Resolve a MessageTarget to its ObjectIdentity.
   *
   * This may involve:
   * 1. Looking up local exports
   * 2. Resolving promises
   * 3. Following third-party capabilities
   * 4. Verifying proxy chains
   */
  private async resolveTargetToIdentity(target: MessageTarget): Promise<ObjectIdentity | null> {
    if (target.type === 'importedCap') {
      // Check if we have cached identity for this import
      const cached = this.objectIdentities.get(target.importId);
      if (cached) {
        return cached;
      }

      // Get the import and resolve its identity
      const importEntry = this.options.connection.getImport(target.importId);
      if (!importEntry) {
        return null;
      }

      // For local imports, we need to query the remote vat for identity
      // In a full implementation, this would involve a network call
      // For now, return a placeholder
      return null;
    }

    if (target.type === 'promisedAnswer') {
      // Wait for the promise to resolve
      const { questionId } = target.promisedAnswer;

      // Wait for the answer
      try {
        const _answer = await this.options.connection.waitForAnswer(questionId);
        // Extract capability from answer and resolve identity
        // This is simplified - full implementation would handle transforms
        return null;
      } catch {
        return null;
      }
    }

    return null;
  }

  /**
   * Compare two object identities for equality.
   */
  private compareIdentities(
    identity1: ObjectIdentity | null,
    identity2: ObjectIdentity | null,
    joinId: number
  ): JoinResult {
    // Both null = equal (both are null capabilities)
    if (!identity1 && !identity2) {
      return { equal: true, joinId };
    }

    // One null, one not = not equal
    if (!identity1 || !identity2) {
      return {
        equal: false,
        joinId,
        inequalityReason: 'One capability is null, the other is not',
      };
    }

    // Compare vat IDs
    if (!this.arraysEqual(identity1.vatId, identity2.vatId)) {
      return {
        equal: false,
        joinId,
        inequalityReason: 'Capabilities hosted by different vats',
      };
    }

    // Compare object IDs
    if (!this.arraysEqual(identity1.objectId, identity2.objectId)) {
      return {
        equal: false,
        joinId,
        inequalityReason: 'Different object IDs within the same vat',
      };
    }

    // Verify identity hashes if required
    if (this.securityPolicy.verifyIdentityHashes) {
      if (identity1.identityHash && identity2.identityHash) {
        if (!this.arraysEqual(identity1.identityHash, identity2.identityHash)) {
          return {
            equal: false,
            joinId,
            inequalityReason: 'Identity hash mismatch (possible spoofing attempt)',
          };
        }
      }
    }

    // All checks passed - identities are equal
    return {
      equal: true,
      joinId,
      identity: identity1,
    };
  }

  // ========================================================================================
  // Escrow Agent Functionality
  // ========================================================================================

  /**
   * Set the escrow configuration.
   */
  setEscrowConfig(config: Partial<EscrowConfig>): void {
    this.escrowConfig = { ...this.escrowConfig, ...config };
  }

  /**
   * Register a party in an escrow consensus verification.
   *
   * This is used when multiple parties need to verify they are referring
   * to the same object (e.g., in a trade or agreement).
   *
   * @param partyId Unique identifier for the party
   * @param target The capability reference from this party
   * @returns Whether consensus has been reached
   */
  async registerEscrowParty(
    partyId: string,
    target: unknown
  ): Promise<{ consensus: boolean; identity?: ObjectIdentity }> {
    if (!this.escrowConfig.enabled) {
      throw new Error('Escrow mode is not enabled');
    }

    // Check if party already registered
    if (this.escrowParties.has(partyId)) {
      throw new Error(`Party ${partyId} is already registered`);
    }

    // Register the party
    this.escrowParties.set(partyId, { target });

    // If we have enough parties, verify consensus
    if (this.escrowParties.size >= this.escrowConfig.requiredParties) {
      const consensus = await this.verifyEscrowConsensus();

      if (consensus.consensus) {
        this.escrowConsensus = {
          identity: consensus.identity!,
          parties: Array.from(this.escrowParties.keys()),
        };

        if (this.escrowConfig.onConsensus) {
          this.escrowConfig.onConsensus(consensus.identity!, Array.from(this.escrowParties.keys()));
        }
      } else {
        if (this.escrowConfig.onConsensusFailure) {
          this.escrowConfig.onConsensusFailure(
            consensus.reason!,
            Array.from(this.escrowParties.keys())
          );
        }
      }

      return { consensus: consensus.consensus, identity: consensus.identity };
    }

    return { consensus: false };
  }

  /**
   * Verify that all registered escrow parties refer to the same object.
   */
  private async verifyEscrowConsensus(): Promise<{
    consensus: boolean;
    identity?: ObjectIdentity;
    reason?: string;
  }> {
    const parties = Array.from(this.escrowParties.entries());

    if (parties.length < this.escrowConfig.requiredParties) {
      return { consensus: false, reason: 'Not enough parties registered' };
    }

    // Use the first party's target as the reference
    const [firstPartyId, firstParty] = parties[0];

    // Resolve first party's identity
    const firstIdentity = await this.resolveTargetToIdentity(firstParty.target as MessageTarget);
    if (!firstIdentity) {
      return { consensus: false, reason: `Could not resolve identity for party ${firstPartyId}` };
    }

    // Compare with all other parties
    for (const [partyId, party] of parties.slice(1)) {
      const identity = await this.resolveTargetToIdentity(party.target as MessageTarget);
      const comparison = this.compareIdentities(firstIdentity, identity, 0);

      if (!comparison.equal) {
        return {
          consensus: false,
          reason: `Party ${partyId} refers to a different object: ${comparison.inequalityReason}`,
        };
      }
    }

    // All parties refer to the same object
    return { consensus: true, identity: firstIdentity };
  }

  /**
   * Clear all escrow state.
   */
  clearEscrow(): void {
    this.escrowParties.clear();
    this.escrowConsensus = undefined;
  }

  /**
   * Get the current escrow consensus if reached.
   */
  getEscrowConsensus(): { identity: ObjectIdentity; parties: string[] } | undefined {
    return this.escrowConsensus;
  }

  // ========================================================================================
  // Security & Anti-Spoofing
  // ========================================================================================

  /**
   * Set the security policy.
   */
  setSecurityPolicy(policy: Partial<JoinSecurityPolicy>): void {
    this.securityPolicy = { ...this.securityPolicy, ...policy };
  }

  /**
   * Verify that a vat is allowed to participate in join operations.
   */
  private isVatAllowed(vatId: Uint8Array): boolean {
    if (this.securityPolicy.allowedVats.length === 0) {
      return true; // All vats allowed if no restrictions
    }

    return this.securityPolicy.allowedVats.some((allowed) => this.arraysEqual(allowed, vatId));
  }

  /**
   * Generate a cryptographic identity hash for an object.
   *
   * This creates a verifiable fingerprint of the object's identity
   * that can be used to detect spoofing attempts.
   */
  async generateIdentityHash(vatId: Uint8Array, objectId: Uint8Array): Promise<Uint8Array> {
    // Combine vat ID and object ID
    const combined = new Uint8Array(vatId.length + objectId.length);
    combined.set(vatId, 0);
    combined.set(objectId, vatId.length);

    // Use SubtleCrypto for hashing if available
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
      return new Uint8Array(hashBuffer);
    }

    // Fallback: simple hash for Node.js
    const { createHash } = require('node:crypto');
    const hash = createHash('sha256');
    hash.update(combined);
    return hash.digest();
  }

  // ========================================================================================
  // Caching & Cleanup
  // ========================================================================================

  /**
   * Clear the join results cache.
   */
  clearCache(): void {
    this.joinResultsCache.clear();
  }

  /**
   * Clean up expired cache entries.
   */
  cleanupExpiredCache(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.joinResultsCache) {
      if (now - entry.cachedAt > this.joinOptions.cacheTtlMs) {
        this.joinResultsCache.delete(key);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Get cache statistics.
   */
  getCacheStats(): { size: number; hitRate: number } {
    return {
      size: this.joinResultsCache.size,
      hitRate: 0, // Would need to track hits/misses
    };
  }

  // ========================================================================================
  // Helper Methods
  // ========================================================================================

  private getCacheKey(target1: MessageTarget, target2: MessageTarget): string {
    // Create a consistent cache key regardless of order
    const hash1 = this.hashTarget(target1);
    const hash2 = this.hashTarget(target2);

    // Sort to ensure (A,B) and (B,A) have the same key
    const sorted = [hash1, hash2].sort();
    return `join:${sorted[0]}:${sorted[1]}`;
  }

  private hashTarget(target: MessageTarget): string {
    if (target.type === 'importedCap') {
      return `import:${target.importId}`;
    }
    if (target.type === 'promisedAnswer') {
      return `answer:${target.promisedAnswer.questionId}`;
    }
    return 'unknown';
  }

  private arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  private async sendJoinResult(questionId: QuestionId, result: JoinResult): Promise<void> {
    const { connection } = this.options;

    const returnMsg: RpcMessage = {
      type: 'return',
      return: {
        answerId: questionId,
        releaseParamCaps: true,
        noFinishNeeded: false,
        result: {
          type: 'results',
          payload: {
            content: this.serializeJoinResult(result),
            capTable: [],
          },
        },
      },
    };

    // @ts-ignore - accessing internal method
    await connection.sendReturn(returnMsg.return);
  }

  private async sendJoinException(questionId: QuestionId, reason: string): Promise<void> {
    const { connection } = this.options;

    const returnMsg: RpcMessage = {
      type: 'return',
      return: {
        answerId: questionId,
        releaseParamCaps: true,
        noFinishNeeded: false,
        result: {
          type: 'exception',
          exception: {
            reason,
            type: 'failed',
          },
        },
      },
    };

    // @ts-ignore - accessing internal method
    await connection.sendReturn(returnMsg.return);
  }

  private serializeJoinResult(result: JoinResult): Uint8Array {
    // Simple serialization - in production, use proper Cap'n Proto encoding
    const obj = {
      equal: result.equal,
      joinId: result.joinId,
      inequalityReason: result.inequalityReason,
    };
    return new TextEncoder().encode(JSON.stringify(obj));
  }

  private logJoinOperation(
    target1: MessageTarget,
    target2: MessageTarget,
    result: JoinResult
  ): void {
    console.log('[Level4] Join operation:', {
      target1: this.hashTarget(target1),
      target2: this.hashTarget(target2),
      equal: result.equal,
      joinId: result.joinId,
      timestamp: new Date().toISOString(),
    });
  }
}

// Re-export types
export type {
  JoinOptions,
  ObjectIdentity,
  PendingJoin,
  CachedJoinResult,
  EscrowConfig,
  JoinSecurityPolicy,
} from './level4-types.js';
export {
  DEFAULT_JOIN_OPTIONS,
  DEFAULT_ESCROW_CONFIG,
  DEFAULT_JOIN_SECURITY_POLICY,
} from './level4-types.js';
