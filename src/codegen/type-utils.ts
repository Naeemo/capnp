/**
 * Type mapping utilities
 */

import type { Type } from './parser-v2.js';

export function isPointerType(type: Type): boolean {
  if (typeof type === 'string') {
    return type === 'Text' || type === 'Data';
  }
  return type.kind === 'list' || type.kind === 'struct';
}

export function getTypeSize(type: Type): number {
  if (typeof type !== 'string') return 8;
  switch (type) {
    case 'Void':
      return 0;
    case 'Bool':
      return 1;
    case 'Int8':
    case 'UInt8':
      return 1;
    case 'Int16':
    case 'UInt16':
      return 2;
    case 'Int32':
    case 'UInt32':
    case 'Float32':
      return 4;
    case 'Int64':
    case 'UInt64':
    case 'Float64':
      return 8;
    default:
      return 8;
  }
}

export function mapTypeToTs(type: Type): string {
  if (typeof type !== 'string') {
    if (type.kind === 'list') return `${mapTypeToTs(type.elementType)}[]`;
    return type.name;
  }
  switch (type) {
    case 'Void':
      return 'void';
    case 'Bool':
      return 'boolean';
    case 'Int8':
    case 'Int16':
    case 'Int32':
    case 'UInt8':
    case 'UInt16':
    case 'UInt32':
    case 'Float32':
    case 'Float64':
      return 'number';
    case 'Int64':
    case 'UInt64':
      return 'bigint';
    case 'Text':
      return 'string';
    case 'Data':
      return 'Uint8Array';
    default:
      return 'unknown';
  }
}

export function getGetterMethod(type: Type): string {
  if (typeof type !== 'string') {
    if (type.kind === 'list') return 'getList';
    return 'getStruct';
  }
  switch (type) {
    case 'Void':
      return 'getVoid';
    case 'Bool':
      return 'getBool';
    case 'Int8':
      return 'getInt8';
    case 'Int16':
      return 'getInt16';
    case 'Int32':
      return 'getInt32';
    case 'Int64':
      return 'getInt64';
    case 'UInt8':
      return 'getUint8';
    case 'UInt16':
      return 'getUint16';
    case 'UInt32':
      return 'getUint32';
    case 'UInt64':
      return 'getUint64';
    case 'Float32':
      return 'getFloat32';
    case 'Float64':
      return 'getFloat64';
    case 'Text':
      return 'getText';
    case 'Data':
      return 'getData';
    default:
      return 'getUnknown';
  }
}

export function getSetterMethod(type: Type): string {
  if (typeof type !== 'string') {
    if (type.kind === 'list') return 'initList';
    return 'initStruct';
  }
  switch (type) {
    case 'Void':
      return 'setVoid';
    case 'Bool':
      return 'setBool';
    case 'Int8':
      return 'setInt8';
    case 'Int16':
      return 'setInt16';
    case 'Int32':
      return 'setInt32';
    case 'Int64':
      return 'setInt64';
    case 'UInt8':
      return 'setUint8';
    case 'UInt16':
      return 'setUint16';
    case 'UInt32':
      return 'setUint32';
    case 'UInt64':
      return 'setUint64';
    case 'Float32':
      return 'setFloat32';
    case 'Float64':
      return 'setFloat64';
    case 'Text':
      return 'setText';
    case 'Data':
      return 'setData';
    default:
      return 'setUnknown';
  }
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
