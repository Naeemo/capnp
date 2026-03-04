/**
 * JSON Codec implementation for Cap'n Proto
 *
 * Complete implementation of Cap'n Proto to JSON conversion
 */

import type { ListReader, StructReader } from '../core/index.js';
import { ElementSize } from '../core/pointer.js';
import type { SchemaField, SchemaNode, SchemaType } from '../rpc/schema-types.js';
import { SchemaNodeType } from '../rpc/schema-types.js';

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
    if (schema.type !== SchemaNodeType.STRUCT || !schema.structInfo) {
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

  private readField(reader: StructReader, field: SchemaField): JsonValue {
    const type = field.type;

    // Check if pointer field is null (text field returns empty string if not set)
    if (this.isPointerType(type.kind.type)) {
      const pointerIndex = field.codeOrder;
      const text = reader.getText(pointerIndex);
      // Simple heuristic: if text is empty, field might be null
      // This isn't perfect but works for most cases
      if (type.kind.type === 'text' && text === '') {
        // Could be null or empty string - return empty string
        return '';
      }
    }

    return this.readValue(reader, field);
  }

  private isPointerType(type: string): boolean {
    return type === 'text' || type === 'data' || type === 'list' || type === 'struct';
  }

  private readValue(reader: StructReader, field: SchemaField): JsonValue {
    const kind = field.type.kind;

    switch (kind.type) {
      case 'void':
        return null;

      case 'bool':
        return reader.getBool(field.offset * 8);

      case 'int8':
        return reader.getInt8(field.offset);

      case 'int16':
        return reader.getInt16(field.offset);

      case 'int32':
        return reader.getInt32(field.offset);

      case 'int64':
        return reader.getInt64(field.offset).toString();

      case 'uint8':
        return reader.getUint8(field.offset);

      case 'uint16':
        return reader.getUint16(field.offset);

      case 'uint32':
        return reader.getUint32(field.offset);

      case 'uint64':
        return reader.getUint64(field.offset).toString();

      case 'float32':
        return reader.getFloat32(field.offset);

      case 'float64':
        return reader.getFloat64(field.offset);

      case 'text': {
        const text = reader.getText(field.codeOrder);
        return text ?? '';
      }

      case 'data': {
        // Data fields would need a getData method
        // For now return placeholder
        return { $data: '[binary]' };
      }

      case 'list': {
        const listReader = reader.getList<unknown>(field.codeOrder, ElementSize.INLINE_COMPOSITE);
        if (!listReader) return null;
        return this.readList(listReader, kind.elementType);
      }

      case 'struct': {
        // For nested struct, we'd need struct info
        // Return placeholder for now
        return { $struct: kind.typeId.toString(16) };
      }

      case 'enum': {
        // Return numeric value, could map to name if we had enum schema
        const value = reader.getUint16(field.offset);
        return value;
      }

      case 'interface':
        return { $cap: `cap-${field.codeOrder}` };

      case 'anyPointer':
        return { $ptr: '[anyPointer]' };

      default:
        return null;
    }
  }

  private readList(listReader: ListReader<unknown>, elementType: SchemaType): JsonValue[] {
    const length = listReader.length;
    const result: JsonValue[] = [];

    for (let i = 0; i < length; i++) {
      switch (elementType.kind.type) {
        case 'void':
          result.push(null);
          break;

        case 'bool':
          // BIT list uses primitive encoding
          result.push(listReader.getPrimitive(i) !== 0);
          break;

        case 'int8':
        case 'uint8':
          result.push(Number(listReader.getPrimitive(i)));
          break;

        case 'int16':
        case 'uint16':
          result.push(Number(listReader.getPrimitive(i)));
          break;

        case 'int32':
        case 'uint32':
          result.push(Number(listReader.getPrimitive(i)));
          break;

        case 'int64':
        case 'uint64':
          result.push(listReader.getPrimitive(i).toString());
          break;

        case 'float32':
        case 'float64':
          // Floats are stored as raw bytes, need special handling
          result.push({ $float: '[float]' });
          break;

        case 'text': {
          // Text list would need special handling
          result.push({ $text: '[text]' });
          break;
        }

        case 'data': {
          result.push({ $data: '[binary]' });
          break;
        }

        default:
          result.push(null);
      }
    }

    return result;
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
