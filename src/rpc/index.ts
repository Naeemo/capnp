/**
 * Cap'n Proto RPC Module
 *
 * Phase 2: Level 1 RPC Implementation
 * - Basic message exchange
 * - Bootstrap
 * - Simple Call/Return/Finish
 * - Promise Pipelining (NEW)
 * - Capability passing (NEW)
 * - Resolve/Release/Disembargo (NEW)
 */

// Types
export type {
  RpcMessage,
  Bootstrap,
  Call,
  Return,
  Finish,
  Resolve,
  Release,
  Disembargo,
  Provide,
  Accept,
  Join,
  MessageTarget,
  Payload,
  CapDescriptor,
  PromisedAnswer,
  PromisedAnswerOp,
  Exception,
  ExceptionType,
  SendResultsTo,
  ReturnResult,
  ResolveResult,
  DisembargoContext,
  ThirdPartyCapId,
  RecipientId,
  ProvisionId,
  QuestionId,
  AnswerId,
  ExportId,
  ImportId,
  EmbargoId,
  InterfaceId,
  MethodId,
} from './rpc-types.js';

// Transport
export type { RpcTransport, WebSocketTransportOptions } from './transport.js';
export { WebSocketTransport } from './websocket-transport.js';

// Four Tables
export {
  QuestionTable,
  AnswerTable,
  ImportTable,
  ExportTable,
  type Question,
  type Answer,
  type Import,
  type Export,
} from './four-tables.js';

// Connection
export { RpcConnection, type RpcConnectionOptions } from './rpc-connection.js';

// Capability Client
export {
  BaseCapabilityClient,
  type CapabilityClient,
  type CapabilityClientFactory,
} from './capability-client.js';

// Message Serialization (NEW in Phase 2)
export {
  serializeRpcMessage,
  deserializeRpcMessage,
} from './message-serializer.js';

// Promise Pipelining (NEW in Phase 2)
export {
  createPipelineClient,
  isPipelineClient,
  PipelineOpTracker,
  PipelineResolutionTracker,
  QueuedCallManager,
  PIPELINE_CLIENT_SYMBOL,
  type PipelineClient,
  type PipelineClientOptions,
  type QueuedCall,
  type ResolvedCapability,
} from './pipeline.js';

// Call Context (NEW in Phase 3)
export type { CallContext } from './call-context.js';

// SturdyRefs (NEW in Phase 3)
export {
  SturdyRefManager,
  RestoreHandler,
  serializeSturdyRef,
  deserializeSturdyRef,
  isSturdyRefValid,
  createSturdyRef,
  type SturdyRef,
  type SaveOptions,
  type RestoreOptions,
} from './sturdyrefs.js';

// Performance Optimizations (NEW in Phase 3)
export {
  MemoryPool,
  MultiSegmentMessageBuilder,
  OptimizedRpcMessageBuilder,
  createZeroCopyView,
  isSameBuffer,
  fastCopy,
  getGlobalMemoryPool,
  configureGlobalMemoryPool,
  type ZeroCopyView,
  type MultiSegmentOptions,
  type RpcMessageOptions,
} from './performance.js';
