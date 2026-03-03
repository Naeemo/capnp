/**
 * Type mapping utilities
 */

import type { FieldType as Type } from './types.js';

export function isPointerType(type: Type): boolean {
  return type === 'text' || type === 'data' || type === 'list' || type === 'struct';
}

export function getTypeSize(type: Type): number {
  switch (type) {
    case 'void':
      return 0;
    case 'bool':
      return 1;
    case 'int8':
    case 'uint8':
      return 1;
    case 'int16':
    case 'uint16':
      return 2;
    case 'int32':
    case 'uint32':
    case 'float32':
      return 4;
    case 'int64':
    case 'uint64':
    case 'float64':
      return 8;
    default:
      return 8;
  }
}

export function mapTypeToTs(type: Type): string {
  switch (type) {
    case 'void':
      return 'void';
    case 'bool':
      return 'boolean';
    case 'int8':
    case 'int16':
    case 'int32':
    case 'uint8':
    case 'uint16':
    case 'uint32':
    case 'float32':
    case 'float64':
      return 'number';
    case 'int64':
    case 'uint64':
      return 'bigint';
    case 'text':
      return 'string';
    case 'data':
      return 'Uint8Array';
    case 'list':
      return 'unknown[]';
    case 'struct':
      return 'unknown';
    case 'enum':
      return 'number';
    case 'anyPointer':
    case 'capability':
      return 'unknown';
    default:
      return 'unknown';
  }
}

export function getGetterMethod(type: Type): string {
  switch (type) {
    case 'void':
      return 'getVoid';
    case 'bool':
      return 'getBool';
    case 'int8':
      return 'getInt8';
    case 'int16':
      return 'getInt16';
    case 'int32':
      return 'getInt32';
    case 'int64':
      return 'getInt64';
    case 'uint8':
      return 'getUint8';
    case 'uint16':
      return 'getUint16';
    case 'uint32':
      return 'getUint32';
    case 'uint64':
      return 'getUint64';
    case 'float32':
      return 'getFloat32';
    case 'float64':
      return 'getFloat64';
    case 'text':
      return 'getText';
    case 'data':
      return 'getData';
    case 'list':
      return 'getList';
    case 'struct':
      return 'getStruct';
    case 'enum':
      return 'getEnum';
    case 'anyPointer':
      return 'getPointer';
    case 'capability':
      return 'getCapability';
    default:
      return 'getUnknown';
  }
}

export function getSetterMethod(type: Type): string {
  switch (type) {
    case 'void':
      return 'setVoid';
    case 'bool':
      return 'setBool';
    case 'int8':
      return 'setInt8';
    case 'int16':
      return 'setInt16';
    case 'int32':
      return 'setInt32';
    case 'int64':
      return 'setInt64';
    case 'uint8':
      return 'setUint8';
    case 'uint16':
      return 'setUint16';
    case 'uint32':
      return 'setUint32';
    case 'uint64':
      return 'setUint64';
    case 'float32':
      return 'setFloat32';
    case 'float64':
      return 'setFloat64';
    case 'text':
      return 'setText';
    case 'data':
      return 'setData';
    case 'list':
      return 'initList';
    case 'struct':
      return 'initStruct';
    case 'enum':
      return 'setEnum';
    case 'anyPointer':
      return 'setPointer';
    case 'capability':
      return 'setCapability';
    default:
      return 'setUnknown';
  }
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
