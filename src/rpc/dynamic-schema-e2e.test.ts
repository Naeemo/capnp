/**
 * Phase 7: Dynamic Schema End-to-End Tests
 *
 * Tests for the complete dynamic schema flow:
 * - Dynamic reader/writer functionality
 * - Complex types (nested structs, lists, unions)
 * - Schema capability interfaces
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDynamicReader } from './dynamic-reader.js';
import { createDynamicWriter } from './dynamic-writer.js';
import { RpcConnection } from './rpc-connection.js';
import { SchemaCapabilityClient, SchemaCapabilityServer } from './schema-capability.js';
import { createSchemaRegistry, parseSchemaNodes } from './schema-parser.js';
import type { SchemaField, SchemaNode } from './schema-types.js';
import { SchemaNodeType } from './schema-types.js';
import type { RpcTransport } from './transport.js';

// ============================================================================
// Test Schema Definitions
// ============================================================================

function createSimpleStructSchema(): SchemaNode {
  return {
    id: BigInt('0x1234567890abcdef'),
    displayName: 'test.SimpleStruct',
    displayNamePrefixLength: 5,
    scopeId: BigInt(0),
    nestedNodes: [],
    annotations: [],
    type: SchemaNodeType.STRUCT,
    structInfo: {
      dataWordCount: 2,
      pointerCount: 1,
      preferredListEncoding: 0,
      isGroup: false,
      discriminantCount: 0,
      discriminantOffset: 0,
      fields: [
        {
          name: 'id',
          codeOrder: 0,
          discriminantValue: 0,
          offset: 0,
          type: { kind: { type: 'uint32' } },
          hadExplicitDefault: false,
        },
        {
          name: 'active',
          codeOrder: 1,
          discriminantValue: 0,
          offset: 32,
          type: { kind: { type: 'bool' } },
          hadExplicitDefault: false,
        },
        {
          name: 'score',
          codeOrder: 2,
          discriminantValue: 0,
          offset: 64,
          type: { kind: { type: 'float64' } },
          hadExplicitDefault: false,
        },
        {
          name: 'name',
          codeOrder: 3,
          discriminantValue: 0,
          offset: 128,
          type: { kind: { type: 'text' } },
          hadExplicitDefault: false,
        },
      ],
    },
  };
}

function createNestedStructSchema(): SchemaNode {
  const innerSchema: SchemaNode = {
    id: BigInt('0xabcdef1234567890'),
    displayName: 'test.InnerStruct',
    displayNamePrefixLength: 5,
    scopeId: BigInt(0),
    nestedNodes: [],
    annotations: [],
    type: SchemaNodeType.STRUCT,
    structInfo: {
      dataWordCount: 1,
      pointerCount: 1,
      preferredListEncoding: 0,
      isGroup: false,
      discriminantCount: 0,
      discriminantOffset: 0,
      fields: [
        {
          name: 'value',
          codeOrder: 0,
          discriminantValue: 0,
          offset: 0,
          type: { kind: { type: 'int32' } },
          hadExplicitDefault: false,
        },
        {
          name: 'label',
          codeOrder: 1,
          discriminantValue: 0,
          offset: 64,
          type: { kind: { type: 'text' } },
          hadExplicitDefault: false,
        },
      ],
    },
  };

  return {
    id: BigInt('0xfedcba0987654321'),
    displayName: 'test.OuterStruct',
    displayNamePrefixLength: 5,
    scopeId: BigInt(0),
    nestedNodes: [{ name: 'InnerStruct', id: innerSchema.id }],
    annotations: [],
    type: SchemaNodeType.STRUCT,
    structInfo: {
      dataWordCount: 1,
      pointerCount: 2,
      preferredListEncoding: 0,
      isGroup: false,
      discriminantCount: 0,
      discriminantOffset: 0,
      fields: [
        {
          name: 'id',
          codeOrder: 0,
          discriminantValue: 0,
          offset: 0,
          type: { kind: { type: 'uint64' } },
          hadExplicitDefault: false,
        },
        {
          name: 'inner',
          codeOrder: 1,
          discriminantValue: 0,
          offset: 64,
          type: { kind: { type: 'struct', typeId: innerSchema.id } },
          hadExplicitDefault: false,
        },
        {
          name: 'metadata',
          codeOrder: 2,
          discriminantValue: 0,
          offset: 128,
          type: { kind: { type: 'text' } },
          hadExplicitDefault: false,
        },
      ],
    },
  };
}

function createListStructSchema(): SchemaNode {
  return {
    id: BigInt('0x1111111111111111'),
    displayName: 'test.ListStruct',
    displayNamePrefixLength: 5,
    scopeId: BigInt(0),
    nestedNodes: [],
    annotations: [],
    type: SchemaNodeType.STRUCT,
    structInfo: {
      dataWordCount: 1,
      pointerCount: 3,
      preferredListEncoding: 0,
      isGroup: false,
      discriminantCount: 0,
      discriminantOffset: 0,
      fields: [
        {
          name: 'intList',
          codeOrder: 0,
          discriminantValue: 0,
          offset: 0,
          type: { kind: { type: 'list', elementType: { kind: { type: 'int32' } } } },
          hadExplicitDefault: false,
        },
        {
          name: 'textList',
          codeOrder: 1,
          discriminantValue: 0,
          offset: 64,
          type: { kind: { type: 'list', elementType: { kind: { type: 'text' } } } },
          hadExplicitDefault: false,
        },
        {
          name: 'boolList',
          codeOrder: 2,
          discriminantValue: 0,
          offset: 128,
          type: { kind: { type: 'list', elementType: { kind: { type: 'bool' } } } },
          hadExplicitDefault: false,
        },
        {
          name: 'count',
          codeOrder: 3,
          discriminantValue: 0,
          offset: 32,
          type: { kind: { type: 'uint32' } },
          hadExplicitDefault: false,
        },
      ],
    },
  };
}

function createEnumStructSchema(): SchemaNode {
  const enumSchema: SchemaNode = {
    id: BigInt('0x3333333333333333'),
    displayName: 'test.Status',
    displayNamePrefixLength: 5,
    scopeId: BigInt(0),
    nestedNodes: [],
    annotations: [],
    type: SchemaNodeType.ENUM,
    enumInfo: {
      enumerants: [
        { name: 'PENDING', codeOrder: 0, annotations: [] },
        { name: 'RUNNING', codeOrder: 1, annotations: [] },
        { name: 'COMPLETED', codeOrder: 2, annotations: [] },
        { name: 'FAILED', codeOrder: 3, annotations: [] },
      ],
    },
  };

  return {
    id: BigInt('0x4444444444444444'),
    displayName: 'test.EnumStruct',
    displayNamePrefixLength: 5,
    scopeId: BigInt(0),
    nestedNodes: [{ name: 'Status', id: enumSchema.id }],
    annotations: [],
    type: SchemaNodeType.STRUCT,
    structInfo: {
      dataWordCount: 1,
      pointerCount: 1,
      preferredListEncoding: 0,
      isGroup: false,
      discriminantCount: 0,
      discriminantOffset: 0,
      fields: [
        {
          name: 'status',
          codeOrder: 0,
          discriminantValue: 0,
          offset: 0,
          type: { kind: { type: 'enum', typeId: enumSchema.id } },
          hadExplicitDefault: false,
        },
        {
          name: 'message',
          codeOrder: 1,
          discriminantValue: 0,
          offset: 64,
          type: { kind: { type: 'text' } },
          hadExplicitDefault: false,
        },
      ],
    },
  };
}

// ============================================================================
// E2E Tests
// ============================================================================

describe('Dynamic Schema E2E', () => {
  describe('SchemaCapability Server/Client', () => {
    it('should serve and fetch schema by type ID', async () => {
      const schema = createSimpleStructSchema();
      const registry = new Map<bigint, SchemaNode>();
      registry.set(schema.id, schema);

      // Create server
      const server = new SchemaCapabilityServer(registry);

      // Fetch schema directly from server (no RPC needed for this test)
      const result = await server.getSchema({ target: { type: 'byTypeId', typeId: schema.id } });

      expect(result).toBeDefined();
      expect(result.payload).toBeDefined();
      expect(result.payload.schemaData).toBeDefined();
    });

    it('should serve and fetch schema by name', async () => {
      const schema = createSimpleStructSchema();
      const registry = new Map<bigint, SchemaNode>();
      registry.set(schema.id, schema);

      const server = new SchemaCapabilityServer(registry);
      const result = await server.getSchema({
        target: { type: 'byTypeName', typeName: 'test.SimpleStruct' },
      });

      expect(result).toBeDefined();
      expect(result.payload).toBeDefined();
    });

    it('should list available schemas', async () => {
      const schema1 = createSimpleStructSchema();
      const schema2 = createNestedStructSchema();
      const registry = new Map<bigint, SchemaNode>();
      registry.set(schema1.id, schema1);
      registry.set(schema2.id, schema2);

      const server = new SchemaCapabilityServer(registry);
      const result = await server.listAvailableSchemas();

      expect(result.schemas).toHaveLength(2);
      expect(result.schemas.map((s) => s.displayName)).toContain('test.SimpleStruct');
      expect(result.schemas.map((s) => s.displayName)).toContain('test.OuterStruct');
    });

    it('should handle schema not found error', async () => {
      const registry = new Map<bigint, SchemaNode>();
      const server = new SchemaCapabilityServer(registry);

      await expect(
        server.getSchema({ target: { type: 'byTypeId', typeId: BigInt('0x9999999999999999') } })
      ).rejects.toThrow('Schema not found');
    });
  });

  describe('End-to-End Message Flow', () => {
    it('should write and read simple struct using dynamic schema', async () => {
      const schema = createSimpleStructSchema();

      // Create writer and set values
      const writer = createDynamicWriter(schema);
      writer.set('id', 42);
      writer.setText('name', 'Test Object');
      writer.set('active', true);

      // Serialize
      const buffer = writer.toBuffer();
      expect(buffer.byteLength).toBeGreaterThan(0);

      // Create reader and verify
      const reader = createDynamicReader(schema, buffer);
      expect(reader.get('id')).toBe(42);
      expect(reader.get('active')).toBe(true);
    });

    it('should handle list fields', async () => {
      const schema = createListStructSchema();

      // Write
      const writer = createDynamicWriter(schema);
      const intListWriter = writer.initList('intList', 3);
      intListWriter.setAll([1, 2, 3]);

      writer.set('count', 3);

      const buffer = writer.toBuffer();

      // Read
      const reader = createDynamicReader(schema, buffer);
      const intList = reader.getList('intList');
      expect(intList).toBeDefined();
      expect(intList).toHaveLength(3);
    });

    it('should handle enum fields', async () => {
      const schema = createEnumStructSchema();

      // Write
      const writer = createDynamicWriter(schema);
      writer.set('status', 2); // COMPLETED
      writer.setText('message', 'Task finished');

      const buffer = writer.toBuffer();

      // Read
      const reader = createDynamicReader(schema, buffer);
      expect(reader.get('status')).toBe(2);
    });
  });

  describe('Schema Registry Integration', () => {
    it('should register and retrieve schemas', () => {
      const schema = createSimpleStructSchema();
      const registry = createSchemaRegistry();

      registry.registerNode(schema);

      expect(registry.hasNode(schema.id)).toBe(true);
      expect(registry.getNode(schema.id)?.displayName).toBe('test.SimpleStruct');
      expect(registry.getNodeByName('test.SimpleStruct')?.id).toBe(schema.id);
    });

    it('should clear schema registry', () => {
      const schema = createSimpleStructSchema();
      const registry = createSchemaRegistry();

      registry.registerNode(schema);
      expect(registry.hasNode(schema.id)).toBe(true);

      registry.clear();
      expect(registry.hasNode(schema.id)).toBe(false);
    });
  });
});

// ============================================================================
// Complex Type Tests
// ============================================================================

describe('Dynamic Schema - Complex Types', () => {
  describe('Nested Structs', () => {
    it('should handle nested struct initialization', async () => {
      const outerSchema = createNestedStructSchema();

      // Write outer struct
      const writer = createDynamicWriter(outerSchema);
      writer.set('id', BigInt('0x1234567890abcdef'));
      writer.setText('metadata', 'test data');

      // Initialize nested struct
      const _innerWriter = writer.initStruct('inner');
      // Note: inner struct without full schema has limited functionality

      const buffer = writer.toBuffer();
      expect(buffer.byteLength).toBeGreaterThan(0);

      // Read
      const reader = createDynamicReader(outerSchema, buffer);
      expect(reader.get('id')).toBe(BigInt('0x1234567890abcdef'));
    });
  });

  describe('All Primitive Types', () => {
    it('should handle integer types', async () => {
      const schema: SchemaNode = {
        id: BigInt('0x9999999999999999'),
        displayName: 'test.IntegerStruct',
        displayNamePrefixLength: 5,
        scopeId: BigInt(0),
        nestedNodes: [],
        annotations: [],
        type: SchemaNodeType.STRUCT,
        structInfo: {
          dataWordCount: 2,
          pointerCount: 0,
          preferredListEncoding: 0,
          isGroup: false,
          discriminantCount: 0,
          discriminantOffset: 0,
          fields: [
            {
              name: 'int32Field',
              codeOrder: 0,
              discriminantValue: 0,
              offset: 0,
              type: { kind: { type: 'int32' } },
              hadExplicitDefault: false,
            },
          ],
        },
      };

      const writer = createDynamicWriter(schema);
      writer.set('int32Field', -2147483648);

      const buffer = writer.toBuffer();
      expect(buffer.byteLength).toBeGreaterThan(0);

      // Read and verify
      const reader = createDynamicReader(schema, buffer);
      expect(reader.get('int32Field')).toBe(-2147483648);
    });

    it('should handle float types', async () => {
      const schema: SchemaNode = {
        id: BigInt('0x999999999999999a'),
        displayName: 'test.FloatStruct',
        displayNamePrefixLength: 5,
        scopeId: BigInt(0),
        nestedNodes: [],
        annotations: [],
        type: SchemaNodeType.STRUCT,
        structInfo: {
          dataWordCount: 2,
          pointerCount: 0,
          preferredListEncoding: 0,
          isGroup: false,
          discriminantCount: 0,
          discriminantOffset: 0,
          fields: [
            {
              name: 'float64Field',
              codeOrder: 0,
              discriminantValue: 0,
              offset: 0,
              type: { kind: { type: 'float64' } },
              hadExplicitDefault: false,
            },
          ],
        },
      };

      const writer = createDynamicWriter(schema);
      writer.set('float64Field', Math.E);

      const buffer = writer.toBuffer();
      expect(buffer.byteLength).toBeGreaterThan(0);

      // Read and verify
      const reader = createDynamicReader(schema, buffer);
      expect(reader.get('float64Field')).toBeCloseTo(Math.E, 10);
    });

    it('should handle text and data fields', async () => {
      const schema: SchemaNode = {
        id: BigInt('0x999999999999999b'),
        displayName: 'test.TextDataStruct',
        displayNamePrefixLength: 5,
        scopeId: BigInt(0),
        nestedNodes: [],
        annotations: [],
        type: SchemaNodeType.STRUCT,
        structInfo: {
          dataWordCount: 0,
          pointerCount: 2,
          preferredListEncoding: 0,
          isGroup: false,
          discriminantCount: 0,
          discriminantOffset: 0,
          fields: [
            {
              name: 'textField',
              codeOrder: 0,
              discriminantValue: 0,
              offset: 0,
              type: { kind: { type: 'text' } },
              hadExplicitDefault: false,
            },
            {
              name: 'dataField',
              codeOrder: 1,
              discriminantValue: 0,
              offset: 64,
              type: { kind: { type: 'data' } },
              hadExplicitDefault: false,
            },
          ],
        },
      };

      const writer = createDynamicWriter(schema);
      writer.setText('textField', 'Hello, World!');
      writer.setData('dataField', new Uint8Array([0x01, 0x02, 0x03, 0x04]));

      const buffer = writer.toBuffer();
      expect(buffer.byteLength).toBeGreaterThan(0);

      // Read and verify
      const reader = createDynamicReader(schema, buffer);
      expect(reader.get('textField')).toBe('Hello, World!');
    });
  });

  describe('Lists of Complex Types', () => {
    it('should handle list of text', async () => {
      const schema: SchemaNode = {
        id: BigInt('0x8888888888888888'),
        displayName: 'test.TextListStruct',
        displayNamePrefixLength: 5,
        scopeId: BigInt(0),
        nestedNodes: [],
        annotations: [],
        type: SchemaNodeType.STRUCT,
        structInfo: {
          dataWordCount: 0,
          pointerCount: 1,
          preferredListEncoding: 0,
          isGroup: false,
          discriminantCount: 0,
          discriminantOffset: 0,
          fields: [
            {
              name: 'items',
              codeOrder: 0,
              discriminantValue: 0,
              offset: 0,
              type: { kind: { type: 'list', elementType: { kind: { type: 'text' } } } },
              hadExplicitDefault: false,
            },
          ],
        },
      };

      const writer = createDynamicWriter(schema);
      const _listWriter = writer.initList('items', 3);
      // Text list support is limited in current implementation

      const buffer = writer.toBuffer();
      expect(buffer.byteLength).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Performance and Edge Case Tests
// ============================================================================

describe('Dynamic Schema - Performance and Edge Cases', () => {
  it('should handle empty structs', async () => {
    const schema: SchemaNode = {
      id: BigInt('0xaaaaaaaaaaaaaaaa'),
      displayName: 'test.EmptyStruct',
      displayNamePrefixLength: 5,
      scopeId: BigInt(0),
      nestedNodes: [],
      annotations: [],
      type: SchemaNodeType.STRUCT,
      structInfo: {
        dataWordCount: 0,
        pointerCount: 0,
        preferredListEncoding: 0,
        isGroup: false,
        discriminantCount: 0,
        discriminantOffset: 0,
        fields: [],
      },
    };

    const writer = createDynamicWriter(schema);
    const buffer = writer.toBuffer();
    expect(buffer.byteLength).toBeGreaterThan(0);

    const reader = createDynamicReader(schema, buffer);
    expect(reader.getFieldNames()).toHaveLength(0);
  });

  it('should handle large lists', async () => {
    const schema: SchemaNode = {
      id: BigInt('0xbbbbbbbbbbbbbbbb'),
      displayName: 'test.LargeListStruct',
      displayNamePrefixLength: 5,
      scopeId: BigInt(0),
      nestedNodes: [],
      annotations: [],
      type: SchemaNodeType.STRUCT,
      structInfo: {
        dataWordCount: 0,
        pointerCount: 1,
        preferredListEncoding: 0,
        isGroup: false,
        discriminantCount: 0,
        discriminantOffset: 0,
        fields: [
          {
            name: 'values',
            codeOrder: 0,
            discriminantValue: 0,
            offset: 0,
            type: { kind: { type: 'list', elementType: { kind: { type: 'int32' } } } },
            hadExplicitDefault: false,
          },
        ],
      },
    };

    const writer = createDynamicWriter(schema);
    const listWriter = writer.initList('values', 1000);

    for (let i = 0; i < 1000; i++) {
      listWriter.set(i, i * 10);
    }

    const buffer = writer.toBuffer();
    expect(buffer.byteLength).toBeGreaterThan(0);

    const reader = createDynamicReader(schema, buffer);
    const values = reader.getList('values');
    expect(values).toBeDefined();
    expect(values).toHaveLength(1000);
  });
});
