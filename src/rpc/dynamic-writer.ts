/**
 * Phase 7: Dynamic Schema Writer
 * 
 * This module provides runtime writing of Cap'n Proto messages using
 * dynamically loaded schema information. This allows writing messages
 * for types not known at compile time.
 */

import { MessageBuilder, StructBuilder } from "../core/message-builder.js";
import { ListBuilder } from "../core/list.js";
import { ElementSize } from "../core/pointer.js";
import type { SchemaNode, SchemaField, SchemaType, SchemaValue } from "./schema-types.js";
import { SchemaNodeType } from "./schema-types.js";

/**
 * Dynamic writer for Cap'n Proto messages
 * Provides runtime field setting based on schema information
 */
export interface DynamicWriter {
  /** Set a field value by name */
  set(fieldName: string, value: unknown): void;
  
  /** Set multiple fields at once */
  setFields(fields: Record<string, unknown>): void;
  
  /** Initialize a nested struct field */
  initStruct(fieldName: string): DynamicWriter;
  
  /** Initialize a list field */
  initList(fieldName: string, size: number): DynamicListWriter;
  
  /** Set a text field */
  setText(fieldName: string, value: string): void;
  
  /** Set a data field */
  setData(fieldName: string, value: Uint8Array): void;
  
  /** Get the underlying schema node */
  getSchema(): SchemaNode;
  
  /** Get the raw StructBuilder */
  getRawBuilder(): StructBuilder;
  
  /** Serialize the message to a buffer */
  toBuffer(): ArrayBuffer;
}

/**
 * Dynamic list writer
 * Provides runtime element setting for list fields
 */
export interface DynamicListWriter {
  /** Set an element at the specified index */
  set(index: number, value: unknown): void;
  
  /** Get the list size */
  getSize(): number;
  
  /** Initialize a nested struct element */
  initStruct(index: number): DynamicWriter;
  
  /** Set multiple elements at once */
  setAll(values: unknown[]): void;
}

/**
 * Create a dynamic writer from schema
 * 
 * @param schema - The schema node describing the struct type
 * @returns A DynamicWriter for setting message fields
 */
export function createDynamicWriter(schema: SchemaNode): DynamicWriter {
  if (!schema.structInfo) {
    throw new Error(`Schema node ${schema.displayName} is not a struct`);
  }
  
  const { dataWordCount, pointerCount } = schema.structInfo;
  const messageBuilder = new MessageBuilder();
  const structBuilder = messageBuilder.initRoot(dataWordCount, pointerCount);
  
  return new DynamicWriterImpl(schema, structBuilder, messageBuilder);
}

/**
 * Create a dynamic writer for a nested struct
 * 
 * @param schema - The schema node describing the struct type
 * @param structBuilder - The StructBuilder to wrap
 * @param messageBuilder - The underlying MessageBuilder
 * @returns A DynamicWriter for setting message fields
 */
export function createNestedDynamicWriter(
  schema: SchemaNode,
  structBuilder: StructBuilder,
  messageBuilder: MessageBuilder
): DynamicWriter {
  return new DynamicWriterImpl(schema, structBuilder, messageBuilder);
}

/**
 * Implementation of DynamicWriter
 */
class DynamicWriterImpl implements DynamicWriter {
  private fieldCache: Map<string, SchemaField>;
  private pointerOffset: number;
  
  constructor(
    private schema: SchemaNode,
    private structBuilder: StructBuilder,
    private messageBuilder: MessageBuilder
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
  
  set(fieldName: string, value: unknown): void {
    const field = this.fieldCache.get(fieldName);
    if (!field) {
      throw new Error(`Field '${fieldName}' not found in schema ${this.schema.displayName}`);
    }
    
    this.writeFieldValue(field, value);
  }
  
  setFields(fields: Record<string, unknown>): void {
    for (const [name, value] of Object.entries(fields)) {
      this.set(name, value);
    }
  }
  
  initStruct(fieldName: string): DynamicWriter {
    const field = this.fieldCache.get(fieldName);
    if (!field) {
      throw new Error(`Field '${fieldName}' not found in schema ${this.schema.displayName}`);
    }
    
    if (field.type.kind.type !== "struct") {
      throw new Error(`Field '${fieldName}' is not a struct type`);
    }
    
    // For nested structs, we need the nested schema
    // Since we don't have it here, we'll create a placeholder
    const pointerIndex = this.getPointerIndex(field);
    const nestedBuilder = this.structBuilder.initStruct(pointerIndex, 0, 0);
    
    // Return a writer without schema - limited functionality
    return new DynamicWriterWithoutSchema(nestedBuilder, this.messageBuilder);
  }
  
  initList(fieldName: string, size: number): DynamicListWriter {
    const field = this.fieldCache.get(fieldName);
    if (!field) {
      throw new Error(`Field '${fieldName}' not found in schema ${this.schema.displayName}`);
    }
    
    if (field.type.kind.type !== "list") {
      throw new Error(`Field '${fieldName}' is not a list type`);
    }
    
    const pointerIndex = this.getPointerIndex(field);
    const elementType = field.type.kind.elementType;
    
    return this.createListWriter(pointerIndex, size, elementType);
  }
  
  setText(fieldName: string, value: string): void {
    const field = this.fieldCache.get(fieldName);
    if (!field) {
      throw new Error(`Field '${fieldName}' not found in schema ${this.schema.displayName}`);
    }
    
    if (field.type.kind.type !== "text") {
      throw new Error(`Field '${fieldName}' is not a text type`);
    }
    
    const pointerIndex = this.getPointerIndex(field);
    this.structBuilder.setText(pointerIndex, value);
  }
  
  setData(fieldName: string, value: Uint8Array): void {
    const field = this.fieldCache.get(fieldName);
    if (!field) {
      throw new Error(`Field '${fieldName}' not found in schema ${this.schema.displayName}`);
    }
    
    if (field.type.kind.type !== "data") {
      throw new Error(`Field '${fieldName}' is not a data type`);
    }
    
    // Data is stored similarly to text but as bytes
    const pointerIndex = this.getPointerIndex(field);
    const textValue = new TextDecoder().decode(value);
    this.structBuilder.setText(pointerIndex, textValue + '\0');
  }
  
  getSchema(): SchemaNode {
    return this.schema;
  }
  
  getRawBuilder(): StructBuilder {
    return this.structBuilder;
  }
  
  toBuffer(): ArrayBuffer {
    return this.messageBuilder.toArrayBuffer();
  }
  
  /**
   * Write a field value based on its type
   */
  private writeFieldValue(field: SchemaField, value: unknown): void {
    const kind = field.type.kind;
    
    switch (kind.type) {
      case "void":
        // Void fields don't store any data
        break;
      case "bool":
        this.structBuilder.setBool(field.offset, Boolean(value));
        break;
      case "int8":
        this.structBuilder.setInt8(field.offset, Number(value));
        break;
      case "int16":
        this.structBuilder.setInt16(field.offset, Number(value));
        break;
      case "int32":
        this.structBuilder.setInt32(field.offset, Number(value));
        break;
      case "int64":
        this.structBuilder.setInt64(field.offset, BigInt(value as string | number | bigint));
        break;
      case "uint8":
        this.structBuilder.setUint8(field.offset, Number(value));
        break;
      case "uint16":
        this.structBuilder.setUint16(field.offset, Number(value));
        break;
      case "uint32":
        this.structBuilder.setUint32(field.offset, Number(value));
        break;
      case "uint64":
        this.structBuilder.setUint64(field.offset, BigInt(value as string | number | bigint));
        break;
      case "float32":
        this.structBuilder.setFloat32(field.offset, Number(value));
        break;
      case "float64":
        this.structBuilder.setFloat64(field.offset, Number(value));
        break;
      case "text":
        this.setText(field.name, String(value));
        break;
      case "data":
        if (value instanceof Uint8Array) {
          this.setData(field.name, value);
        } else {
          throw new Error(`Field '${field.name}' expects Uint8Array`);
        }
        break;
      case "list":
        if (Array.isArray(value)) {
          const listWriter = this.initList(field.name, value.length);
          listWriter.setAll(value);
        } else {
          throw new Error(`Field '${field.name}' expects an array`);
        }
        break;
      case "enum":
        this.structBuilder.setUint16(field.offset, Number(value));
        break;
      case "struct":
        if (typeof value === "object" && value !== null) {
          const structWriter = this.initStruct(field.name);
          // If value is a record, set its fields
          if (!(value instanceof Uint8Array) && !Array.isArray(value)) {
            structWriter.setFields(value as Record<string, unknown>);
          }
        } else {
          throw new Error(`Field '${field.name}' expects an object`);
        }
        break;
      case "interface":
        throw new Error(`Interface fields not yet supported in dynamic writer`);
      case "anyPointer":
        throw new Error(`anyPointer fields not yet supported in dynamic writer`);
      default:
        throw new Error(`Unsupported field type: ${(kind as { type: string }).type}`);
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
   * Create a list writer for a field
   */
  private createListWriter(
    pointerIndex: number,
    size: number,
    elementType: SchemaType
  ): DynamicListWriter {
    // Map element type to ElementSize
    const elementSize = this.mapTypeToElementSize(elementType);
    
    let structSize: { dataWords: number; pointerCount: number } | undefined;
    if (elementSize === ElementSize.COMPOSITE) {
      // For composite types, we need struct size info
      // Default to 0,0 if not available
      structSize = { dataWords: 0, pointerCount: 0 };
    }
    
    const listBuilder = this.structBuilder.initList<unknown>(
      pointerIndex,
      elementSize,
      size,
      structSize
    );
    
    return new DynamicListWriterImpl(listBuilder, elementType, this.messageBuilder);
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
}

/**
 * Implementation of DynamicListWriter
 */
class DynamicListWriterImpl implements DynamicListWriter {
  constructor(
    private listBuilder: ListBuilder<unknown>,
    private elementType: SchemaType,
    private messageBuilder: MessageBuilder
  ) {}
  
  set(index: number, value: unknown): void {
    if (index < 0 || index >= this.listBuilder.length) {
      throw new Error(`Index ${index} out of bounds`);
    }
    
    const kind = this.elementType.kind;
    
    switch (kind.type) {
      case "void":
        // Nothing to set for void
        break;
      case "bool":
        this.listBuilder.setPrimitive(index, Boolean(value) ? 1 : 0);
        break;
      case "int8":
      case "uint8":
      case "int16":
      case "uint16":
      case "int32":
      case "uint32":
      case "float32":
        this.listBuilder.setPrimitive(index, Number(value));
        break;
      case "int64":
      case "uint64":
      case "float64":
        this.listBuilder.setPrimitive(index, BigInt(value as string | number | bigint));
        break;
      case "struct":
        // For struct lists, value should be an object to set fields
        if (typeof value === "object" && value !== null && !(value instanceof Uint8Array)) {
          const structWriter = this.initStruct(index);
          structWriter.setFields(value as Record<string, unknown>);
        }
        break;
      default:
        throw new Error(`Unsupported list element type: ${kind.type}`);
    }
  }
  
  getSize(): number {
    return this.listBuilder.length;
  }
  
  getLength(): number {
    return this.listBuilder.length;
  }
  
  initStruct(index: number): DynamicWriter {
    const structBuilder = this.listBuilder.getStruct(index);
    return new DynamicWriterWithoutSchema(structBuilder, this.messageBuilder);
  }
  
  setAll(values: unknown[]): void {
    if (values.length > this.getSize()) {
      throw new Error(`Cannot set ${values.length} values in list of size ${this.getSize()}`);
    }
    
    for (let i = 0; i < values.length; i++) {
      this.set(i, values[i]);
    }
  }
}

/**
 * A limited dynamic writer for structs without full schema information
 * Provides basic field setting but no type validation
 */
class DynamicWriterWithoutSchema implements DynamicWriter {
  constructor(
    private structBuilder: StructBuilder,
    private messageBuilder: MessageBuilder
  ) {}
  
  set(fieldName: string, _value: unknown): void {
    // Without schema, we can only support basic operations
    // This is a placeholder that could be extended
    throw new Error(`Cannot set field '${fieldName}' without schema information`);
  }
  
  setFields(_fields: Record<string, unknown>): void {
    throw new Error("Cannot set fields without schema information");
  }
  
  initStruct(_fieldName: string): DynamicWriter {
    throw new Error("Cannot init struct without schema information");
  }
  
  initList(_fieldName: string, _size: number): DynamicListWriter {
    throw new Error("Cannot init list without schema information");
  }
  
  setText(_fieldName: string, _value: string): void {
    throw new Error("Cannot set text without schema information");
  }
  
  setData(_fieldName: string, _value: Uint8Array): void {
    throw new Error("Cannot set data without schema information");
  }
  
  getSchema(): SchemaNode {
    throw new Error("No schema information available");
  }
  
  getRawBuilder(): StructBuilder {
    return this.structBuilder;
  }
  
  toBuffer(): ArrayBuffer {
    return this.messageBuilder.toArrayBuffer();
  }
}

/**
 * Create a dynamic writer for a specific type ID
 * This looks up the schema in a registry and creates the appropriate writer
 * 
 * @param typeId - The type ID of the struct
 * @param schemaRegistry - A map of type IDs to schema nodes
 * @returns A DynamicWriter for the message
 */
export function createDynamicWriterByTypeId(
  typeId: bigint,
  schemaRegistry: Map<bigint, SchemaNode>
): DynamicWriter {
  const schema = schemaRegistry.get(typeId);
  if (!schema) {
    throw new Error(`Schema not found for type ID: ${typeId}`);
  }
  
  if (schema.type !== SchemaNodeType.STRUCT) {
    throw new Error(`Type ${typeId} is not a struct`);
  }
  
  return createDynamicWriter(schema);
}

/**
 * Utility function to create a message from a plain object
 * Uses schema information to properly serialize the data
 * 
 * @param schema - The schema node describing the struct type
 * @param data - The data object to serialize
 * @returns The serialized message buffer
 */
export function serializeDynamic(
  schema: SchemaNode,
  data: Record<string, unknown>
): ArrayBuffer {
  const writer = createDynamicWriter(schema);
  writer.setFields(data);
  return writer.toBuffer();
}

/**
 * Utility function to create a message from a plain object using type ID
 * 
 * @param typeId - The type ID of the struct
 * @param data - The data object to serialize
 * @param schemaRegistry - A map of type IDs to schema nodes
 * @returns The serialized message buffer
 */
export function serializeDynamicByTypeId(
  typeId: bigint,
  data: Record<string, unknown>,
  schemaRegistry: Map<bigint, SchemaNode>
): ArrayBuffer {
  const writer = createDynamicWriterByTypeId(typeId, schemaRegistry);
  writer.setFields(data);
  return writer.toBuffer();
}