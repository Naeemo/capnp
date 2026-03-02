/**
 * Level 4 RPC: Reference Equality / Join Operations
 *
 * Level 4 RPC allows verifying that capability references received from different
 * sources point to the same underlying object. This is crucial for:
 *
 * 1. **Escrow Agents**: Verifying that two parties are referring to the same object
 *    before acting as a trusted intermediary.
 * 2. **Consensus Verification**: Ensuring multiple parties agree on the identity
 *    of an object.
 * 3. **Security**: Preventing spoofing attacks where an attacker might try to
 *    substitute a different object.
 *
 * ## Core Concept
 *
 * When Alice receives capability references from both Bob and Carol that should
 * point to the same object (e.g., a shared resource), she can use Join to verify
 * this:
 *
 * ```
 * Alice receives cap1 from Bob → points to object X (via proxy P1)
 * Alice receives cap2 from Carol → points to object X (via proxy P2)
 * Alice sends Join(cap1, cap2) to P1
 * P1 verifies that both caps point to the same underlying object
 * Result: confirmed equal or not equal
 * ```
 *
 * ## Object Identity
 *
 * Object identity is determined by:
 * - **Vat ID**: The vat hosting the object
 * - **Object ID**: A unique identifier within that vat
 * - **Identity Hash**: A cryptographic hash of the object's identity
 *
 * ## Join Protocol
 *
 * 1. Alice sends Join message to the first capability's host (P1)
 * 2. P1 receives the Join request with two capability references
 * 3. P1 verifies that both references resolve to the same underlying object
 * 4. P1 returns the result (equal or not equal)
 *
 * ## Escrow Agent Pattern
 *
 * ```
 * Bob wants to sell an object to Carol
 * Alice acts as escrow agent
 * Bob sends Alice a reference to the object
 * Carol sends Alice a reference to the same object
 * Alice verifies (via Join) that both refer to the same object
 * Alice holds payment from Carol
 * Bob transfers object to Carol
 * Alice releases payment to Bob
 * ```
 *
 * ## Implementation Notes
 *
 * - Join operations are idempotent
 * - Results are cached to avoid redundant verification
 * - Multiple capabilities can be joined in a single operation
 * - The operation may involve network calls to resolve proxies
 *
 * @module level4-handlers
 */

/**
 * Object identity information used for equality verification.
 */
export interface ObjectIdentity {
  /** The vat ID of the object host */
  vatId: Uint8Array;

  /** The unique object ID within the vat */
  objectId: Uint8Array;

  /** Optional identity hash/fingerprint for verification */
  identityHash?: Uint8Array;

  /** Timestamp when this identity was established */
  establishedAt: number;
}

/**
 * Result of a Join operation.
 */
export interface JoinResult {
  /** Whether the capabilities are equal (point to the same object) */
  equal: boolean;

  /** If equal, the shared object identity */
  identity?: ObjectIdentity;

  /** If not equal, reasons for inequality */
  inequalityReason?: string;

  /** The join operation ID */
  joinId: number;
}

/**
 * Options for a Join operation.
 */
export interface JoinOptions {
  /** Timeout for the join operation in milliseconds */
  timeoutMs?: number;

  /** Whether to require cryptographic verification */
  requireCryptoVerification?: boolean;

  /** Whether to cache the result */
  cacheResult?: boolean;

  /** TTL for cached results in milliseconds */
  cacheTtlMs?: number;
}

/**
 * Default join options.
 */
export const DEFAULT_JOIN_OPTIONS: Required<JoinOptions> = {
  timeoutMs: 30000,
  requireCryptoVerification: true,
  cacheResult: true,
  cacheTtlMs: 300000, // 5 minutes
};

/**
 * Status of a pending Join operation.
 */
export interface PendingJoin {
  /** The join operation ID */
  joinId: number;

  /** The first capability target */
  target1: unknown;

  /** The second capability target */
  target2: unknown;

  /** When the join was initiated */
  startedAt: number;

  /** Resolve function for the promise */
  resolve: (result: JoinResult) => void;

  /** Reject function for the promise */
  reject: (error: Error) => void;
}

/**
 * Cached join result.
 */
export interface CachedJoinResult {
  /** The cached result */
  result: JoinResult;

  /** When the result was cached */
  cachedAt: number;

  /** The targets that were joined */
  targets: [string, string]; // Hashed target identifiers
}

/**
 * Configuration for the escrow agent mode.
 */
export interface EscrowConfig {
  /** Whether escrow mode is enabled */
  enabled: boolean;

  /** Required number of parties for consensus */
  requiredParties: number;

  /** Timeout for escrow operations */
  timeoutMs: number;

  /** Callback when consensus is reached */
  onConsensus?: (identity: ObjectIdentity, parties: string[]) => void;

  /** Callback when consensus fails */
  onConsensusFailure?: (reason: string, parties: string[]) => void;
}

/**
 * Default escrow configuration.
 */
export const DEFAULT_ESCROW_CONFIG: EscrowConfig = {
  enabled: false,
  requiredParties: 2,
  timeoutMs: 60000,
};

/**
 * Security policy for Join operations.
 */
export interface JoinSecurityPolicy {
  /** Whether to verify identity hashes */
  verifyIdentityHashes: boolean;

  /** Whether to check for revoked objects */
  checkRevocation: boolean;

  /** Maximum depth for proxy resolution */
  maxProxyDepth: number;

  /** Whether to log all join operations */
  auditLog: boolean;

  /** Allowed vats for join operations (empty = all allowed) */
  allowedVats: Uint8Array[];
}

/**
 * Default join security policy.
 */
export const DEFAULT_JOIN_SECURITY_POLICY: JoinSecurityPolicy = {
  verifyIdentityHashes: true,
  checkRevocation: true,
  maxProxyDepth: 10,
  auditLog: true,
  allowedVats: [],
};
