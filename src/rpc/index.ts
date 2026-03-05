/**
 * Cap'n Proto RPC Module
 *
 * Phase 7: Dynamic Schema Transfer Protocol (NEW)
 * - SchemaRequest/SchemaResponse messages for runtime schema fetching
 * - Schema serialization and deserialization
 * - Dynamic schema parsing from binary format
 * - Schema registry for managing parsed schemas
 * - Support for dynamic languages and schema browsers
 *
 * Phase 6: Level 4 RPC - Reference Equality / Join
 * - Join operations for verifying capability equality
 * - Object identity tracking and verification
 * - Escrow agent mode for consensus verification
 * - Anti-spoofing security mechanisms
 * - Identity hash generation and verification
 *
 * Phase 5: Flow Control and Realtime Communication
 * - Stream abstraction with flow control
 * - Bulk API for high-volume transfers
 * - Realtime API for low-latency communication
 * - Stream lifecycle management
 * - Streaming RPC connection
 *
 * Phase 4: Level 3 RPC Implementation
 * - Basic message exchange
 * - Bootstrap
 * - Simple Call/Return/Finish
 * - Promise Pipelining
 * - Capability passing
 * - Resolve/Release/Disembargo
 * - SturdyRefs (persistent capabilities)
 * - Level 3 RPC: Three-way introductions
 *   - Provide/Accept messages
 *   - ConnectionManager for multi-vat scenarios
 *   - Third-party capability passing
 *   - Embargo handling for cycle breaking
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
export type {
  RpcTransport,
  WebSocketTransportOptions,
  TcpTransportOptions,
  CompressionOptions,
  CompressionState,
} from './transport.js';
export { WebSocketTransport } from './websocket-transport.js';
export { TcpTransport } from './tcp-transport.js';
export { EzRpcTransport } from './ezrpc-transport.js';

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

// Message Serialization
export {
  serializeRpcMessage,
  deserializeRpcMessage,
} from './message-serializer.js';

// Promise Pipelining
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

// Call Context
export type { CallContext } from './call-context.js';

// SturdyRefs
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

// Performance Optimizations
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

// Level 3 RPC: Connection Manager (NEW)
export {
  ConnectionManager,
  createThirdPartyCapId,
  createRecipientId,
  createProvisionId,
  generateProvisionId,
  generateVatId,
  type ConnectionManagerOptions,
  type ConnectionInfo,
  type PendingProvision,
  type VatId,
} from './connection-manager.js';

// Level 3 RPC: Message Handlers (NEW)
export {
  Level3Handlers,
  type Level3HandlersOptions,
} from './level3-handlers.js';

// Level 4 RPC: Reference Equality / Join (NEW)
export {
  Level4Handlers,
  type Level4HandlersOptions,
  type JoinOptions,
  type ObjectIdentity,
  type PendingJoin,
  type CachedJoinResult,
  type EscrowConfig,
  type JoinSecurityPolicy,
  DEFAULT_JOIN_OPTIONS,
  DEFAULT_ESCROW_CONFIG,
  DEFAULT_JOIN_SECURITY_POLICY,
} from './level4-handlers.js';

// Phase 5: Stream Management and Flow Control
export {
  Stream,
  createStream,
  isStream,
  DEFAULT_FLOW_CONTROL,
  type StreamOptions,
  type StreamState,
  type StreamDirection,
  type StreamChunk,
  type StreamProgress,
  type FlowControlConfig,
  type StreamEventHandlers,
} from './stream.js';

// Phase 5: Bulk API
export {
  BulkTransfer,
  BulkTransferManager,
  createBulkTransferManager,
  DEFAULT_BULK_CONFIG,
  type BulkTransferConfig,
  type BulkTransferMetadata,
  type BulkTransferStats,
  type BulkTransferHandlers,
  type BulkTransferState,
  type BulkTransferDirection,
} from './bulk.js';

// Phase 5: Realtime API
export {
  RealtimeStream,
  RealtimeStreamManager,
  createRealtimeStreamManager,
  DEFAULT_REALTIME_CONFIG,
  DropPolicy,
  type RealtimeConfig,
  type RealtimeMessage,
  type BandwidthStats,
  type RealtimeStreamHandlers,
} from './realtime.js';

// Phase 5: Stream Manager
export {
  StreamManager,
  createStreamManager,
  StreamType,
  type StreamManagerConfig,
  type StreamManagerHandlers,
  type StreamInfo,
  type CreateStreamOptions,
} from './stream-manager.js';

// Phase 5: Streaming RPC Connection
export {
  StreamingRpcConnection,
  createStreamingConnection,
  supportsStreaming,
  DEFAULT_STREAMING_CAPABILITIES,
  type StreamingCapabilities,
  type StreamingRpcConnectionOptions,
} from './streaming-connection.js';

// Re-export StreamPriority from stream module
export { StreamPriority } from './stream.js';

// Phase 7: Dynamic Schema Transfer Protocol (NEW)
export type {
  SchemaRequest,
  SchemaResponse,
  SchemaTarget,
  SchemaResponseResult,
  SchemaPayload,
  // SchemaFormat is exported as value below
  SchemaDependency,
  AvailableSchema,
  SchemaCapability,
  GetSchemaParams,
  GetSchemaResults,
  ListSchemasResults,
  SchemaNode,
  SchemaNodeType,
  SchemaField,
  SchemaType,
  SchemaTypeKind,
  SchemaMethod,
  SchemaAnnotation,
  SchemaValue,
  SchemaBrand,
  SchemaBrandScope,
  SchemaBrandBinding,
  SchemaRegistry,
  DynamicSchemaLoader,
} from './schema-types.js';

// Re-export SchemaFormat as both type and value
export { SchemaFormat } from './schema-types.js';

export {
  serializeSchemaRequest,
  deserializeSchemaRequest,
  serializeSchemaResponse,
  deserializeSchemaResponse,
  serializeGetSchemaParams,
  serializeGetSchemaResults,
  serializeListSchemasResults,
  SCHEMA_MESSAGE_TYPES,
} from './schema-serializer.js';

export {
  parseSchemaNodes,
  createSchemaRegistry,
} from './schema-parser.js';

// Phase 7: Dynamic Reader/Writer (NEW)
export {
  createDynamicReader,
  createDynamicReaderFromStruct,
  createDynamicReaderByTypeId,
  dumpDynamicReader,
  type DynamicReader,
} from './dynamic-reader.js';

export {
  createDynamicWriter,
  createNestedDynamicWriter,
  createDynamicWriterByTypeId,
  serializeDynamic,
  serializeDynamicByTypeId,
  type DynamicWriter,
  type DynamicListWriter,
} from './dynamic-writer.js';

// Phase 7: Schema Capability (NEW)
export {
  SchemaCapabilityServer,
  SchemaCapabilityClient,
} from './schema-capability.js';

// WebSocket-to-TCP Proxy (NEW in v0.6.0)
export {
  CapnpWebSocketProxy,
  type ProxyOptions,
} from '../proxy/websocket-proxy.js';

// Compression types (re-exported from main)
export type {
  CompressionConfig,
  CompressionStats,
} from '../compression/index.js';
