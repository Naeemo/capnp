/**
 * Tests for JSON Codec
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StructReader } from '../core/index.js';
import type { SchemaNode } from '../rpc/schema-types.js';
import { SchemaNodeType } from '../rpc/schema-types.js';
import { CapnpToJson, type JsonCodecOptions } from './index.js';

// Test schema for a simple Person struct
const personSchema: SchemaNode = {
  id: 0x123456789abcdef0n,
  displayName: 'Person',
  displayNamePrefixLength: 0,
  scopeId: 0n,
  type: SchemaNodeType.STRUCT,
  nestedNodes: [],
  annotations: [],
  structInfo: {
    dataWordCount: 2,
    pointerCount: 2,
    preferredListEncoding: 0,
    isGroup: false,
    discriminantCount: 0,
    discriminantOffset: 0,
    fields: [
      {
        name: 'id',
        codeOrder: 0,
        discriminantValue: 0xffff,
        offset: 0,
        type: { kind: { type: 'uint32' as const } },
        hadExplicitDefault: false,
      },
      {
        name: 'age',
        codeOrder: 1,
        discriminantValue: 0xffff,
        offset: 4,
        type: { kind: { type: 'uint8' as const } },
        hadExplicitDefault: false,
      },
      {
        name: 'is_active',
        codeOrder: 2,
        discriminantValue: 0xffff,
        offset: 5,
        type: { kind: { type: 'bool' as const } },
        hadExplicitDefault: false,
      },
      {
        name: 'name',
        codeOrder: 0,
        discriminantValue: 0xffff,
        offset: 0,
        type: { kind: { type: 'text' as const } },
        hadExplicitDefault: false,
      },
      {
        name: 'email',
        codeOrder: 1,
        discriminantValue: 0xffff,
        offset: 0,
        type: { kind: { type: 'text' as const } },
        hadExplicitDefault: false,
      },
    ],
  },
};

// Create a mock StructReader with all required methods
function createMockReader(values: Record<string, unknown> = {}): StructReader {
  return {
    getBool: vi.fn((offset) => (values[`bool_${offset}`] as boolean) ?? false),
    getInt8: vi.fn((offset) => (values[`int8_${offset}`] as number) ?? 0),
    getInt16: vi.fn((offset) => (values[`int16_${offset}`] as number) ?? 0),
    getInt32: vi.fn((offset) => (values[`int32_${offset}`] as number) ?? 0),
    getInt64: vi.fn((offset) => (values[`int64_${offset}`] as bigint) ?? 0n),
    getUint8: vi.fn((offset) => (values[`uint8_${offset}`] as number) ?? 0),
    getUint16: vi.fn((offset) => (values[`uint16_${offset}`] as number) ?? 0),
    getUint32: vi.fn((offset) => (values[`uint32_${offset}`] as number) ?? 0),
    getUint64: vi.fn((offset) => (values[`uint64_${offset}`] as bigint) ?? 0n),
    getFloat32: vi.fn((offset) => (values[`float32_${offset}`] as number) ?? 0),
    getFloat64: vi.fn((offset) => (values[`float64_${offset}`] as number) ?? 0),
    getText: vi.fn((index) => (values[`text_${index}`] as string) ?? ''),
    getList: vi.fn(() => undefined),
    getStruct: vi.fn(() => undefined),
  } as unknown as StructReader;
}

describe('JSON Codec', () => {
  describe('CapnpToJson', () => {
    it('should convert basic struct to JSON', () => {
      const registry = new Map<bigint, SchemaNode>();
      registry.set(personSchema.id, personSchema);

      const mockReader = createMockReader({
        uint32_0: 42,
        uint8_4: 25,
        bool_40: true,
        text_0: 'John Doe',
        text_1: 'john@example.com',
      });

      const converter = new CapnpToJson(registry, {});
      const json = converter.convert(mockReader, personSchema);

      expect(json).toEqual({
        id: 42,
        age: 25,
        isActive: true,
        name: 'John Doe',
        email: 'john@example.com',
      });
    });

    it('should convert snake_case to camelCase', () => {
      const registry = new Map<bigint, SchemaNode>();
      registry.set(personSchema.id, personSchema);

      const mockReader = createMockReader({ bool_40: true });
      const converter = new CapnpToJson(registry, {});
      const json = converter.convert(mockReader, personSchema);

      // Check that is_active becomes isActive
      const keys = Object.keys(json as object);
      expect(keys).toContain('isActive');
      expect(keys).not.toContain('is_active');
    });

    it('should preserve field names when option is set', () => {
      const registry = new Map<bigint, SchemaNode>();
      registry.set(personSchema.id, personSchema);

      const mockReader = createMockReader({ bool_40: true });
      const converter = new CapnpToJson(registry, { preserveFieldNames: true });
      const json = converter.convert(mockReader, personSchema);

      const keys = Object.keys(json as object);
      expect(keys).toContain('is_active');
      expect(keys).not.toContain('isActive');
    });

    it('should use custom field name mappings', () => {
      const registry = new Map<bigint, SchemaNode>();
      registry.set(personSchema.id, personSchema);

      const mockReader = createMockReader({
        text_0: 'John Doe',
        text_1: 'john@example.com',
      });

      const converter = new CapnpToJson(registry, {
        fieldNameMap: { name: 'fullName', email: 'emailAddress' },
      });
      const json = converter.convert(mockReader, personSchema);

      const keys = Object.keys(json as object);
      expect(keys).toContain('fullName');
      expect(keys).toContain('emailAddress');
    });
  });

  describe('type conversions', () => {
    it('should convert int64 to string in JSON', () => {
      const registry = new Map<bigint, SchemaNode>();
      const schema: SchemaNode = {
        id: 0x123n,
        displayName: 'Int64Test',
        displayNamePrefixLength: 0,
        scopeId: 0n,
        type: SchemaNodeType.STRUCT,
        nestedNodes: [],
        annotations: [],
        structInfo: {
          dataWordCount: 1,
          pointerCount: 0,
          preferredListEncoding: 0,
          isGroup: false,
          discriminantCount: 0,
          discriminantOffset: 0,
          fields: [
            { name: 'value', codeOrder: 0, discriminantValue: 0xffff, offset: 0, type: { kind: { type: 'int64' as const } }, hadExplicitDefault: false },
          ],
        },
      };
      registry.set(schema.id, schema);

      const mockReader = createMockReader({ int64_0: 9223372036854775807n });
      const converter = new CapnpToJson(registry, {});
      const json = converter.convert(mockReader, schema);

      expect((json as Record<string, unknown>).value).toBe('9223372036854775807');
    });

    it('should convert uint64 to string in JSON', () => {
      const registry = new Map<bigint, SchemaNode>();
      const schema: SchemaNode = {
        id: 0x123n,
        displayName: 'Uint64Test',
        displayNamePrefixLength: 0,
        scopeId: 0n,
        type: SchemaNodeType.STRUCT,
        nestedNodes: [],
        annotations: [],
        structInfo: {
          dataWordCount: 1,
          pointerCount: 0,
          preferredListEncoding: 0,
          isGroup: false,
          discriminantCount: 0,
          discriminantOffset: 0,
          fields: [
            { name: 'value', codeOrder: 0, discriminantValue: 0xffff, offset: 0, type: { kind: { type: 'uint64' as const } }, hadExplicitDefault: false },
          ],
        },
      };
      registry.set(schema.id, schema);

      const mockReader = createMockReader({ uint64_0: 18446744073709551615n });
      const converter = new CapnpToJson(registry, {});
      const json = converter.convert(mockReader, schema);

      expect((json as Record<string, unknown>).value).toBe('18446744073709551615');
    });

    it('should handle float types', () => {
      const registry = new Map<bigint, SchemaNode>();
      const schema: SchemaNode = {
        id: 0x123n,
        displayName: 'FloatTest',
        displayNamePrefixLength: 0,
        scopeId: 0n,
        type: SchemaNodeType.STRUCT,
        nestedNodes: [],
        annotations: [],
        structInfo: {
          dataWordCount: 2,
          pointerCount: 0,
          preferredListEncoding: 0,
          isGroup: false,
          discriminantCount: 0,
          discriminantOffset: 0,
          fields: [
            { name: 'float32', codeOrder: 0, discriminantValue: 0xffff, offset: 0, type: { kind: { type: 'float32' as const } }, hadExplicitDefault: false },
            { name: 'float64', codeOrder: 1, discriminantValue: 0xffff, offset: 8, type: { kind: { type: 'float64' as const } }, hadExplicitDefault: false },
          ],
        },
      };
      registry.set(schema.id, schema);

      const mockReader = createMockReader({
        float32_0: 3.14159,
        float64_8: 2.718281828,
      });
      const converter = new CapnpToJson(registry, {});
      const json = converter.convert(mockReader, schema);

      expect((json as Record<string, unknown>).float32).toBe(3.14159);
      expect((json as Record<string, unknown>).float64).toBe(2.718281828);
    });
  });

  describe('stringify', () => {
    it('should output compact JSON by default', () => {
      const registry = new Map<bigint, SchemaNode>();
      registry.set(personSchema.id, personSchema);

      const mockReader = createMockReader({ uint32_0: 42 });
      const converter = new CapnpToJson(registry, {});
      const json = converter.stringify(mockReader, personSchema);

      // Should not contain newlines in compact mode
      expect(json).not.toContain('\n');
      expect(JSON.parse(json)).toBeDefined();
    });

    it('should output pretty JSON when option is set', () => {
      const registry = new Map<bigint, SchemaNode>();
      registry.set(personSchema.id, personSchema);

      const mockReader = createMockReader({ uint32_0: 42 });
      const converter = new CapnpToJson(registry, { pretty: true, indent: 2 });
      const json = converter.stringify(mockReader, personSchema);

      // Should contain newlines and indentation in pretty mode
      expect(json).toContain('\n');
      expect(JSON.parse(json)).toBeDefined();
    });
  });

  describe('null handling', () => {
    it('should skip null fields by default', () => {
      const registry = new Map<bigint, SchemaNode>();
      registry.set(personSchema.id, personSchema);

      const mockReader = createMockReader({
        uint32_0: 42,
        // age and is_active not set - will return 0/false, not null
      });
      const converter = new CapnpToJson(registry, {});
      const json = converter.convert(mockReader, personSchema);

      // Text fields return empty string, not null
      expect((json as Record<string, unknown>).name).toBe('');
    });

    it('should include null fields when option is set', () => {
      const registry = new Map<bigint, SchemaNode>();
      registry.set(personSchema.id, personSchema);

      const mockReader = createMockReader({ uint32_0: 42 });
      const converter = new CapnpToJson(registry, { includeNulls: true });
      const json = converter.convert(mockReader, personSchema);

      // All fields should be present
      const keys = Object.keys(json as object);
      expect(keys).toContain('id');
      expect(keys).toContain('age');
      expect(keys).toContain('isActive');
    });
  });

  describe('error handling', () => {
    it('should throw error for non-struct schema', () => {
      const enumSchema: SchemaNode = {
        id: 0x123n,
        displayName: 'TestEnum',
        displayNamePrefixLength: 0,
        scopeId: 0n,
        type: SchemaNodeType.ENUM,
        nestedNodes: [],
        annotations: [],
        enumInfo: {
          enumerants: [
            { name: 'A', codeOrder: 0, annotations: [] },
            { name: 'B', codeOrder: 1, annotations: [] },
          ],
        },
      };

      const registry = new Map<bigint, SchemaNode>();
      registry.set(enumSchema.id, enumSchema);

      const converter = new CapnpToJson(registry, {});
      expect(() => converter.convert({} as StructReader, enumSchema)).toThrow(
        'Cannot convert non-struct type to JSON'
      );
    });
  });
});
