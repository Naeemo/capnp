/**
 * Schema types for code generation
 */

export interface StructSchema {
  name: string;
  id?: bigint;
  dataWords: number;
  pointerCount: number;
  fields: Field[];
  isGroup?: boolean;
}

export interface Field {
  name: string;
  type: FieldType;
  offset: number;
  isOptional: boolean;
  defaultValue?: unknown;
  
  // For list types
  elementType?: string;
  
  // For struct types
  structType?: string;
  
  // For enum types
  enumType?: string;
  
  // For union fields
  discriminantValue?: number;
}

export type FieldType =
  | 'void'
  | 'bool'
  | 'int8'
  | 'int16'
  | 'int32'
  | 'int64'
  | 'uint8'
  | 'uint16'
  | 'uint32'
  | 'uint64'
  | 'float32'
  | 'float64'
  | 'text'
  | 'data'
  | 'list'
  | 'struct'
  | 'enum'
  | 'anyPointer'
  | 'capability';

export interface EnumSchema {
  name: string;
  id?: bigint;
  values: EnumValue[];
}

export interface EnumValue {
  name: string;
  value: number;
}

export interface InterfaceSchema {
  name: string;
  id?: bigint;
  methods: Method[];
}

export interface Method {
  name: string;
  paramType?: string;
  resultType?: string;
}

export interface ConstSchema {
  name: string;
  type: FieldType;
  value: unknown;
}
