/**
 * JSON Codec implementation for Cap'n Proto
 *
 * Bidirectional conversion between Cap'n Proto and JSON
 */

import type { ListBuilder, ListReader, StructBuilder, StructReader } from '../core/index.js';
import { MessageBuilder } from '../core/index.js';
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

// ============================================================================
// Cap'n Proto to JSON
// ============================================================================

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
// JSON to Cap'n Proto
// ============================================================================

/**
 * JSON to Cap'n Proto converter
 */
export class JsonToCapnp {
  private options: JsonCodecOptions;
  private schemaRegistry: Map<bigint, SchemaNode>;

  constructor(schemaRegistry: Map<bigint, SchemaNode>, options: JsonCodecOptions = {}) {
    this.schemaRegistry = schemaRegistry;
    this.options = options;
  }

  /**
   * Convert JSON to Cap'n Proto struct
   */
  convert(json: JsonValue, schema: SchemaNode, builder: StructBuilder): void {
    if (schema.type !== SchemaNodeType.STRUCT || !schema.structInfo) {
      throw new Error(`Cannot convert to non-struct type: ${schema.type}`);
    }

    if (typeof json !== 'object' || json === null) {
      throw new Error('JSON value must be an object');
    }

    const jsonObj = json as Record<string, JsonValue>;

    for (const field of schema.structInfo.fields) {
      const jsonFieldName = this.getJsonFieldName(field.name);
      const value = jsonObj[jsonFieldName];

      if (value !== undefined && value !== null) {
        this.writeField(builder, field, value);
      }
    }
  }

  /**
   * Convert JSON to new Cap'n Proto message
   */
  convertToMessage(json: JsonValue, schema: SchemaNode): MessageBuilder {
    if (schema.type !== SchemaNodeType.STRUCT || !schema.structInfo) {
      throw new Error(`Cannot convert to non-struct type: ${schema.type}`);
    }

    const builder = new MessageBuilder();
    const structBuilder = builder.initRoot(
      schema.structInfo.dataWordCount,
      schema.structInfo.pointerCount
    );

    this.convert(json, schema, structBuilder);
    return builder;
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

  private writeField(builder: StructBuilder, field: SchemaField, value: JsonValue): void {
    const kind = field.type.kind;

    switch (kind.type) {
      case 'void':
        // Nothing to write
        break;

      case 'bool':
        builder.setBool(field.offset * 8, Boolean(value));
        break;

      case 'int8':
        builder.setInt8(field.offset, Number(value));
        break;

      case 'int16':
        builder.setInt16(field.offset, Number(value));
        break;

      case 'int32':
        builder.setInt32(field.offset, Number(value));
        break;

      case 'int64':
        builder.setInt64(field.offset, BigInt(value as string));
        break;

      case 'uint8':
        builder.setUint8(field.offset, Number(value));
        break;

      case 'uint16':
        builder.setUint16(field.offset, Number(value));
        break;

      case 'uint32':
        builder.setUint32(field.offset, Number(value));
        break;

      case 'uint64':
        builder.setUint64(field.offset, BigInt(value as string));
        break;

      case 'float32':
        builder.setFloat32(field.offset, Number(value));
        break;

      case 'float64':
        builder.setFloat64(field.offset, Number(value));
        break;

      case 'text':
        builder.setText(field.codeOrder, String(value));
        break;

      case 'data':
        // Data fields need special handling
        // For now, skip
        break;

      case 'list':
        if (Array.isArray(value)) {
          this.writeList(builder, field, value, kind.elementType);
        }
        break;

      case 'struct':
        // Nested struct - would need struct info
        // For now, skip
        break;

      case 'enum':
        if (typeof value === 'number') {
          builder.setUint16(field.offset, value);
        } else if (typeof value === 'string') {
          // Would need to look up enum value by name
          builder.setUint16(field.offset, 0);
        }
        break;

      case 'interface':
      case 'anyPointer':
        // Skip capability/pointer types
        break;
    }
  }

  private writeList(
    builder: StructBuilder,
    field: SchemaField,
    values: JsonValue[],
    elementType: SchemaType
  ): void {
    const elementCount = values.length;
    if (elementCount === 0) return;

    // Determine element size
    let elementSize: ElementSize;
    switch (elementType.kind.type) {
      case 'bool':
        elementSize = ElementSize.BIT;
        break;
      case 'int8':
      case 'uint8':
        elementSize = ElementSize.BYTE;
        break;
      case 'int16':
      case 'uint16':
        elementSize = ElementSize.TWO_BYTES;
        break;
      case 'int32':
      case 'uint32':
      case 'float32':
        elementSize = ElementSize.FOUR_BYTES;
        break;
      case 'int64':
      case 'uint64':
      case 'float64':
        elementSize = ElementSize.EIGHT_BYTES;
        break;
      default:
        elementSize = ElementSize.INLINE_COMPOSITE;
    }

    const listBuilder = builder.initList(field.codeOrder, elementSize, elementCount);

    for (let i = 0; i < elementCount; i++) {
      const value = values[i];

      switch (elementType.kind.type) {
        case 'bool':
          // BIT list not directly supported in ListBuilder, use primitive
          break;

        case 'int8':
        case 'uint8':
          listBuilder.setPrimitive(i, Number(value));
          break;

        case 'int16':
        case 'uint16':
          listBuilder.setPrimitive(i, Number(value));
          break;

        case 'int32':
        case 'uint32':
          listBuilder.setPrimitive(i, Number(value));
          break;

        case 'int64':
        case 'uint64':
          listBuilder.setPrimitive(i, BigInt(value as string));
          break;

        case 'float32':
        case 'float64':
          listBuilder.setPrimitive(i, Number(value));
          break;

        default:
          // Skip complex types for now
          break;
      }
    }
  }

  /**
   * Parse JSON string and convert to Cap'n Proto
   */
  parse(jsonString: string, schema: SchemaNode): MessageBuilder {
    const json = JSON.parse(jsonString) as JsonValue;
    return this.convertToMessage(json, schema);
  }
}

// ============================================================================
// Utility functions
// ============================================================================

/**
 * Quick conversion function (Cap'n Proto -> JSON)
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
 * Quick stringify function (Cap'n Proto -> JSON string)
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

/**
 * Quick conversion function (JSON -> Cap'n Proto)
 */
export function fromJson(
  json: JsonValue,
  schema: SchemaNode,
  options?: JsonCodecOptions
): MessageBuilder {
  const registry = new Map<bigint, SchemaNode>();
  registry.set(schema.id, schema);

  const converter = new JsonToCapnp(registry, options);
  return converter.convertToMessage(json, schema);
}

/**
 * Quick parse function (JSON string -> Cap'n Proto)
 */
export function parse(
  jsonString: string,
  schema: SchemaNode,
  options?: JsonCodecOptions
): MessageBuilder {
  const registry = new Map<bigint, SchemaNode>();
  registry.set(schema.id, schema);

  const converter = new JsonToCapnp(registry, options);
  return converter.parse(jsonString, schema);
}
