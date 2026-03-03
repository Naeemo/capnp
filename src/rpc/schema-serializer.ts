/**
 * Phase 7: Dynamic Schema Transfer Protocol - Message Serializer
 * 
 * This module handles serialization and deserialization of schema-related
 * RPC messages (SchemaRequest, SchemaResponse, etc.)
 */

import type {
  SchemaRequest,
  SchemaResponse,
  SchemaTarget,
  SchemaResponseResult,
  SchemaPayload,
  SchemaDependency,
  AvailableSchema,
  GetSchemaParams,
  GetSchemaResults,
  ListSchemasResults,
} from "./schema-types";
import { SchemaFormat } from "./schema-types.js";
import type { Exception, ExceptionType } from "./rpc-types";

// Message type IDs for schema messages
export const SCHEMA_MESSAGE_TYPES = {
  SCHEMA_REQUEST: 14,
  SCHEMA_RESPONSE: 15,
} as const;

/**
 * Serialize a SchemaRequest to binary format
 */
export function serializeSchemaRequest(request: SchemaRequest): Uint8Array {
  // Calculate size needed
  const targetSize = getSchemaTargetSize(request.targetSchema);
  const totalSize = 8 + targetSize; // questionId (4) + padding + target
  
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  
  // Write questionId
  view.setUint32(0, request.questionId, true);
  
  // Write target (starts at offset 8 for alignment)
  let offset = 8;
  offset = writeSchemaTarget(bytes, offset, request.targetSchema);
  
  return bytes;
}

/**
 * Deserialize a SchemaRequest from binary format
 */
export function deserializeSchemaRequest(data: Uint8Array): SchemaRequest {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  
  // Read questionId
  const questionId = view.getUint32(0, true);
  
  // Read target (starts at offset 8)
  const target = readSchemaTarget(data, 8);
  
  return {
    questionId,
    targetSchema: target.value,
  };
}

/**
 * Get the serialized size of a SchemaTarget
 */
function getSchemaTargetSize(target: SchemaTarget): number {
  switch (target.type) {
    case "allSchemas":
    case "bootstrapInterface":
      return 8; // tag only
    case "byTypeId":
    case "byFileId":
      return 16; // tag + 8-byte ID
    case "byTypeName":
    case "byFileName":
      // tag + pointer + string data (aligned)
      const strLen = target.type === "byTypeName" 
        ? target.typeName.length 
        : target.fileName.length;
      return 16 + align8(strLen);
    default:
      return 8;
  }
}

/**
 * Write a SchemaTarget to binary format
 */
function writeSchemaTarget(bytes: Uint8Array, offset: number, target: SchemaTarget): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  
  switch (target.type) {
    case "allSchemas":
      view.setUint16(offset, 0, true);
      break;
    case "byTypeId":
      view.setUint16(offset, 1, true);
      view.setBigUint64(offset + 8, target.typeId, true);
      break;
    case "byTypeName": {
      view.setUint16(offset, 2, true);
      const strBytes = new TextEncoder().encode(target.typeName);
      writePointer(bytes, offset + 8, strBytes.length);
      bytes.set(strBytes, offset + 16);
      return offset + 16 + align8(strBytes.length);
    }
    case "byFileId":
      view.setUint16(offset, 3, true);
      view.setBigUint64(offset + 8, target.fileId, true);
      break;
    case "byFileName": {
      view.setUint16(offset, 4, true);
      const strBytes = new TextEncoder().encode(target.fileName);
      writePointer(bytes, offset + 8, strBytes.length);
      bytes.set(strBytes, offset + 16);
      return offset + 16 + align8(strBytes.length);
    }
    case "bootstrapInterface":
      view.setUint16(offset, 5, true);
      break;
  }
  
  return offset + 8;
}

/**
 * Read a SchemaTarget from binary format
 */
function readSchemaTarget(data: Uint8Array, offset: number): { value: SchemaTarget; nextOffset: number } {
  const view = new DataView(data.buffer, data.byteOffset);
  const tag = view.getUint16(offset, true);
  
  switch (tag) {
    case 0:
      return { value: { type: "allSchemas" }, nextOffset: offset + 8 };
    case 1:
      return { 
        value: { type: "byTypeId", typeId: view.getBigUint64(offset + 8, true) },
        nextOffset: offset + 16 
      };
    case 2: {
      const strLen = readPointer(data, offset + 8);
      const strBytes = data.slice(offset + 16, offset + 16 + strLen);
      const typeName = new TextDecoder().decode(strBytes);
      return { 
        value: { type: "byTypeName", typeName },
        nextOffset: offset + 16 + align8(strLen)
      };
    }
    case 3:
      return { 
        value: { type: "byFileId", fileId: view.getBigUint64(offset + 8, true) },
        nextOffset: offset + 16 
      };
    case 4: {
      const strLen = readPointer(data, offset + 8);
      const strBytes = data.slice(offset + 16, offset + 16 + strLen);
      const fileName = new TextDecoder().decode(strBytes);
      return { 
        value: { type: "byFileName", fileName },
        nextOffset: offset + 16 + align8(strLen)
      };
    }
    case 5:
      return { value: { type: "bootstrapInterface" }, nextOffset: offset + 8 };
    default:
      return { value: { type: "allSchemas" }, nextOffset: offset + 8 };
  }
}

/**
 * Serialize a SchemaResponse to binary format
 */
export function serializeSchemaResponse(response: SchemaResponse): Uint8Array {
  const resultSize = getSchemaResponseResultSize(response.result);
  const totalSize = 8 + resultSize; // answerId (4) + padding + result
  
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  
  // Write answerId
  view.setUint32(0, response.answerId, true);
  
  // Write result
  writeSchemaResponseResult(bytes, 8, response.result);
  
  return bytes;
}

/**
 * Deserialize a SchemaResponse from binary format
 */
export function deserializeSchemaResponse(data: Uint8Array): SchemaResponse {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  
  // Read answerId
  const answerId = view.getUint32(0, true);
  
  // Read result
  const result = readSchemaResponseResult(data, 8);
  
  return {
    answerId,
    result: result.value,
  };
}

/**
 * Get the serialized size of a SchemaResponseResult
 */
function getSchemaResponseResultSize(result: SchemaResponseResult): number {
  switch (result.type) {
    case "success":
      return 8 + getSchemaPayloadSize(result.payload);
    case "exception":
      return 8 + getExceptionSize(result.exception);
    default:
      return 8;
  }
}

/**
 * Write a SchemaResponseResult to binary format
 */
function writeSchemaResponseResult(bytes: Uint8Array, offset: number, result: SchemaResponseResult): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  
  switch (result.type) {
    case "success":
      view.setUint16(offset, 0, true);
      return writeSchemaPayload(bytes, offset + 8, result.payload);
    case "exception":
      view.setUint16(offset, 1, true);
      return writeException(bytes, offset + 8, result.exception);
    default:
      view.setUint16(offset, 0, true);
      return offset + 8;
  }
}

/**
 * Read a SchemaResponseResult from binary format
 */
function readSchemaResponseResult(data: Uint8Array, offset: number): { value: SchemaResponseResult; nextOffset: number } {
  const view = new DataView(data.buffer, data.byteOffset);
  const tag = view.getUint16(offset, true);
  
  switch (tag) {
    case 0: {
      const payload = readSchemaPayload(data, offset + 8);
      return { value: { type: "success", payload: payload.value }, nextOffset: payload.nextOffset };
    }
    case 1: {
      const exception = readException(data, offset + 8);
      return { value: { type: "exception", exception: exception.value }, nextOffset: exception.nextOffset };
    }
    default:
      return { value: { type: "success", payload: { schemaData: new Uint8Array(), format: SchemaFormat.BINARY, dependencies: [] } }, nextOffset: offset + 8 };
  }
}

/**
 * Get the serialized size of a SchemaPayload
 */
function getSchemaPayloadSize(payload: SchemaPayload): number {
  let size = 32; // format (4) + padding + schemaData pointer (8) + sourceInfo pointer (8) + dependencies pointer (8)
  size += align8(payload.schemaData.length);
  if (payload.sourceInfo) {
    size += align8(payload.sourceInfo.length);
  }
  size += getSchemaDependenciesSize(payload.dependencies);
  return size;
}

/**
 * Write a SchemaPayload to binary format
 */
function writeSchemaPayload(bytes: Uint8Array, offset: number, payload: SchemaPayload): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset);

  // Write format
  view.setUint32(offset, payload.format, true);

  let currentOffset = offset + 8; // Skip padding to align to 8 bytes

  // Write schemaData pointer and data
  writePointer(bytes, currentOffset, payload.schemaData.length);
  currentOffset += 8;
  bytes.set(payload.schemaData, currentOffset);
  currentOffset += align8(payload.schemaData.length);

  // Write sourceInfo pointer and data (optional)
  if (payload.sourceInfo) {
    writePointer(bytes, currentOffset, payload.sourceInfo.length);
    currentOffset += 8;
    bytes.set(payload.sourceInfo, currentOffset);
    currentOffset += align8(payload.sourceInfo.length);
  } else {
    writePointer(bytes, currentOffset, 0);
    currentOffset += 8;
  }

  // Write dependencies
  currentOffset = writeSchemaDependencies(bytes, currentOffset, payload.dependencies);

  return currentOffset;
}

/**
 * Read a SchemaPayload from binary format
 */
function readSchemaPayload(data: Uint8Array, offset: number): { value: SchemaPayload; nextOffset: number } {
  const view = new DataView(data.buffer, data.byteOffset);

  // Read format
  const format = view.getUint32(offset, true) as SchemaFormat;

  let currentOffset = offset + 8; // Skip padding

  // Read schemaData pointer and data
  const schemaDataLen = readPointer(data, currentOffset);
  currentOffset += 8;
  const schemaData = data.slice(currentOffset, currentOffset + schemaDataLen);
  currentOffset += align8(schemaDataLen);

  // Read sourceInfo pointer and data (optional)
  const sourceInfoLen = readPointer(data, currentOffset);
  currentOffset += 8;
  let sourceInfo: Uint8Array | undefined;
  if (sourceInfoLen > 0) {
    sourceInfo = data.slice(currentOffset, currentOffset + sourceInfoLen);
    currentOffset += align8(sourceInfoLen);
  }

  // Read dependencies
  const deps = readSchemaDependencies(data, currentOffset);

  return {
    value: {
      schemaData,
      format,
      sourceInfo,
      dependencies: deps.value,
    },
    nextOffset: deps.nextOffset,
  };
}

/**
 * Get the serialized size of SchemaDependency array
 */
function getSchemaDependenciesSize(deps: SchemaDependency[]): number {
  let size = 8; // List pointer
  for (const dep of deps) {
    size += 32; // fileId (8) + fileName pointer (8) + schemaHash pointer (8) + padding to align
    size += align8(dep.fileName.length + 1); // +1 for null terminator
    if (dep.schemaHash) {
      size += align8(dep.schemaHash.length);
    }
  }
  return size;
}

/**
 * Write SchemaDependency array to binary format
 */
function writeSchemaDependencies(bytes: Uint8Array, offset: number, deps: SchemaDependency[]): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset);

  // Write list pointer (count)
  writePointer(bytes, offset, deps.length);
  let currentOffset = offset + 8;

  for (const dep of deps) {
    // Write fileId
    view.setBigUint64(currentOffset, dep.fileId, true);
    currentOffset += 8;

    // Write fileName pointer and text (with null terminator)
    const fileNameBytes = new TextEncoder().encode(dep.fileName + '\0');
    writePointer(bytes, currentOffset, fileNameBytes.length);
    currentOffset += 8;
    bytes.set(fileNameBytes, currentOffset);
    currentOffset += align8(fileNameBytes.length);

    // Write schemaHash pointer and data (if present)
    if (dep.schemaHash && dep.schemaHash.length > 0) {
      writePointer(bytes, currentOffset, dep.schemaHash.length);
      currentOffset += 8;
      bytes.set(dep.schemaHash, currentOffset);
      currentOffset += align8(dep.schemaHash.length);
    } else {
      writePointer(bytes, currentOffset, 0);
      currentOffset += 8;
    }
  }

  return currentOffset;
}

/**
 * Read SchemaDependency array from binary format
 */
function readSchemaDependencies(data: Uint8Array, offset: number): { value: SchemaDependency[]; nextOffset: number } {
  const view = new DataView(data.buffer, data.byteOffset);

  // Read list pointer (count)
  const count = readPointer(data, offset);
  let currentOffset = offset + 8;

  const deps: SchemaDependency[] = [];

  for (let i = 0; i < count; i++) {
    // Read fileId
    const fileId = view.getBigUint64(currentOffset, true);
    currentOffset += 8;

    // Read fileName pointer and text
    const fileNameLen = readPointer(data, currentOffset);
    currentOffset += 8;
    const fileNameBytes = data.slice(currentOffset, currentOffset + fileNameLen);
    // Remove null terminator if present
    const fileName = new TextDecoder().decode(fileNameBytes).replace(/\0$/, '');
    currentOffset += align8(fileNameLen);

    // Read schemaHash pointer and data
    const schemaHashLen = readPointer(data, currentOffset);
    currentOffset += 8;
    let schemaHash: Uint8Array | undefined;
    if (schemaHashLen > 0) {
      schemaHash = data.slice(currentOffset, currentOffset + schemaHashLen);
      currentOffset += align8(schemaHashLen);
    }

    deps.push({ fileId, fileName, schemaHash });
  }

  return { value: deps, nextOffset: currentOffset };
}

/**
 * Get the serialized size of an Exception
 */
function getExceptionSize(exception: Exception): number {
  let size = 24; // reason pointer (8) + type (8) + deprecated fields (8)
  size += align8(exception.reason.length);
  return size;
}

/**
 * Write an Exception to binary format
 */
function writeException(bytes: Uint8Array, offset: number, exception: Exception): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset);

  // Write reason pointer and text
  const reasonBytes = new TextEncoder().encode(exception.reason);
  writePointer(bytes, offset, reasonBytes.length);
  bytes.set(reasonBytes, offset + 8);
  let currentOffset = offset + 8 + align8(reasonBytes.length);

  // Write type (aligned to 8 bytes)
  view.setUint16(currentOffset, exception.type as unknown as number, true);
  currentOffset += 8;

  // Write deprecated fields (aligned to 8 bytes)
  view.setUint8(currentOffset, exception.obsoleteIsCallersFault ? 1 : 0);
  view.setUint16(currentOffset + 1, (exception.obsoleteDurability ?? 0) as unknown as number, true);
  currentOffset += 8;

  return currentOffset;
}

/**
 * Read an Exception from binary format
 */
function readException(data: Uint8Array, offset: number): { value: Exception; nextOffset: number } {
  const view = new DataView(data.buffer, data.byteOffset);

  // Read reason pointer and text
  const reasonLen = readPointer(data, offset);
  const reasonBytes = data.slice(offset + 8, offset + 8 + reasonLen);
  const reason = new TextDecoder().decode(reasonBytes);
  let currentOffset = offset + 8 + align8(reasonLen);

  // Read type (aligned to 8 bytes)
  const type = view.getUint16(currentOffset, true) as unknown as ExceptionType;
  currentOffset += 8;

  // Read deprecated fields (aligned to 8 bytes)
  const obsoleteIsCallersFault = view.getUint8(currentOffset) !== 0;
  const obsoleteDurability = view.getUint16(currentOffset + 1, true);
  currentOffset += 8;

  return {
    value: {
      reason,
      type,
      obsoleteIsCallersFault,
      obsoleteDurability,
    },
    nextOffset: currentOffset,
  };
}

/**
 * Helper: Align size to 8-byte boundary
 */
function align8(size: number): number {
  return (size + 7) & ~7;
}

/**
 * Helper: Write a pointer (list/struct offset and size)
 */
function writePointer(bytes: Uint8Array, offset: number, size: number): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  // Simple encoding: just store the size for now
  // In full implementation, this would encode offset + size + type tag
  view.setUint32(offset, size, true);
  view.setUint32(offset + 4, 0, true); // Type tag / padding
}

/**
 * Helper: Read a pointer
 */
function readPointer(data: Uint8Array, offset: number): number {
  const view = new DataView(data.buffer, data.byteOffset);
  return view.getUint32(offset, true);
}

/**
 * Serialize GetSchemaParams
 */
export function serializeGetSchemaParams(params: GetSchemaParams): Uint8Array {
  const targetSize = getSchemaTargetSize(params.target);
  const totalSize = 12 + targetSize; // format (4) + padding + target
  
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  
  // Write format
  view.setUint32(0, params.format ?? SchemaFormat.BINARY, true);
  
  // Write target
  writeSchemaTarget(bytes, 8, params.target);
  
  return bytes;
}

/**
 * Serialize GetSchemaResults
 */
export function serializeGetSchemaResults(results: GetSchemaResults): Uint8Array {
  const payloadSize = getSchemaPayloadSize(results.payload);
  const totalSize = 8 + payloadSize;
  
  const buffer = new ArrayBuffer(totalSize);
  const bytes = new Uint8Array(buffer);
  
  // Write payload
  writeSchemaPayload(bytes, 8, results.payload);
  
  return bytes;
}

/**
 * Serialize ListSchemasResults
 */
export function serializeListSchemasResults(results: ListSchemasResults): Uint8Array {
  let totalSize = 16; // List pointer + padding
  
  for (const schema of results.schemas) {
    totalSize += 32; // typeId (8) + displayName pointer + fileId (8) + fileName pointer + flags
    totalSize += align8(schema.displayName.length);
    totalSize += align8(schema.fileName.length);
  }
  
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  
  // Write list pointer
  writePointer(bytes, 8, results.schemas.length);
  let offset = 16;
  
  for (const schema of results.schemas) {
    // Write typeId
    view.setBigUint64(offset, schema.typeId, true);
    offset += 8;
    
    // Write displayName
    const displayNameBytes = new TextEncoder().encode(schema.displayName);
    writePointer(bytes, offset, displayNameBytes.length);
    offset += 8;
    bytes.set(displayNameBytes, offset);
    offset += align8(displayNameBytes.length);
    
    // Write fileId
    view.setBigUint64(offset, schema.fileId, true);
    offset += 8;
    
    // Write fileName
    const fileNameBytes = new TextEncoder().encode(schema.fileName);
    writePointer(bytes, offset, fileNameBytes.length);
    offset += 8;
    bytes.set(fileNameBytes, offset);
    offset += align8(fileNameBytes.length);
    
    // Write flags
    let flags = 0;
    if (schema.isInterface) flags |= 1;
    if (schema.isStruct) flags |= 2;
    if (schema.isEnum) flags |= 4;
    view.setUint8(offset, flags);
    offset += 8;
  }
  
  return bytes;
}
