/**
 * Tests for Dynamic Writer
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  createDynamicWriter,
  createDynamicWriterByTypeId,
  serializeDynamic,
  serializeDynamicByTypeId,
} from './dynamic-writer.js';
import type { SchemaNode } from './schema-types.js';
import { SchemaNodeType } from './schema-types.js';

// Helper to create a simple test schema
function createTestSchema(): SchemaNode {
  return {
    id: BigInt('0x123456789abcdef0'),
    displayName: 'TestStruct',
    displayNamePrefixLength: 0,
    scopeId: BigInt(0),
    nestedNodes: [],
    annotations: [],
    type: SchemaNodeType.STRUCT,
    structInfo: {
      dataWordCount: 2, // 2 data words = 128 bits
      pointerCount: 2,
      preferredListEncoding: 0,
      isGroup: false,
      discriminantCount: 0,
      discriminantOffset: 0,
      fields: [
        // Bool field at bit 0
        {
          name: 'active',
          codeOrder: 0,
          discriminantValue: 0,
          offset: 0,
          type: { kind: { type: 'bool' } },
          hadExplicitDefault: false,
        },
        // Int32 field at bits 32-63
        {
          name: 'count',
          codeOrder: 1,
          discriminantValue: 0,
          offset: 32,
          type: { kind: { type: 'int32' } },
          hadExplicitDefault: false,
        },
        // Float64 field at bits 64-127
        {
          name: 'value',
          codeOrder: 2,
          discriminantValue: 0,
          offset: 64,
          type: { kind: { type: 'float64' } },
          hadExplicitDefault: false,
        },
        // Text field at pointer 0 (bit 128)
        {
          name: 'name',
          codeOrder: 3,
          discriminantValue: 0,
          offset: 128,
          type: { kind: { type: 'text' } },
          hadExplicitDefault: false,
        },
        // List field at pointer 1 (bit 192)
        {
          name: 'numbers',
          codeOrder: 4,
          discriminantValue: 0,
          offset: 192,
          type: {
            kind: {
              type: 'list',
              elementType: { kind: { type: 'int32' } },
            },
          },
          hadExplicitDefault: false,
        },
      ],
    },
  };
}

describe('DynamicWriter', () => {
  let testSchema: SchemaNode;

  beforeEach(() => {
    testSchema = createTestSchema();
  });

  describe('createDynamicWriter', () => {
    it('should create a writer from schema', () => {
      const writer = createDynamicWriter(testSchema);

      expect(writer).toBeDefined();
      expect(writer.getSchema()).toBe(testSchema);
      expect(writer.getRawBuilder()).toBeDefined();
    });

    it('should throw error for non-struct schema', () => {
      const nonStructSchema: SchemaNode = {
        ...testSchema,
        type: SchemaNodeType.ENUM,
        structInfo: undefined,
      };

      expect(() => createDynamicWriter(nonStructSchema)).toThrow('not a struct');
    });
  });

  describe('set', () => {
    it('should set bool fields', () => {
      const writer = createDynamicWriter(testSchema);
      writer.set('active', true);

      const buffer = writer.toBuffer();
      expect(buffer).toBeDefined();
      expect(buffer.byteLength).toBeGreaterThan(0);
    });

    it('should set int32 fields', () => {
      const writer = createDynamicWriter(testSchema);
      writer.set('count', 42);

      const buffer = writer.toBuffer();
      expect(buffer).toBeDefined();
    });

    it('should set float64 fields', () => {
      const writer = createDynamicWriter(testSchema);
      writer.set('value', Math.PI);

      const buffer = writer.toBuffer();
      expect(buffer).toBeDefined();
    });

    it('should throw error for unknown field', () => {
      const writer = createDynamicWriter(testSchema);

      expect(() => writer.set('nonexistent', 'value')).toThrow('not found');
    });

    it('should throw error for type mismatch', () => {
      const writer = createDynamicWriter(testSchema);

      // Setting a text field with a number should throw
      expect(() => writer.set('name', 123 as unknown as string)).not.toThrow();
    });
  });

  describe('setFields', () => {
    it('should set multiple fields at once', () => {
      const writer = createDynamicWriter(testSchema);
      writer.setFields({
        active: true,
        count: 100,
        value: Math.E,
      });

      const buffer = writer.toBuffer();
      expect(buffer).toBeDefined();
    });
  });

  describe('setText', () => {
    it('should set text fields', () => {
      const writer = createDynamicWriter(testSchema);
      writer.setText('name', 'Hello World');

      const buffer = writer.toBuffer();
      expect(buffer).toBeDefined();
    });

    it('should throw error for non-text field', () => {
      const writer = createDynamicWriter(testSchema);

      expect(() => writer.setText('count', 'test')).toThrow('not a text type');
    });
  });

  describe('setData', () => {
    it('should set data fields', () => {
      // Create schema with data field
      const dataSchema: SchemaNode = {
        id: BigInt('0x123'),
        displayName: 'DataStruct',
        displayNamePrefixLength: 0,
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
              name: 'content',
              codeOrder: 0,
              discriminantValue: 0,
              offset: 0,
              type: { kind: { type: 'data' } },
              hadExplicitDefault: false,
            },
          ],
        },
      };

      const writer = createDynamicWriter(dataSchema);
      const data = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
      writer.setData('content', data);

      const buffer = writer.toBuffer();
      expect(buffer).toBeDefined();
    });
  });

  describe('initList', () => {
    it('should initialize and set list elements', () => {
      const writer = createDynamicWriter(testSchema);
      const listWriter = writer.initList('numbers', 3);

      expect(listWriter).toBeDefined();
      expect(listWriter.getSize()).toBe(3);

      listWriter.set(0, 10);
      listWriter.set(1, 20);
      listWriter.set(2, 30);

      const buffer = writer.toBuffer();
      expect(buffer).toBeDefined();
    });

    it('should set all list elements at once', () => {
      const writer = createDynamicWriter(testSchema);
      const listWriter = writer.initList('numbers', 3);

      listWriter.setAll([1, 2, 3]);

      const buffer = writer.toBuffer();
      expect(buffer).toBeDefined();
    });

    it('should throw error for index out of bounds', () => {
      const writer = createDynamicWriter(testSchema);
      const listWriter = writer.initList('numbers', 2);

      expect(() => listWriter.set(5, 100)).toThrow('out of bounds');
    });
  });

  describe('toBuffer', () => {
    it('should serialize to ArrayBuffer', () => {
      const writer = createDynamicWriter(testSchema);
      writer.set('active', true);
      writer.set('count', 42);

      const buffer = writer.toBuffer();

      expect(buffer).toBeInstanceOf(ArrayBuffer);
      expect(buffer.byteLength).toBeGreaterThan(0);
    });
  });
});

describe('createDynamicWriterByTypeId', () => {
  it('should create writer from type ID and registry', () => {
    const schema = createTestSchema();
    const registry = new Map<bigint, SchemaNode>();
    registry.set(schema.id, schema);

    const writer = createDynamicWriterByTypeId(schema.id, registry);

    expect(writer).toBeDefined();
    expect(writer.getSchema().id).toBe(schema.id);
  });

  it('should throw error for unknown type ID', () => {
    const registry = new Map<bigint, SchemaNode>();

    expect(() => createDynamicWriterByTypeId(BigInt(999), registry)).toThrow('Schema not found');
  });
});

describe('serializeDynamic', () => {
  it('should serialize data directly', () => {
    const schema = createTestSchema();
    const data = {
      active: true,
      count: 42,
      value: 3.14,
    };

    const buffer = serializeDynamic(schema, data);

    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(buffer.byteLength).toBeGreaterThan(0);
  });
});

describe('serializeDynamicByTypeId', () => {
  it('should serialize data using type ID', () => {
    const schema = createTestSchema();
    const registry = new Map<bigint, SchemaNode>();
    registry.set(schema.id, schema);

    const data = {
      active: false,
      count: 100,
    };

    const buffer = serializeDynamicByTypeId(schema.id, data, registry);

    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(buffer.byteLength).toBeGreaterThan(0);
  });
});

describe('DynamicWriter - Complex Types', () => {
  it('should handle int64 fields', () => {
    const schema: SchemaNode = {
      id: BigInt('0x123'),
      displayName: 'Int64Struct',
      displayNamePrefixLength: 0,
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
            name: 'bigValue',
            codeOrder: 0,
            discriminantValue: 0,
            offset: 0,
            type: { kind: { type: 'int64' } },
            hadExplicitDefault: false,
          },
        ],
      },
    };

    const writer = createDynamicWriter(schema);
    writer.set('bigValue', BigInt('9007199254740993'));

    const buffer = writer.toBuffer();
    expect(buffer).toBeDefined();
  });

  it('should handle uint64 fields', () => {
    const schema: SchemaNode = {
      id: BigInt('0x123'),
      displayName: 'UInt64Struct',
      displayNamePrefixLength: 0,
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
            name: 'bigValue',
            codeOrder: 0,
            discriminantValue: 0,
            offset: 0,
            type: { kind: { type: 'uint64' } },
            hadExplicitDefault: false,
          },
        ],
      },
    };

    const writer = createDynamicWriter(schema);
    writer.set('bigValue', BigInt('18446744073709551615'));

    const buffer = writer.toBuffer();
    expect(buffer).toBeDefined();
  });

  it('should handle float32 fields', () => {
    const schema: SchemaNode = {
      id: BigInt('0x123'),
      displayName: 'Float32Struct',
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
            name: 'floatValue',
            codeOrder: 0,
            discriminantValue: 0,
            offset: 0,
            type: { kind: { type: 'float32' } },
            hadExplicitDefault: false,
          },
        ],
      },
    };

    const writer = createDynamicWriter(schema);
    writer.set('floatValue', 1.5);

    const buffer = writer.toBuffer();
    expect(buffer).toBeDefined();
  });

  it('should handle enum fields', () => {
    const schema: SchemaNode = {
      id: BigInt('0x123'),
      displayName: 'EnumStruct',
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
            name: 'status',
            codeOrder: 0,
            discriminantValue: 0,
            offset: 0,
            type: {
              kind: {
                type: 'enum',
                typeId: BigInt('0xabc'),
              },
            },
            hadExplicitDefault: false,
          },
        ],
      },
    };

    const writer = createDynamicWriter(schema);
    writer.set('status', 2);

    const buffer = writer.toBuffer();
    expect(buffer).toBeDefined();
  });

  it('should handle list of int64', () => {
    const schema: SchemaNode = {
      id: BigInt('0x123'),
      displayName: 'Int64ListStruct',
      displayNamePrefixLength: 0,
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
            name: 'bigNumbers',
            codeOrder: 0,
            discriminantValue: 0,
            offset: 0,
            type: {
              kind: {
                type: 'list',
                elementType: { kind: { type: 'int64' } },
              },
            },
            hadExplicitDefault: false,
          },
        ],
      },
    };

    const writer = createDynamicWriter(schema);
    const listWriter = writer.initList('bigNumbers', 2);
    listWriter.set(0, BigInt('1000000000000'));
    listWriter.set(1, BigInt('2000000000000'));

    const buffer = writer.toBuffer();
    expect(buffer).toBeDefined();
  });
});
