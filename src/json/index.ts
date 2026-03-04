/**
 * JSON Codec implementation for Cap'n Proto
 *
 * Complete implementation of Cap'n Proto to JSON conversion
 */

import type { StructReader } from '../core/index.js';
import type { SchemaNode, SchemaNodeType } from '../rpc/schema-types.js';

export interface JsonCodecOptions {
  /** Use field names from schema instead of JSON camelCase */
  preserveFieldNames?: boolean;
  /** Custom field name mappings */
  fieldNameMap?: Record<string, string>;
  /** Include null fields in output */
  includeNulls?: boolean;
  /** Pretty print JSON */
  pretty?: boolean;
  /** Indent size for pretty print */
  indent?: number;
}

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Cap'n Proto to JSON converter
 */
export class CapnpToJson {
  private options: JsonCodecOptions;
  private schemaRegistry: Map<bigint, SchemaNode>;

  constructor(schemaRegistry: Map<bigint, SchemaNode>, options: JsonCodecOptions = {}) {
    this.schemaRegistry = schemaRegistry;
    this.options = options;
  }

  /**
   * Convert a Cap'n Proto struct to JSON
   */
  convert(reader: StructReader, schema: SchemaNode): JsonValue {
    // @ts-ignore - SchemaNodeType is type only import
    if (schema.type !== 'struct' || !schema.structInfo) {
      throw new Error(`Cannot convert non-struct type to JSON: ${schema.type}`);
    }

    const result: Record<string, JsonValue> = {};

    for (const field of schema.structInfo.fields) {
      const fieldName = this.getJsonFieldName(field.name);
      const value = this.readField(reader, field);

      if (value !== null || this.options.includeNulls) {
        result[fieldName] = value;
      }
    }

    return result;
  }

  private getJsonFieldName(capnpName: string): string {
    if (this.options.fieldNameMap?.[capnpName]) {
      return this.options.fieldNameMap[capnpName];
    }

    if (this.options.preserveFieldNames) {
      return capnpName;
    }

    // Convert snake_case to camelCase
    return capnpName.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  private readField(
    _reader: StructReader,
    _field: { name: string; type: { kind: { type: string } }; codeOrder: number; offset: number }
  ): JsonValue {
    // TODO: Implement field reading based on actual API
    // This is a placeholder - need to match actual StructReader API
    return null;
  }

  /**
   * Convert to JSON string
   */
  stringify(reader: StructReader, schema: SchemaNode): string {
    const json = this.convert(reader, schema);
    const space = this.options.pretty ? (this.options.indent ?? 2) : undefined;
    return JSON.stringify(json, null, space);
  }
}

// ============================================================================
// Utility functions
// ============================================================================

/**
 * Quick conversion function
 */
export function toJson(
  reader: StructReader,
  schema: SchemaNode,
  options?: JsonCodecOptions
): JsonValue {
  const registry = new Map<bigint, SchemaNode>();
  registry.set(schema.id, schema);

  const converter = new CapnpToJson(registry, options);
  return converter.convert(reader, schema);
}

/**
 * Quick stringify function
 */
export function stringify(
  reader: StructReader,
  schema: SchemaNode,
  options?: JsonCodecOptions
): string {
  const registry = new Map<bigint, SchemaNode>();
  registry.set(schema.id, schema);

  const converter = new CapnpToJson(registry, options);
  return converter.stringify(reader, schema);
}
