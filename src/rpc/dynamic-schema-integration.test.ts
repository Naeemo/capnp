/**
 * Phase 7: Dynamic Schema Integration Tests
 * 
 * Tests for RpcConnection.getDynamicSchema() and related methods
 */

import { describe, it, expect, vi } from "vitest";
import { RpcConnection } from "./rpc-connection.js";
import type { RpcTransport } from "./transport.js";
import type { SchemaNode } from "./schema-types.js";

// Mock transport for testing
function createMockTransport(): RpcTransport {
  return {
    connected: true,
    send: vi.fn().mockResolvedValue(undefined),
    receive: vi.fn().mockResolvedValue(null),
    close: vi.fn(),
    onClose: undefined,
    onError: undefined,
  };
}

describe("RpcConnection Dynamic Schema", () => {
  describe("getDynamicSchema", () => {
    it("should return cached schema if available", async () => {
      const transport = createMockTransport();
      const connection = new RpcConnection(transport);

      // Pre-register a schema
      const mockSchema: SchemaNode = {
        id: BigInt("0x1234567890abcdef"),
        displayName: "TestStruct",
        displayNamePrefixLength: 0,
        scopeId: BigInt(0),
        nestedNodes: [],
        annotations: [],
        type: 1, // STRUCT
        structInfo: {
          dataWordCount: 1,
          pointerCount: 0,
          preferredListEncoding: 0,
          isGroup: false,
          discriminantCount: 0,
          discriminantOffset: 0,
          fields: [],
        },
      };

      connection.registerSchema(mockSchema);

      // Should return cached schema without network call
      const schema = await connection.getDynamicSchema(BigInt("0x1234567890abcdef"));
      
      expect(schema).toBeDefined();
      expect(schema.displayName).toBe("TestStruct");
      expect(transport.send).not.toHaveBeenCalled();
    });

    it("should check if schema is cached", () => {
      const transport = createMockTransport();
      const connection = new RpcConnection(transport);

      const typeId = BigInt("0x1234567890abcdef");
      
      // Initially not cached
      expect(connection.hasCachedSchema(typeId)).toBe(false);

      // Register schema
      const mockSchema: SchemaNode = {
        id: typeId,
        displayName: "TestStruct",
        displayNamePrefixLength: 0,
        scopeId: BigInt(0),
        nestedNodes: [],
        annotations: [],
        type: 1,
        structInfo: {
          dataWordCount: 1,
          pointerCount: 0,
          preferredListEncoding: 0,
          isGroup: false,
          discriminantCount: 0,
          discriminantOffset: 0,
          fields: [],
        },
      };
      connection.registerSchema(mockSchema);

      // Now cached
      expect(connection.hasCachedSchema(typeId)).toBe(true);
    });

    it("should clear schema cache", () => {
      const transport = createMockTransport();
      const connection = new RpcConnection(transport);

      const typeId = BigInt("0x1234567890abcdef");
      
      // Register schema
      const mockSchema: SchemaNode = {
        id: typeId,
        displayName: "TestStruct",
        displayNamePrefixLength: 0,
        scopeId: BigInt(0),
        nestedNodes: [],
        annotations: [],
        type: 1,
        structInfo: {
          dataWordCount: 1,
          pointerCount: 0,
          preferredListEncoding: 0,
          isGroup: false,
          discriminantCount: 0,
          discriminantOffset: 0,
          fields: [],
        },
      };
      connection.registerSchema(mockSchema);

      expect(connection.hasCachedSchema(typeId)).toBe(true);

      // Clear cache
      connection.clearSchemaCache();

      // Should still be in registry but cache cleared
      expect(connection.getSchemaRegistry().hasNode(typeId)).toBe(true);
    });

    it("should get schema registry", () => {
      const transport = createMockTransport();
      const connection = new RpcConnection(transport);

      const registry = connection.getSchemaRegistry();
      
      expect(registry).toBeDefined();
      expect(typeof registry.registerNode).toBe("function");
      expect(typeof registry.getNode).toBe("function");
      expect(typeof registry.hasNode).toBe("function");
    });
  });

  describe("Schema Registry Integration", () => {
    it("should register and retrieve schema by name", () => {
      const transport = createMockTransport();
      const connection = new RpcConnection(transport);

      const mockSchema: SchemaNode = {
        id: BigInt("0x1234567890abcdef"),
        displayName: "myapp.TestStruct",
        displayNamePrefixLength: 0,
        scopeId: BigInt(0),
        nestedNodes: [],
        annotations: [],
        type: 1,
        structInfo: {
          dataWordCount: 1,
          pointerCount: 0,
          preferredListEncoding: 0,
          isGroup: false,
          discriminantCount: 0,
          discriminantOffset: 0,
          fields: [],
        },
      };

      connection.registerSchema(mockSchema);

      const registry = connection.getSchemaRegistry();
      const retrieved = registry.getNodeByName("myapp.TestStruct");
      
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(BigInt("0x1234567890abcdef"));
    });
  });
});
