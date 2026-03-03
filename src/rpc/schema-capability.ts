/**
 * Phase 7: Schema Capability Implementation
 * 
 * Implements the SchemaCapability interface defined in rpc.capnp
 * Provides server-side schema serving and client-side schema fetching
 */

import type { 
  SchemaNode, 
  SchemaTarget, 
  SchemaPayload, 
  GetSchemaParams,
  GetSchemaResults,
  ListSchemasResults,
  AvailableSchema,
} from "./schema-types.js";
import { SchemaNodeType, SchemaFormat } from "./schema-types.js";
import { 
  serializeSchemaResponse, 
  deserializeSchemaRequest,
  serializeGetSchemaResults,
  serializeListSchemasResults,
} from "./schema-serializer.js";
import type { RpcConnection } from "./rpc-connection.js";
import { parseSchemaNodes, createSchemaRegistry } from "./schema-parser.js";

// ============================================================================
// Schema Capability Server
// ============================================================================

/**
 * Server-side implementation of the SchemaCapability interface.
 * Provides schema information to remote clients.
 */
export class SchemaCapabilityServer {
  private registry: Map<bigint, SchemaNode>;
  private schemasByName: Map<string, SchemaNode>;

  /**
   * Create a new SchemaCapabilityServer
   * @param initialSchemas - Optional map of schemas to register initially
   */
  constructor(initialSchemas?: Map<bigint, SchemaNode>) {
    this.registry = new Map(initialSchemas);
    this.schemasByName = new Map();
    
    // Build name index
    for (const schema of this.registry.values()) {
      this.schemasByName.set(schema.displayName, schema);
    }
  }

  /**
   * Register a schema node
   * @param node - The schema node to register
   */
  registerSchema(node: SchemaNode): void {
    this.registry.set(node.id, node);
    this.schemasByName.set(node.displayName, node);
  }

  /**
   * Unregister a schema by ID
   * @param typeId - The type ID to unregister
   */
  unregisterSchema(typeId: bigint): void {
    const node = this.registry.get(typeId);
    if (node) {
      this.registry.delete(typeId);
      this.schemasByName.delete(node.displayName);
    }
  }

  /**
   * Get schema information based on target specification
   * @param params - GetSchemaParams containing target and format
   * @returns GetSchemaResults with the schema payload
   */
  async getSchema(params: GetSchemaParams): Promise<GetSchemaResults> {
    const { target, format = SchemaFormat.BINARY } = params;
    
    let schemaData: Uint8Array;
    let dependencies: Array<{ fileId: bigint; fileName: string; schemaHash?: Uint8Array }> = [];

    switch (target.type) {
      case "byTypeId": {
        const node = this.registry.get(target.typeId);
        if (!node) {
          throw new Error(`Schema not found for type ID: ${target.typeId.toString(16)}`);
        }
        schemaData = this.serializeSchemaNode(node, format);
        dependencies = this.collectDependencies(node);
        break;
      }
      
      case "byTypeName": {
        const node = this.schemasByName.get(target.typeName);
        if (!node) {
          throw new Error(`Schema not found for type name: ${target.typeName}`);
        }
        schemaData = this.serializeSchemaNode(node, format);
        dependencies = this.collectDependencies(node);
        break;
      }
      
      case "byFileId": {
        // Get all schemas in a file
        const nodes = this.getSchemasByFileId(target.fileId);
        schemaData = this.serializeSchemaNodes(nodes, format);
        break;
      }
      
      case "byFileName": {
        // Get all schemas in a file by name
        const nodes = this.getSchemasByFileName(target.fileName);
        schemaData = this.serializeSchemaNodes(nodes, format);
        break;
      }
      
      case "allSchemas": {
        // Get all schemas
        const nodes = Array.from(this.registry.values());
        schemaData = this.serializeSchemaNodes(nodes, format);
        break;
      }
      
      case "bootstrapInterface": {
        // Get bootstrap interface schema (if available)
        const bootstrapSchema = this.findBootstrapSchema();
        if (!bootstrapSchema) {
          throw new Error("Bootstrap interface schema not available");
        }
        schemaData = this.serializeSchemaNode(bootstrapSchema, format);
        dependencies = this.collectDependencies(bootstrapSchema);
        break;
      }
      
      default:
        throw new Error(`Unsupported schema target type: ${(target as SchemaTarget).type}`);
    }

    return {
      payload: {
        schemaData,
        format,
        dependencies,
      },
    };
  }

  /**
   * List all available schemas
   * @returns ListSchemasResults with available schema information
   */
  async listAvailableSchemas(): Promise<ListSchemasResults> {
    const schemas: AvailableSchema[] = [];
    
    for (const node of this.registry.values()) {
      schemas.push({
        typeId: node.id,
        displayName: node.displayName,
        fileId: node.scopeId, // Using scopeId as fileId proxy
        fileName: this.inferFileName(node),
        isInterface: node.type === SchemaNodeType.INTERFACE,
        isStruct: node.type === SchemaNodeType.STRUCT,
        isEnum: node.type === SchemaNodeType.ENUM,
      });
    }

    return { schemas };
  }

  /**
   * Handle a raw schema request (for RPC integration)
   * @param requestData - The serialized SchemaRequest
   * @returns The serialized SchemaResponse
   */
  handleRequest(requestData: Uint8Array): Uint8Array {
    try {
      const request = deserializeSchemaRequest(requestData);
      
      const result = this.getSchema({
        target: request.targetSchema,
      });
      
      // Since getSchema is async, we need to handle the promise
      // In a real implementation, this would be properly async
      throw new Error("Async handling not implemented in handleRequest");
    } catch (error) {
      // Return error response
      const errorResponse = {
        answerId: 0,
        result: {
          type: "exception" as const,
          exception: {
            reason: error instanceof Error ? error.message : "Unknown error",
            type: "failed" as const,
            obsoleteIsCallersFault: false,
            obsoleteDurability: 0,
          },
        },
      };
      
      return serializeSchemaResponse(errorResponse);
    }
  }

  /**
   * Get the number of registered schemas
   */
  getSchemaCount(): number {
    return this.registry.size;
  }

  /**
   * Check if a schema is registered
   */
  hasSchema(typeId: bigint): boolean {
    return this.registry.has(typeId);
  }

  // --------------------------------------------------------------------------
  // Private Helper Methods
  // --------------------------------------------------------------------------

  private serializeSchemaNode(node: SchemaNode, format: SchemaFormat): Uint8Array {
    switch (format) {
      case SchemaFormat.BINARY:
        return this.serializeToBinary([node]);
      case SchemaFormat.JSON:
        return this.serializeToJson([node]);
      case SchemaFormat.CAPNP:
        return this.serializeToCapnp([node]);
      default:
        throw new Error(`Unsupported schema format: ${format}`);
    }
  }

  private serializeSchemaNodes(nodes: SchemaNode[], format: SchemaFormat): Uint8Array {
    switch (format) {
      case SchemaFormat.BINARY:
        return this.serializeToBinary(nodes);
      case SchemaFormat.JSON:
        return this.serializeToJson(nodes);
      case SchemaFormat.CAPNP:
        return this.serializeToCapnp(nodes);
      default:
        throw new Error(`Unsupported schema format: ${format}`);
    }
  }

  private serializeToBinary(nodes: SchemaNode[]): Uint8Array {
    // Simplified binary serialization
    // In a full implementation, this would serialize to the actual Cap'n Proto format
    const encoder = new TextEncoder();
    const json = JSON.stringify(nodes, (key, value) => {
      if (typeof value === "bigint") {
        return value.toString();
      }
      return value;
    });
    return encoder.encode(json);
  }

  private serializeToJson(nodes: SchemaNode[]): Uint8Array {
    const encoder = new TextEncoder();
    const json = JSON.stringify({
      nodes: nodes.map(node => ({
        id: node.id.toString(),
        displayName: node.displayName,
        displayNamePrefixLength: node.displayNamePrefixLength,
        scopeId: node.scopeId.toString(),
        type: node.type,
        structInfo: node.structInfo,
        enumInfo: node.enumInfo,
        interfaceInfo: node.interfaceInfo,
      })),
    });
    return encoder.encode(json);
  }

  private serializeToCapnp(nodes: SchemaNode[]): Uint8Array {
    // Placeholder for actual Cap'n Proto schema language serialization
    // This would generate .capnp source code from the schema nodes
    const lines: string[] = [];
    
    for (const node of nodes) {
      if (node.structInfo) {
        lines.push(`struct ${node.displayName} {`);
        for (const field of node.structInfo.fields) {
          lines.push(`  ${field.name} @${field.codeOrder} :${this.typeToCapnp(field.type)};`);
        }
        lines.push("}");
      }
    }
    
    return new TextEncoder().encode(lines.join("\n"));
  }

  private typeToCapnp(type: { kind: { type: string } }): string {
    const kind = type.kind;
    switch (kind.type) {
      case "void": return "Void";
      case "bool": return "Bool";
      case "int8": return "Int8";
      case "int16": return "Int16";
      case "int32": return "Int32";
      case "int64": return "Int64";
      case "uint8": return "UInt8";
      case "uint16": return "UInt16";
      case "uint32": return "UInt32";
      case "uint64": return "UInt64";
      case "float32": return "Float32";
      case "float64": return "Float64";
      case "text": return "Text";
      case "data": return "Data";
      case "list": return "List";
      case "enum": return "UInt16";
      case "struct": return "AnyPointer";
      case "interface": return "Capability";
      default: return "AnyPointer";
    }
  }

  private collectDependencies(_node: SchemaNode): Array<{ fileId: bigint; fileName: string; schemaHash?: Uint8Array }> {
    // In a full implementation, this would analyze the schema and collect
    // all imported schema dependencies
    return [];
  }

  private getSchemasByFileId(fileId: bigint): SchemaNode[] {
    return Array.from(this.registry.values()).filter(node => node.scopeId === fileId);
  }

  private getSchemasByFileName(fileName: string): SchemaNode[] {
    // Infer file name from display name prefix
    return Array.from(this.registry.values()).filter(node => {
      const inferredFileName = this.inferFileName(node);
      return inferredFileName === fileName || node.displayName.startsWith(fileName);
    });
  }

  private inferFileName(node: SchemaNode): string {
    // Infer file name from display name
    // e.g., "foo.bar.MyStruct" -> "foo/bar.capnp"
    const parts = node.displayName.split(".");
    if (parts.length > 1) {
      return parts.slice(0, -1).join("/") + ".capnp";
    }
    return "unknown.capnp";
  }

  private findBootstrapSchema(): SchemaNode | undefined {
    // Look for a schema that might be the bootstrap interface
    // This is a heuristic - in practice, the bootstrap interface would be
    // explicitly registered
    for (const node of this.registry.values()) {
      if (node.type === SchemaNodeType.INTERFACE) {
        return node;
      }
    }
    return undefined;
  }
}

// ============================================================================
// Schema Capability Client
// ============================================================================

/**
 * Client-side implementation for accessing remote SchemaCapability
 */
export class SchemaCapabilityClient {
  private connection: RpcConnection;

  /**
   * Create a new SchemaCapabilityClient
   * @param connection - The RPC connection to use
   */
  constructor(connection: RpcConnection) {
    this.connection = connection;
  }

  /**
   * Fetch schema information from the remote server
   * @param target - The schema target specification
   * @param format - The desired format (defaults to BINARY)
   * @returns The schema node
   */
  async getSchema(target: SchemaTarget, format: SchemaFormat = SchemaFormat.BINARY): Promise<SchemaNode> {
    // Use the connection's getDynamicSchema method for type ID lookups
    if (target.type === "byTypeId") {
      return this.connection.getDynamicSchema(target.typeId);
    }

    // For other target types, we need to use the schema capability interface
    // This is a simplified implementation
    const params: GetSchemaParams = { target, format };
    
    // In a full implementation, this would make an RPC call to the schema capability
    // For now, we delegate to the connection's method
    if (target.type === "byTypeName") {
      return this.connection.getDynamicSchemaByName(target.typeName);
    }

    throw new Error(`Schema target type not implemented: ${target.type}`);
  }

  /**
   * Fetch schema by type ID
   * @param typeId - The type ID
   * @returns The schema node
   */
  async getSchemaById(typeId: bigint): Promise<SchemaNode> {
    return this.connection.getDynamicSchema(typeId);
  }

  /**
   * Fetch schema by type name
   * @param typeName - The fully qualified type name
   * @returns The schema node
   */
  async getSchemaByName(typeName: string): Promise<SchemaNode> {
    return this.connection.getDynamicSchemaByName(typeName);
  }

  /**
   * List all available schemas from the remote server
   * @returns Array of available schema information
   */
  async listAvailableSchemas(): Promise<AvailableSchema[]> {
    const schemas = await this.connection.listAvailableSchemas();
    return schemas.map(s => ({
      typeId: s.typeId,
      displayName: s.displayName,
      fileId: BigInt(0), // Not provided by connection method
      fileName: "", // Not provided by connection method
      isInterface: false, // Not provided by connection method
      isStruct: true,
      isEnum: false,
    }));
  }

  /**
   * Fetch multiple schemas at once
   * @param typeIds - Array of type IDs to fetch
   * @returns Map of type ID to schema node
   */
  async getSchemas(typeIds: bigint[]): Promise<Map<bigint, SchemaNode>> {
    const results = new Map<bigint, SchemaNode>();
    
    // Fetch schemas in parallel
    await Promise.all(
      typeIds.map(async (typeId) => {
        try {
          const schema = await this.getSchemaById(typeId);
          results.set(typeId, schema);
        } catch (error) {
          console.warn(`Failed to fetch schema ${typeId.toString(16)}:`, error);
        }
      })
    );
    
    return results;
  }

  /**
   * Check if a schema is available on the remote server
   * @param typeId - The type ID to check
   * @returns True if the schema is available
   */
  async hasSchema(typeId: bigint): Promise<boolean> {
    try {
      await this.getSchemaById(typeId);
      return true;
    } catch {
      return false;
    }
  }
}

// ============================================================================
// Schema Provider Registration Helper
// ============================================================================

// Note: RpcConnection.registerSchemaProvider is defined in rpc-connection.ts
// to avoid circular imports. This file only defines the SchemaCapabilityServer
// and SchemaCapabilityClient classes.
