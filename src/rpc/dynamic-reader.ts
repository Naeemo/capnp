/**
 * Phase 7: Dynamic Schema Reader
 * 
 * This module provides runtime reading of Cap'n Proto messages using
 * dynamically loaded schema information. This allows reading messages
 * for types not known at compile time.
 */

import { MessageReader, StructReader } from "../core/message-reader.js";
import { ListReader } from "../core/list.js";
import { ElementSize } from "../core/pointer.js";
import type { SchemaNode, SchemaField, SchemaType, SchemaTypeKind, SchemaValue } from "./schema-types.js";
import { SchemaNodeType } from "./schema-types.js";

/**
 * Dynamic reader for Cap'n Proto messages
 * Provides runtime field access based on schema information
 */
export interface DynamicReader {
  /** Get a field value by name */
  get(fieldName: string): unknown;
  
  /** Check if a field exists */
  has(fieldName: string): boolean;
  
  /** Get all field names */
  getFieldNames(): string[];
  
  /** Get the underlying schema node */
  getSchema(): SchemaNode;
  
  /** Get nested struct reader */
  getStruct(fieldName: string): DynamicReader | undefined;
  
  /** Get list field */
  getList(fieldName: string): unknown[] | undefined;
  
  /** Get the raw StructReader */
  getRawReader(): StructReader;
}

/**
 * Create a dynamic reader from schema and buffer
 * 
 * @param schema - The schema node describing the struct type
 * @param buffer - The Cap'n Proto message buffer
 * @returns A DynamicReader for accessing the message fields
 */
export function createDynamicReader(schema: SchemaNode, buffer: ArrayBuffer | Uint8Array): DynamicReader {
  const messageReader = new MessageReader(buffer);
  
  if (!schema.structInfo) {
    throw new Error(`Schema node ${schema.displayName} is not a struct`);
  }
  
  const { dataWordCount, pointerCount } = schema.structInfo;
  const structReader = messageReader.getRoot(dataWordCount, pointerCount);
  
  return new DynamicReaderImpl(schema, structReader, messageReader);
}

/**
 * Create a dynamic reader from an existing StructReader
 * 
 * @param schema - The schema node describing the struct type
 * @param structReader - The StructReader to wrap
 * @param messageReader - The underlying MessageReader
 * @returns A DynamicReader for accessing the message fields
 */
export function createDynamicReaderFromStruct(
  schema: SchemaNode, 
  structReader: StructReader,
  messageReader: MessageReader
): DynamicReader {
  return new DynamicReaderImpl(schema, structReader, messageReader);
}

/**
 * Implementation of DynamicReader
 */
class DynamicReaderImpl implements DynamicReader {
  private fieldCache: Map<string, SchemaField>;
  private pointerOffset: number;
  
  constructor(
    private schema: SchemaNode,
    private structReader: StructReader,
    private messageReader: MessageReader
  ) {
    this.fieldCache = new Map();
    this.pointerOffset = schema.structInfo?.dataWordCount ?? 0;
    
    // Build field cache
    if (schema.structInfo?.fields) {
      for (const field of schema.structInfo.fields) {
        this.fieldCache.set(field.name, field);
      }
    }
  }
  
  get(fieldName: string): unknown {
    const field = this.fieldCache.get(fieldName);
    if (!field) {
      throw new Error(`Field '${fieldName}' not found in schema ${this.schema.displayName}`);
    }
    
    return this.readFieldValue(field);
  }
  
  has(fieldName: string): boolean {
    return this.fieldCache.has(fieldName);
  }
  
  getFieldNames(): string[] {
    return Array.from(this.fieldCache.keys());
  }
  
  getSchema(): SchemaNode {
    return this.schema;
  }
  
  getStruct(fieldName: string): DynamicReader | undefined {
    const field = this.fieldCache.get(fieldName);
    if (!field) {
      return undefined;
    }
    
    // Check if field is a struct type
    if (field.type.kind.type !== "struct") {
      return undefined;
    }
    
    // Get the nested struct reader
    const pointerIndex = this.getPointerIndex(field);
    const nestedStruct = this.structReader.getStruct(pointerIndex, 0, 0);
    if (!nestedStruct) {
      return undefined;
    }
    
    // Note: We don't have the nested schema here, so we return a limited reader
    // In a full implementation, we'd look up the schema by typeId
    return new DynamicStructReaderWithoutSchema(nestedStruct, this.messageReader);
  }
  
  getList(fieldName: string): unknown[] | undefined {
    const field = this.fieldCache.get(fieldName);
    if (!field) {
      return undefined;
    }
    
    if (field.type.kind.type !== "list") {
      return undefined;
    }
    
    const pointerIndex = this.getPointerIndex(field);
    const elementType = field.type.kind.elementType;
    
    return this.readListField(pointerIndex, elementType);
  }
  
  getRawReader(): StructReader {
    return this.structReader;
  }
  
  /**
   * Read a field value based on its type
   */
  private readFieldValue(field: SchemaField): unknown {
    const kind = field.type.kind;
    
    switch (kind.type) {
      case "void":
        return undefined;
      case "bool":
        return this.structReader.getBool(field.offset);
      case "int8":
        return this.structReader.getInt8(field.offset);
      case "int16":
        return this.structReader.getInt16(field.offset);
      case "int32":
        return this.structReader.getInt32(field.offset);
      case "int64":
        return this.structReader.getInt64(field.offset);
      case "uint8":
        return this.structReader.getUint8(field.offset);
      case "uint16":
        return this.structReader.getUint16(field.offset);
      case "uint32":
        return this.structReader.getUint32(field.offset);
      case "uint64":
        return this.structReader.getUint64(field.offset);
      case "float32":
        return this.structReader.getFloat32(field.offset);
      case "float64":
        return this.structReader.getFloat64(field.offset);
      case "text":
        return this.readTextField(field);
      case "data":
        return this.readDataField(field);
      case "list":
        return this.readListFieldBySchema(field);
      case "enum":
        return this.readEnumField(field);
      case "struct":
        return this.readStructField(field);
      case "interface":
        return this.readInterfaceField(field);
      case "anyPointer":
        return this.readAnyPointerField(field);
      default:
        throw new Error(`Unsupported field type: ${(kind as SchemaTypeKind).type}`);
    }
  }
  
  /**
   * Get the pointer index for a field
   * In Cap'n Proto, pointer fields have offsets that start from 0 for the first pointer
   * The offset is measured in bits from the start of the data section
   * For pointer fields, offset = dataWordCount * 64 + pointerIndex * 64
   * So pointerIndex = (offset - dataWordCount * 64) / 64
   */
  private getPointerIndex(field: SchemaField): number {
    const dataSectionBits = (this.schema.structInfo?.dataWordCount ?? 0) * 64;
    // Pointer offset is measured from the start of the pointer section
    // Each pointer is 64 bits (1 word)
    const pointerIndex = (field.offset - dataSectionBits) / 64;
    return pointerIndex;
  }
  
  /**
   * Read a text field
   */
  private readTextField(field: SchemaField): string {
    const pointerIndex = this.getPointerIndex(field);
    return this.structReader.getText(pointerIndex);
  }
  
  /**
   * Read a data field
   */
  private readDataField(field: SchemaField): Uint8Array {
    const pointerIndex = this.getPointerIndex(field);
    // Data is stored similarly to text but without null terminator
    // For now, we use the same mechanism
    const text = this.structReader.getText(pointerIndex);
    return new TextEncoder().encode(text);
  }
  
  /**
   * Read a list field using schema information
   */
  private readListFieldBySchema(field: SchemaField): unknown[] {
    if (field.type.kind.type !== "list") {
      throw new Error(`Field '${field.name}' is not a list type`);
    }
    
    const pointerIndex = this.getPointerIndex(field);
    const elementType = field.type.kind.elementType;
    
    return this.readListField(pointerIndex, elementType);
  }
  
  /**
   * Read a list field
   */
  private readListField(pointerIndex: number, elementType: SchemaType): unknown[] {
    // Map element type to ElementSize
    const elementSize = this.mapTypeToElementSize(elementType);
    
    const listReader = this.structReader.getList<unknown>(pointerIndex, elementSize);
    if (!listReader) {
      return [];
    }
    
    // Convert list reader to array
    const result: unknown[] = [];
    const length = listReader.length;
    
    for (let i = 0; i < length; i++) {
      result.push(this.readListElement(listReader, i, elementType));
    }
    
    return result;
  }
  
  /**
   * Map schema type to ElementSize
   */
  private mapTypeToElementSize(type: SchemaType): ElementSize {
    switch (type.kind.type) {
      case "void":
        return ElementSize.VOID;
      case "bool":
        return ElementSize.BIT;
      case "int8":
      case "uint8":
        return ElementSize.BYTE;
      case "int16":
      case "uint16":
        return ElementSize.TWO_BYTES;
      case "int32":
      case "uint32":
      case "float32":
        return ElementSize.FOUR_BYTES;
      case "int64":
      case "uint64":
      case "float64":
        return ElementSize.EIGHT_BYTES;
      case "struct":
        return ElementSize.COMPOSITE;
      default:
        return ElementSize.POINTER;
    }
  }
  
  /**
   * Read a single list element
   */
  private readListElement(listReader: ListReader<unknown>, index: number, elementType: SchemaType): unknown {
    const kind = elementType.kind;
    
    switch (kind.type) {
      case "void":
        return undefined;
      case "bool":
        return listReader.getPrimitive(index) !== 0;
      case "int8":
        return listReader.getPrimitive(index);
      case "int16":
        return listReader.getPrimitive(index);
      case "int32":
        return listReader.getPrimitive(index);
      case "int64":
        return listReader.getPrimitive(index);
      case "uint8":
        return listReader.getPrimitive(index);
      case "uint16":
        return listReader.getPrimitive(index);
      case "uint32":
        return listReader.getPrimitive(index);
      case "uint64":
        return listReader.getPrimitive(index);
      case "float32":
        return listReader.getPrimitive(index);
      case "float64":
        return listReader.getPrimitive(index);
      case "struct": {
        const structReader = listReader.getStruct(index);
        if (!structReader) return undefined;
        // Return a wrapper without full schema
        return new DynamicStructReaderWithoutSchema(structReader, this.messageReader);
      }
      default:
        return undefined;
    }
  }
  
  /**
   * Read an enum field
   */
  private readEnumField(field: SchemaField): number {
    // Enums are stored as uint16
    return this.structReader.getUint16(field.offset);
  }
  
  /**
   * Read a struct field
   */
  private readStructField(field: SchemaField): DynamicReader | undefined {
    const pointerIndex = this.getPointerIndex(field);
    const nestedStruct = this.structReader.getStruct(pointerIndex, 0, 0);
    if (!nestedStruct) {
      return undefined;
    }
    
    // Without the nested schema, we return a limited reader
    return new DynamicStructReaderWithoutSchema(nestedStruct, this.messageReader);
  }
  
  /**
   * Read an interface field (capability)
   */
  private readInterfaceField(_field: SchemaField): unknown {
    // Capabilities are stored in the cap table
    // This would require access to the capability table
    throw new Error("Interface fields not yet supported in dynamic reader");
  }
  
  /**
   * Read an anyPointer field
   */
  private readAnyPointerField(_field: SchemaField): unknown {
    // anyPointer can be any type, requires runtime type detection
    throw new Error("anyPointer fields not yet supported in dynamic reader");
  }
}

/**
 * A limited dynamic reader for structs without schema information
 * Provides basic field access but no type information
 */
class DynamicStructReaderWithoutSchema implements DynamicReader {
  constructor(
    private structReader: StructReader,
    private messageReader: MessageReader
  ) {}
  
  get(_fieldName: string): unknown {
    throw new Error("Cannot access fields without schema information");
  }
  
  has(_fieldName: string): boolean {
    return false;
  }
  
  getFieldNames(): string[] {
    return [];
  }
  
  getSchema(): SchemaNode {
    throw new Error("No schema information available");
  }
  
  getStruct(_fieldName: string): DynamicReader | undefined {
    return undefined;
  }
  
  getList(_fieldName: string): unknown[] | undefined {
    return undefined;
  }
  
  getRawReader(): StructReader {
    return this.structReader;
  }
}

/**
 * Create a dynamic reader for a specific type ID
 * This looks up the schema in a registry and creates the appropriate reader
 * 
 * @param typeId - The type ID of the struct
 * @param buffer - The Cap'n Proto message buffer
 * @param schemaRegistry - A map of type IDs to schema nodes
 * @returns A DynamicReader for the message
 */
export function createDynamicReaderByTypeId(
  typeId: bigint,
  buffer: ArrayBuffer | Uint8Array,
  schemaRegistry: Map<bigint, SchemaNode>
): DynamicReader {
  const schema = schemaRegistry.get(typeId);
  if (!schema) {
    throw new Error(`Schema not found for type ID: ${typeId}`);
  }
  
  if (schema.type !== SchemaNodeType.STRUCT) {
    throw new Error(`Type ${typeId} is not a struct`);
  }
  
  return createDynamicReader(schema, buffer);
}

/**
 * Utility function to dump all fields from a dynamic reader
 * Useful for debugging and exploration
 * 
 * @param reader - The DynamicReader to dump
 * @returns An object with all field names and values
 */
export function dumpDynamicReader(reader: DynamicReader): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  
  for (const fieldName of reader.getFieldNames()) {
    try {
      result[fieldName] = reader.get(fieldName);
    } catch (error) {
      result[fieldName] = `<error: ${error}>`;
    }
  }
  
  return result;
}