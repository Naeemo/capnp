/**
 * Tests for Dynamic Reader
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createDynamicReader, createDynamicReaderByTypeId, dumpDynamicReader } from "./dynamic-reader.js";
import type { SchemaNode, SchemaField, SchemaType } from "./schema-types.js";
import { SchemaNodeType } from "./schema-types.js";

// Helper to create a simple test schema
function createTestSchema(): SchemaNode {
  return {
    id: BigInt("0x123456789abcdef0"),
    displayName: "TestStruct",
    displayNamePrefixLength: 0,
    scopeId: BigInt(0),
    nestedNodes: [],
    annotations: [],
    type: SchemaNodeType.STRUCT,
    structInfo: {
      dataWordCount: 2,  // 2 data words = 128 bits
      pointerCount: 2,
      preferredListEncoding: 0,
      isGroup: false,
      discriminantCount: 0,
      discriminantOffset: 0,
      fields: [
        // Bool field at bit 0
        {
          name: "active",
          codeOrder: 0,
          discriminantValue: 0,
          offset: 0,
          type: { kind: { type: "bool" } },
          hadExplicitDefault: false,
        },
        // Int32 field at bits 32-63
        {
          name: "count",
          codeOrder: 1,
          discriminantValue: 0,
          offset: 32,
          type: { kind: { type: "int32" } },
          hadExplicitDefault: false,
        },
        // Float64 field at bits 64-127
        {
          name: "value",
          codeOrder: 2,
          discriminantValue: 0,
          offset: 64,
          type: { kind: { type: "float64" } },
          hadExplicitDefault: false,
        },
        // Text field at pointer 0 (bit 128)
        {
          name: "name",
          codeOrder: 3,
          discriminantValue: 0,
          offset: 128,
          type: { kind: { type: "text" } },
          hadExplicitDefault: false,
        },
        // List field at pointer 1 (bit 192)
        {
          name: "numbers",
          codeOrder: 4,
          discriminantValue: 0,
          offset: 192,
          type: { 
            kind: { 
              type: "list", 
              elementType: { kind: { type: "int32" } } 
            } 
          },
          hadExplicitDefault: false,
        },
      ],
    },
  };
}

describe("DynamicReader", () => {
  let testSchema: SchemaNode;

  beforeEach(() => {
    testSchema = createTestSchema();
  });

  describe("createDynamicReader", () => {
    it("should create a reader from schema and buffer", () => {
      // Create a minimal test buffer
      // This test verifies the reader is created correctly
      const buffer = new ArrayBuffer(32);
      const view = new DataView(buffer);
      
      // Write message header (single segment, 3 words)
      view.setUint32(0, 0, true);  // segment count - 1
      view.setUint32(4, 3, true);  // first segment size
      
      // Write root pointer (struct pointer at word 0)
      // Struct pointer: offset=0, dataWords=2, pointerCount=0
      // Pointer format: [offset: 30 bits] [dataWords: 16 bits] [pointerCount: 16 bits] [tag: 2 bits = 0]
      const rootPtr = BigInt.asUintN(64, BigInt(0x0000000200000000));
      view.setBigUint64(8, rootPtr, true);
      
      // Write struct data (words 1-2 are data section)
      // Word 1: bool at bit 0, int32 at bits 32-63
      view.setUint8(16, 1);  // active = true
      view.setInt32(20, 42, true);  // count = 42
      
      // Word 2: float64 at bits 0-63
      view.setFloat64(24, 3.14, true);  // value = 3.14

      const reader = createDynamicReader(testSchema, buffer);
      
      expect(reader).toBeDefined();
      expect(reader.getSchema()).toBe(testSchema);
      expect(reader.has("active")).toBe(true);
      expect(reader.has("count")).toBe(true);
      expect(reader.has("value")).toBe(true);
    });

    it("should throw error for non-struct schema", () => {
      const nonStructSchema: SchemaNode = {
        ...testSchema,
        type: SchemaNodeType.ENUM,
        structInfo: undefined,
      };

      expect(() => createDynamicReader(nonStructSchema, new ArrayBuffer(64))).toThrow(
        "not a struct"
      );
    });
  });

  describe("field access", () => {
    it("should return field names", () => {
      const buffer = new ArrayBuffer(64);
      const view = new DataView(buffer);
      
      // Minimal header
      view.setUint32(0, 0, true);
      view.setUint32(4, 6, true);
      
      const reader = createDynamicReader(testSchema, buffer);
      const fieldNames = reader.getFieldNames();
      
      expect(fieldNames).toContain("active");
      expect(fieldNames).toContain("count");
      expect(fieldNames).toContain("value");
      expect(fieldNames).toContain("name");
      expect(fieldNames).toContain("numbers");
    });

    it("should check field existence", () => {
      const buffer = new ArrayBuffer(64);
      const view = new DataView(buffer);
      
      view.setUint32(0, 0, true);
      view.setUint32(4, 6, true);
      
      const reader = createDynamicReader(testSchema, buffer);
      
      expect(reader.has("active")).toBe(true);
      expect(reader.has("nonexistent")).toBe(false);
    });

    it("should throw error for unknown field", () => {
      const buffer = new ArrayBuffer(64);
      const view = new DataView(buffer);
      
      view.setUint32(0, 0, true);
      view.setUint32(4, 6, true);
      
      const reader = createDynamicReader(testSchema, buffer);
      
      expect(() => reader.get("nonexistent")).toThrow("not found");
    });
  });

  describe("createDynamicReaderByTypeId", () => {
    it("should create reader from type ID and registry", () => {
      const registry = new Map<bigint, SchemaNode>();
      registry.set(testSchema.id, testSchema);

      const buffer = new ArrayBuffer(64);
      const view = new DataView(buffer);
      
      view.setUint32(0, 0, true);
      view.setUint32(4, 6, true);
      
      const reader = createDynamicReaderByTypeId(testSchema.id, buffer, registry);
      
      expect(reader).toBeDefined();
      expect(reader.getSchema().id).toBe(testSchema.id);
    });

    it("should throw error for unknown type ID", () => {
      const registry = new Map<bigint, SchemaNode>();
      const buffer = new ArrayBuffer(64);

      expect(() => createDynamicReaderByTypeId(BigInt(999), buffer, registry)).toThrow(
        "Schema not found"
      );
    });
  });

  describe("dumpDynamicReader", () => {
    it("should dump all fields", () => {
      const buffer = new ArrayBuffer(64);
      const view = new DataView(buffer);
      
      view.setUint32(0, 0, true);
      view.setUint32(4, 6, true);
      
      const reader = createDynamicReader(testSchema, buffer);
      const dump = dumpDynamicReader(reader);
      
      expect(dump).toHaveProperty("active");
      expect(dump).toHaveProperty("count");
      expect(dump).toHaveProperty("value");
      expect(dump).toHaveProperty("name");
      expect(dump).toHaveProperty("numbers");
    });
  });
});

describe("DynamicReader - Complex Types", () => {
  it("should handle enum fields", () => {
    const enumSchema: SchemaNode = {
      id: BigInt("0x123456"),
      displayName: "Status",
      displayNamePrefixLength: 0,
      scopeId: BigInt(0),
      nestedNodes: [],
      annotations: [],
      type: SchemaNodeType.STRUCT,
      structInfo: {
        dataWordCount: 1,
        pointerCount: 0,
        preferredListEncoding: 0,
        isGroup: false,
        discriminantCount: 0,
        discriminantOffset: 0,
        fields: [
          {
            name: "status",
            codeOrder: 0,
            discriminantValue: 0,
            offset: 0,
            type: { 
              kind: { 
                type: "enum", 
                typeId: BigInt("0xabcdef") 
              } 
            },
            hadExplicitDefault: false,
          },
        ],
      },
    };

    const buffer = new ArrayBuffer(24);
    const view = new DataView(buffer);
    
    view.setUint32(0, 0, true);
    view.setUint32(4, 2, true);
    
    const rootPtr = BigInt.asUintN(64, BigInt(0x0000000100000000) | (BigInt(0) << BigInt(32)));
    view.setBigUint64(8, rootPtr, true);
    
    view.setUint16(16, 2, true);  // enum value = 2
    
    const reader = createDynamicReader(enumSchema, buffer);
    const status = reader.get("status");
    
    expect(status).toBe(2);
  });
});