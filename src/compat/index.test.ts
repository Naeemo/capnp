/**
 * Tests for Schema Compatibility Checker
 */

import { describe, expect, it } from 'vitest';
import { SchemaNodeType } from '../rpc/schema-types.js';
import type { SchemaField, SchemaNode } from '../rpc/schema-types.js';
import { type CompatibilityOptions, checkCompatibility, formatReport } from './index.js';

// Helper to create a simple struct schema
function createStructSchema(
  id: bigint,
  name: string,
  fields: Array<{ name: string; type: string; offset?: number }>
): SchemaNode {
  return {
    id,
    displayName: name,
    displayNamePrefixLength: 0,
    scopeId: 0n,
    type: SchemaNodeType.STRUCT,
    nestedNodes: [],
    annotations: [],
    structInfo: {
      dataWordCount: Math.ceil(fields.length / 2),
      pointerCount: 0,
      preferredListEncoding: 0,
      isGroup: false,
      discriminantCount: 0,
      discriminantOffset: 0,
      fields: fields.map((f, i) => ({
        name: f.name,
        codeOrder: i,
        discriminantValue: 0xffff,
        offset: f.offset ?? i * 8,
        type: { kind: { type: f.type } } as SchemaField['type'],
        hadExplicitDefault: false,
      })),
    },
  };
}

// Helper to create enum schema
function createEnumSchema(id: bigint, name: string, values: string[]): SchemaNode {
  return {
    id,
    displayName: name,
    displayNamePrefixLength: 0,
    scopeId: 0n,
    type: SchemaNodeType.ENUM,
    nestedNodes: [],
    annotations: [],
    enumInfo: {
      enumerants: values.map((v, i) => ({
        name: v,
        codeOrder: i,
        annotations: [],
      })),
    },
  };
}

describe('Schema Compatibility Checker', () => {
  describe('compatible schemas', () => {
    it('should report compatible for identical schemas', () => {
      const schema = createStructSchema(0x123n, 'Person', [
        { name: 'id', type: 'uint32' },
        { name: 'name', type: 'text' },
      ]);

      const report = checkCompatibility(schema, schema);

      expect(report.compatible).toBe(true);
      expect(report.summary.breaking).toBe(0);
    });

    it('should allow adding new fields', () => {
      const oldSchema = createStructSchema(0x123n, 'Person', [{ name: 'id', type: 'uint32' }]);

      const newSchema = createStructSchema(0x123n, 'Person', [
        { name: 'id', type: 'uint32' },
        { name: 'name', type: 'text' },
        { name: 'email', type: 'text' },
      ]);

      const report = checkCompatibility(oldSchema, newSchema);

      expect(report.compatible).toBe(true);
      expect(report.summary.info).toBe(2); // Two new fields added
      expect(report.issues.every((i) => i.type === 'info')).toBe(true);
    });
  });

  describe('breaking changes', () => {
    it('should detect removed fields', () => {
      const oldSchema = createStructSchema(0x123n, 'Person', [
        { name: 'id', type: 'uint32' },
        { name: 'name', type: 'text' },
      ]);

      const newSchema = createStructSchema(0x123n, 'Person', [{ name: 'id', type: 'uint32' }]);

      const report = checkCompatibility(oldSchema, newSchema);

      expect(report.compatible).toBe(false);
      expect(report.summary.breaking).toBe(1);
      expect(report.issues[0].category).toBe('field_removed');
      expect(report.issues[0].path).toBe('Person.name');
    });

    it('should detect field type changes', () => {
      const oldSchema = createStructSchema(0x123n, 'Person', [{ name: 'id', type: 'uint32' }]);

      const newSchema = createStructSchema(0x123n, 'Person', [{ name: 'id', type: 'text' }]);

      const report = checkCompatibility(oldSchema, newSchema);

      expect(report.compatible).toBe(false);
      expect(report.issues[0].category).toBe('field_type_changed');
    });

    it('should detect removed struct', () => {
      const oldSchema = createStructSchema(0x123n, 'Person', [{ name: 'id', type: 'uint32' }]);

      const report = checkCompatibility(oldSchema, []);

      expect(report.compatible).toBe(false);
      expect(report.issues[0].category).toBe('struct_removed');
    });

    it('should detect removed enum values', () => {
      const oldSchema = createEnumSchema(0x123n, 'Status', ['ACTIVE', 'INACTIVE', 'PENDING']);
      const newSchema = createEnumSchema(0x123n, 'Status', ['ACTIVE', 'INACTIVE']);

      const report = checkCompatibility(oldSchema, newSchema);

      expect(report.compatible).toBe(false);
      expect(report.issues[0].category).toBe('enum_value_removed');
    });
  });

  describe('multiple schema nodes', () => {
    it('should check multiple structs', () => {
      const oldSchemas = [
        createStructSchema(0x123n, 'Person', [{ name: 'id', type: 'uint32' }]),
        createStructSchema(0x456n, 'Address', [{ name: 'street', type: 'text' }]),
      ];

      const newSchemas = [
        createStructSchema(0x123n, 'Person', [{ name: 'id', type: 'uint32' }]),
        // Address removed
      ];

      const report = checkCompatibility(oldSchemas, newSchemas);

      expect(report.compatible).toBe(false);
      expect(report.issues.some((i) => i.path === 'Address')).toBe(true);
    });
  });

  describe('formatReport', () => {
    it('should format compatible report', () => {
      const report = checkCompatibility(
        createStructSchema(0x123n, 'Person', [{ name: 'id', type: 'uint32' }]),
        createStructSchema(0x123n, 'Person', [{ name: 'id', type: 'uint32' }])
      );

      const formatted = formatReport(report);

      expect(formatted).toContain('COMPATIBILITY REPORT');
      expect(formatted).toContain('compatible');
    });

    it('should format breaking changes', () => {
      const report = checkCompatibility(
        createStructSchema(0x123n, 'Person', [{ name: 'id', type: 'uint32' }]),
        createStructSchema(0x123n, 'Person', [])
      );

      const formatted = formatReport(report);

      expect(formatted).toContain('NOT compatible');
      expect(formatted).toContain('field_removed');
      expect(formatted).toContain('Breaking: 1');
    });
  });
});
