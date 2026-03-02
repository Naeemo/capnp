/**
 * Phase 7: Dynamic Schema Transfer Protocol - Type Definitions
 * 
 * This module provides TypeScript types for the Dynamic Schema extension
 * to the Cap'n Proto RPC protocol.
 */

import type { MessageTarget, Exception, Payload } from "./rpc-types";

/**
 * Question ID for schema requests
 */
export type SchemaQuestionId = number;

/**
 * Answer ID for schema responses
 */
export type SchemaAnswerId = number;

/**
 * Schema request message - sent to fetch schema information from remote vat
 */
export interface SchemaRequest {
  /** Question ID identifying this request */
  questionId: SchemaQuestionId;
  
  /** Specifies which schema(s) to fetch */
  targetSchema: SchemaTarget;
}

/**
 * Schema target - specifies what schema information is being requested
 */
export type SchemaTarget =
  | { type: "allSchemas" }
  | { type: "byTypeId"; typeId: bigint }
  | { type: "byTypeName"; typeName: string }
  | { type: "byFileId"; fileId: bigint }
  | { type: "byFileName"; fileName: string }
  | { type: "bootstrapInterface" };

/**
 * Schema response message - contains requested schema information or error
 */
export interface SchemaResponse {
  /** Answer ID corresponding to the SchemaRequest */
  answerId: SchemaAnswerId;
  
  /** Response result */
  result: SchemaResponseResult;
}

/**
 * Schema response result variants
 */
export type SchemaResponseResult =
  | { type: "success"; payload: SchemaPayload }
  | { type: "exception"; exception: Exception };

/**
 * Schema payload containing serialized schema information
 */
export interface SchemaPayload {
  /** Serialized schema nodes in Cap'n Proto binary format */
  schemaData: Uint8Array;
  
  /** Format of the schema data */
  format: SchemaFormat;
  
  /** Optional source information (doc comments, source locations) */
  sourceInfo?: Uint8Array;
  
  /** List of imported schemas needed to understand the returned schema */
  dependencies: SchemaDependency[];
}

/**
 * Supported schema serialization formats
 */
export enum SchemaFormat {
  /** Standard Cap'n Proto binary format (schema.capnp structs) */
  BINARY = 0,
  
  /** JSON representation of the schema */
  JSON = 1,
  
  /** Cap'n Proto schema language text format */
  CAPNP = 2,
}

/**
 * Schema dependency information
 */
export interface SchemaDependency {
  /** ID of the imported file */
  fileId: bigint;
  
  /** Name/path of the imported file */
  fileName: string;
  
  /** Optional hash of schema content for caching/versioning */
  schemaHash?: Uint8Array;
}

/**
 * Available schema information (for schema listing)
 */
export interface AvailableSchema {
  /** Type ID */
  typeId: bigint;
  
  /** Display name */
  displayName: string;
  
  /** File ID */
  fileId: bigint;
  
  /** File name */
  fileName: string;
  
  /** Type flags */
  isInterface: boolean;
  isStruct: boolean;
  isEnum: boolean;
}

/**
 * Schema capability interface - for dedicated schema providers
 */
export interface SchemaCapability {
  /**
   * Fetch schema information
   */
  getSchema(params: GetSchemaParams): Promise<GetSchemaResults>;
  
  /**
   * List all available schemas
   */
  listAvailableSchemas(): Promise<ListSchemasResults>;
}

/**
 * Parameters for getSchema call
 */
export interface GetSchemaParams {
  /** Schema target specification */
  target: SchemaTarget;
  
  /** Desired format (defaults to binary) */
  format?: SchemaFormat;
}

/**
 * Results from getSchema call
 */
export interface GetSchemaResults {
  /** Schema payload */
  payload: SchemaPayload;
}

/**
 * Results from listAvailableSchemas call
 */
export interface ListSchemasResults {
  /** List of available schemas */
  schemas: AvailableSchema[];
}

/**
 * Schema node types (mirroring schema.capnp Node union)
 */
export enum SchemaNodeType {
  FILE = 0,
  STRUCT = 1,
  ENUM = 2,
  INTERFACE = 3,
  CONST = 4,
  ANNOTATION = 5,
}

/**
 * Type reference (mirroring schema.capnp Type)
 */
export interface SchemaType {
  kind: SchemaTypeKind;
}

export type SchemaTypeKind =
  | { type: "void" }
  | { type: "bool" }
  | { type: "int8" }
  | { type: "int16" }
  | { type: "int32" }
  | { type: "int64" }
  | { type: "uint8" }
  | { type: "uint16" }
  | { type: "uint32" }
  | { type: "uint64" }
  | { type: "float32" }
  | { type: "float64" }
  | { type: "text" }
  | { type: "data" }
  | { type: "list"; elementType: SchemaType }
  | { type: "enum"; typeId: bigint; brand?: SchemaBrand }
  | { type: "struct"; typeId: bigint; brand?: SchemaBrand }
  | { type: "interface"; typeId: bigint; brand?: SchemaBrand }
  | { type: "anyPointer"; constraint?: AnyPointerConstraint };

export type AnyPointerConstraint =
  | { type: "unconstrained"; kind: "anyKind" | "struct" | "list" | "capability" }
  | { type: "parameter"; scopeId: bigint; parameterIndex: number }
  | { type: "implicitMethodParameter"; parameterIndex: number };

/**
 * Brand for generic type parameters
 */
export interface SchemaBrand {
  scopes: SchemaBrandScope[];
}

export interface SchemaBrandScope {
  scopeId: bigint;
  bindings: SchemaBrandBinding[];
}

export type SchemaBrandBinding =
  | { type: "unbound" }
  | { type: "type"; value: SchemaType };

/**
 * Field definition (mirroring schema.capnp Field)
 */
export interface SchemaField {
  name: string;
  codeOrder: number;
  discriminantValue: number;
  offset: number;
  type: SchemaType;
  defaultValue?: SchemaValue;
  hadExplicitDefault: boolean;
}

/**
 * Value representation (mirroring schema.capnp Value)
 */
export type SchemaValue =
  | { type: "void" }
  | { type: "bool"; value: boolean }
  | { type: "int8"; value: number }
  | { type: "int16"; value: number }
  | { type: "int32"; value: number }
  | { type: "int64"; value: bigint }
  | { type: "uint8"; value: number }
  | { type: "uint16"; value: number }
  | { type: "uint32"; value: number }
  | { type: "uint64"; value: bigint }
  | { type: "float32"; value: number }
  | { type: "float64"; value: number }
  | { type: "text"; value: string }
  | { type: "data"; value: Uint8Array }
  | { type: "list"; value: unknown }
  | { type: "enum"; value: number }
  | { type: "struct"; value: unknown }
  | { type: "interface" }
  | { type: "anyPointer"; value: unknown };

/**
 * Method definition (mirroring schema.capnp Method)
 */
export interface SchemaMethod {
  name: string;
  codeOrder: number;
  paramStructType: bigint;
  resultStructType: bigint;
  annotations: SchemaAnnotation[];
}

/**
 * Annotation definition
 */
export interface SchemaAnnotation {
  id: bigint;
  value: SchemaValue;
  brand?: SchemaBrand;
}

/**
 * Parsed schema node
 */
export interface SchemaNode {
  id: bigint;
  displayName: string;
  displayNamePrefixLength: number;
  scopeId: bigint;
  nestedNodes: Array<{ name: string; id: bigint }>;
  annotations: SchemaAnnotation[];
  type: SchemaNodeType;
  
  // Type-specific fields
  structInfo?: {
    dataWordCount: number;
    pointerCount: number;
    preferredListEncoding: number;
    isGroup: boolean;
    discriminantCount: number;
    discriminantOffset: number;
    fields: SchemaField[];
  };
  
  enumInfo?: {
    enumerants: Array<{ name: string; codeOrder: number; annotations: SchemaAnnotation[] }>;
  };
  
  interfaceInfo?: {
    methods: SchemaMethod[];
    superclasses: Array<{ id: bigint; brand: SchemaBrand }>;
  };
  
  constInfo?: {
    type: SchemaType;
    value: SchemaValue;
  };
  
  annotationInfo?: {
    type: SchemaType;
    targetsFile: boolean;
    targetsConst: boolean;
    targetsEnum: boolean;
    targetsEnumerant: boolean;
    targetsStruct: boolean;
    targetsField: boolean;
    targetsUnion: boolean;
    targetsGroup: boolean;
    targetsInterface: boolean;
    targetsMethod: boolean;
    targetsParam: boolean;
    targetsAnnotation: boolean;
  };
}

/**
 * Schema registry interface for managing parsed schemas
 */
export interface SchemaRegistry {
  /**
   * Register a schema node
   */
  registerNode(node: SchemaNode): void;
  
  /**
   * Get a schema node by ID
   */
  getNode(id: bigint): SchemaNode | undefined;
  
  /**
   * Get a schema node by fully qualified name
   */
  getNodeByName(name: string): SchemaNode | undefined;
  
  /**
   * Get all nodes in a file
   */
  getNodesByFile(fileId: bigint): SchemaNode[];
  
  /**
   * Check if a node exists
   */
  hasNode(id: bigint): boolean;
  
  /**
   * Clear all registered schemas
   */
  clear(): void;
}

/**
 * Dynamic schema loader interface
 */
export interface DynamicSchemaLoader {
  /**
   * Load schema from remote vat
   */
  loadSchema(target: SchemaTarget): Promise<SchemaPayload>;
  
  /**
   * Parse binary schema data into SchemaNode objects
   */
  parseSchema(data: Uint8Array): SchemaNode[];
  
  /**
   * Get the schema registry
   */
  getRegistry(): SchemaRegistry;
}
