/**
 * Cap'n Proto RPC Protocol Types
 * Phase 1: Level 0 RPC Implementation
 *
 * This file contains the TypeScript type definitions for the RPC protocol.
 * For Phase 1, we focus on Level 0 features:
 * - Bootstrap
 * - Call / Return / Finish
 */

// ========================================================================================
// Type Aliases
// ========================================================================================

/** Question ID - identifies a pending call */
export type QuestionId = number;

/** Answer ID - identifies a pending answer (same as QuestionId from caller's perspective) */
export type AnswerId = QuestionId;

/** Export ID - identifies a capability exported by the sender */
export type ExportId = number;

/** Import ID - identifies a capability imported from the receiver */
export type ImportId = ExportId;

/** Embargo ID - used for promise resolution ordering */
export type EmbargoId = number;

/** Interface type ID */
export type InterfaceId = bigint;

/** Method ordinal within an interface */
export type MethodId = number;

// ========================================================================================
// Message Types (Level 0)
// ========================================================================================

/** Top-level RPC message */
export type RpcMessage =
  | { type: 'unimplemented'; message: RpcMessage }
  | { type: 'abort'; exception: Exception }
  | { type: 'bootstrap'; bootstrap: Bootstrap }
  | { type: 'call'; call: Call }
  | { type: 'return'; return: Return }
  | { type: 'finish'; finish: Finish }
  | { type: 'resolve'; resolve: Resolve }
  | { type: 'release'; release: Release }
  | { type: 'disembargo'; disembargo: Disembargo }
  | { type: 'provide'; provide: Provide }
  | { type: 'accept'; accept: Accept }
  | { type: 'join'; join: Join };

/** Bootstrap request - get the main interface from the remote vat */
export interface Bootstrap {
  questionId: QuestionId;
  deprecatedObjectId?: unknown; // AnyPointer - deprecated
}

/** Call message - invoke a method on a capability */
export interface Call {
  questionId: QuestionId;
  target: MessageTarget;
  interfaceId: InterfaceId;
  methodId: MethodId;
  allowThirdPartyTailCall: boolean;
  noPromisePipelining: boolean;
  onlyPromisePipeline: boolean;
  params: Payload;
  sendResultsTo: SendResultsTo;
}

/** Where to send the return message */
export type SendResultsTo =
  | { type: 'caller' }
  | { type: 'yourself' }
  | { type: 'thirdParty'; recipientId: RecipientId };

/** Return message - response to a Call */
export interface Return {
  answerId: AnswerId;
  releaseParamCaps: boolean;
  noFinishNeeded: boolean;
  result: ReturnResult;
}

/** Return result variants */
export type ReturnResult =
  | { type: 'results'; payload: Payload }
  | { type: 'exception'; exception: Exception }
  | { type: 'canceled' }
  | { type: 'resultsSentElsewhere' }
  | { type: 'takeFromOtherQuestion'; questionId: QuestionId }
  | { type: 'acceptFromThirdParty'; thirdPartyCapId: ThirdPartyCapId };

/** Finish message - release a question/answer */
export interface Finish {
  questionId: QuestionId;
  releaseResultCaps: boolean;
  requireEarlyCancellationWorkaround: boolean;
}

// ========================================================================================
// Message Types (Level 1)
// ========================================================================================

/** Resolve message - indicate a promise has resolved */
export interface Resolve {
  promiseId: ExportId;
  resolution: ResolveResult;
}

export type ResolveResult =
  | { type: 'cap'; cap: CapDescriptor }
  | { type: 'exception'; exception: Exception };

/** Release message - release a capability reference */
export interface Release {
  id: ImportId;
  referenceCount: number;
}

/** Disembargo message - lift an embargo on promise resolution */
export interface Disembargo {
  target: MessageTarget;
  context: DisembargoContext;
}

export type DisembargoContext =
  | { type: 'senderLoopback'; embargoId: EmbargoId }
  | { type: 'receiverLoopback'; embargoId: EmbargoId }
  | { type: 'accept' }
  | { type: 'provide'; questionId: QuestionId };

// ========================================================================================
// Message Types (Level 3)
// ========================================================================================

/** Provide message - offer a capability to a third party */
export interface Provide {
  questionId: QuestionId;
  target: MessageTarget;
  recipient: RecipientId;
}

/** Accept message - accept a capability from a third party */
export interface Accept {
  questionId: QuestionId;
  provision: ProvisionId;
  embargo: boolean;
}

// ========================================================================================
// Message Types (Level 4)
// ========================================================================================

/** Join message - establish direct connectivity to common root */
export interface Join {
  questionId: QuestionId;
  target: MessageTarget;
  otherCap: MessageTarget;
  joinId: number;
}

// ========================================================================================
// Supporting Types
// ========================================================================================

/** Target for a message (Call, Disembargo, etc.) */
export type MessageTarget =
  | { type: 'importedCap'; importId: ImportId }
  | { type: 'promisedAnswer'; promisedAnswer: PromisedAnswer };

/** Payload containing data and capability references */
export interface Payload {
  content: Uint8Array; // Serialized struct
  capTable: CapDescriptor[];
}

/** Capability descriptor - describes a capability in a payload */
export type CapDescriptor =
  | { type: 'none' }
  | { type: 'senderHosted'; exportId: ExportId }
  | { type: 'senderPromise'; exportId: ExportId }
  | { type: 'receiverHosted'; importId: ImportId }
  | { type: 'receiverAnswer'; promisedAnswer: PromisedAnswer }
  | { type: 'thirdPartyHosted'; thirdPartyCapId: ThirdPartyCapId };

/** Promised answer - identifies a capability that will be returned */
export interface PromisedAnswer {
  questionId: QuestionId;
  transform: PromisedAnswerOp[];
}

/** Operations to apply to a promised answer */
export type PromisedAnswerOp = { type: 'noop' } | { type: 'getPointerField'; fieldIndex: number };

/** Exception - describes a failed call */
export interface Exception {
  reason: string;
  type: ExceptionType;
  obsoleteIsCallersFault?: boolean;
  obsoleteDurability?: number;
}

export type ExceptionType = 'failed' | 'overloaded' | 'disconnected' | 'unimplemented';

// ========================================================================================
// Network-specific Types
// ========================================================================================

/** Placeholder for third-party capability ID (Level 3) */
export interface ThirdPartyCapId {
  id: Uint8Array;
}

/** Placeholder for recipient ID (Level 3) */
export interface RecipientId {
  id: Uint8Array;
}

/** Placeholder for provision ID (Level 3) */
export interface ProvisionId {
  id: Uint8Array;
}
