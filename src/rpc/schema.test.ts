/**
 * Phase 7: Dynamic Schema Transfer Protocol - Tests
 */

import { describe, it, expect } from "vitest";
import {
  SchemaFormat,
  type SchemaRequest,
  type SchemaResponse,
  type SchemaTarget,
  type SchemaPayload,
} from "./schema-types.js";
import type { ExceptionType } from "./rpc-types.js";
import {
  serializeSchemaRequest,
  deserializeSchemaRequest,
  serializeSchemaResponse,
  deserializeSchemaResponse,
  SCHEMA_MESSAGE_TYPES,
} from "./schema-serializer.js";
import { parseSchemaNodes, createSchemaRegistry } from "./schema-parser.js";

describe("Schema Types", () => {
  it("should have correct SchemaFormat enum values", () => {
    expect(SchemaFormat.BINARY).toBe(0);
    expect(SchemaFormat.JSON).toBe(1);
    expect(SchemaFormat.CAPNP).toBe(2);
  });

  it("should have correct message type IDs", () => {
    expect(SCHEMA_MESSAGE_TYPES.SCHEMA_REQUEST).toBe(14);
    expect(SCHEMA_MESSAGE_TYPES.SCHEMA_RESPONSE).toBe(15);
  });
});

describe("SchemaRequest Serialization", () => {
  it("should serialize and deserialize allSchemas target", () => {
    const request: SchemaRequest = {
      questionId: 42,
      targetSchema: { type: "allSchemas" },
    };

    const serialized = serializeSchemaRequest(request);
    const deserialized = deserializeSchemaRequest(serialized);

    expect(deserialized.questionId).toBe(42);
    expect(deserialized.targetSchema.type).toBe("allSchemas");
  });

  it("should serialize and deserialize byTypeId target", () => {
    const request: SchemaRequest = {
      questionId: 100,
      targetSchema: { type: "byTypeId", typeId: 0x123456789abcdef0n },
    };

    const serialized = serializeSchemaRequest(request);
    const deserialized = deserializeSchemaRequest(serialized);

    expect(deserialized.questionId).toBe(100);
    expect(deserialized.targetSchema.type).toBe("byTypeId");
    if (deserialized.targetSchema.type === "byTypeId") {
      expect(deserialized.targetSchema.typeId).toBe(0x123456789abcdef0n);
    }
  });

  it("should serialize and deserialize byTypeName target", () => {
    const request: SchemaRequest = {
      questionId: 200,
      targetSchema: { type: "byTypeName", typeName: "test.MyStruct" },
    };

    const serialized = serializeSchemaRequest(request);
    const deserialized = deserializeSchemaRequest(serialized);

    expect(deserialized.questionId).toBe(200);
    expect(deserialized.targetSchema.type).toBe("byTypeName");
    if (deserialized.targetSchema.type === "byTypeName") {
      expect(deserialized.targetSchema.typeName).toBe("test.MyStruct");
    }
  });

  it("should serialize and deserialize bootstrapInterface target", () => {
    const request: SchemaRequest = {
      questionId: 1,
      targetSchema: { type: "bootstrapInterface" },
    };

    const serialized = serializeSchemaRequest(request);
    const deserialized = deserializeSchemaRequest(serialized);

    expect(deserialized.questionId).toBe(1);
    expect(deserialized.targetSchema.type).toBe("bootstrapInterface");
  });
});

describe("SchemaResponse Serialization", () => {
  it("should serialize and deserialize success response", () => {
    const payload: SchemaPayload = {
      schemaData: new Uint8Array([1, 2, 3, 4, 5]),
      format: SchemaFormat.BINARY,
      dependencies: [
        {
          fileId: 0xabcdef1234567890n,
          fileName: "test.capnp",
          schemaHash: new Uint8Array([0xaa, 0xbb, 0xcc]),
        },
      ],
    };

    const response: SchemaResponse = {
      answerId: 42,
      result: { type: "success", payload },
    };

    const serialized = serializeSchemaResponse(response);
    const deserialized = deserializeSchemaResponse(serialized);

    expect(deserialized.answerId).toBe(42);
    expect(deserialized.result.type).toBe("success");
    if (deserialized.result.type === "success") {
      expect(deserialized.result.payload.format).toBe(SchemaFormat.BINARY);
      expect(Array.from(deserialized.result.payload.schemaData)).toEqual([1, 2, 3, 4, 5]);
      expect(deserialized.result.payload.dependencies).toHaveLength(1);
      expect(deserialized.result.payload.dependencies[0].fileName).toBe("test.capnp");
    }
  });

  it("should serialize and deserialize exception response", () => {
    const response: SchemaResponse = {
      answerId: 100,
      result: {
        type: "exception",
        exception: {
          reason: "Schema not found",
          type: 1 as unknown as ExceptionType, // failed
          obsoleteIsCallersFault: false,
          obsoleteDurability: 0,
        },
      },
    };

    const serialized = serializeSchemaResponse(response);
    const deserialized = deserializeSchemaResponse(serialized);

    expect(deserialized.answerId).toBe(100);
    expect(deserialized.result.type).toBe("exception");
    if (deserialized.result.type === "exception") {
      expect(deserialized.result.exception.reason).toBe("Schema not found");
      expect(deserialized.result.exception.type).toBe(1);
    }
  });
});

describe("Schema Parser", () => {
  it("should create an empty schema registry", () => {
    const registry = createSchemaRegistry();

    expect(registry.hasNode(123n)).toBe(false);
    expect(registry.getNode(123n)).toBeUndefined();
    expect(registry.getNodesByFile(456n)).toEqual([]);
  });

  it("should register and retrieve nodes in registry", () => {
    const registry = createSchemaRegistry();

    const node = {
      id: 0x123456789abcdef0n,
      displayName: "test.MyStruct",
      displayNamePrefixLength: 5,
      scopeId: 0n,
      nestedNodes: [],
      annotations: [],
      type: 1 as const, // STRUCT
      structInfo: {
        dataWordCount: 2,
        pointerCount: 1,
        preferredListEncoding: 7,
        isGroup: false,
        discriminantCount: 0,
        discriminantOffset: 0,
        fields: [],
      },
    };

    registry.registerNode(node);

    expect(registry.hasNode(0x123456789abcdef0n)).toBe(true);
    expect(registry.getNode(0x123456789abcdef0n)?.displayName).toBe("test.MyStruct");
    expect(registry.getNodeByName("test.MyStruct")?.id).toBe(0x123456789abcdef0n);
  });

  it("should clear registry", () => {
    const registry = createSchemaRegistry();

    registry.registerNode({
      id: 1n,
      displayName: "test.Node",
      displayNamePrefixLength: 0,
      scopeId: 0n,
      nestedNodes: [],
      annotations: [],
      type: 0 as const,
    });

    expect(registry.hasNode(1n)).toBe(true);

    registry.clear();

    expect(registry.hasNode(1n)).toBe(false);
  });
});

describe("Schema Parser - parseSchemaNodes", () => {
  it("should handle empty data gracefully", () => {
    // Empty data should not crash
    const nodes = parseSchemaNodes(new Uint8Array());
    expect(nodes).toEqual([]);
  });

  it("should handle minimal valid data", () => {
    // Create minimal valid CodeGeneratorRequest structure
    // This is a simplified test - real schema data would be more complex
    const buffer = new ArrayBuffer(64);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    // Set up minimal structure pointers (all null/zero)
    view.setInt32(8, 0, true); // nodes pointer - null
    view.setInt32(16, 0, true); // sourceInfo pointer - null
    view.setInt32(24, 0, true); // requestedFiles pointer - null

    const nodes = parseSchemaNodes(bytes);
    expect(nodes).toEqual([]);
  });
});
