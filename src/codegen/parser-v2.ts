/**
 * Cap'n Proto Schema 解析器 v2 - 简化版
 * 基于正则的解析器，支持常用 Cap'n Proto 语法
 */

// 基础类型
export type PrimitiveType =
  | 'Void'
  | 'Bool'
  | 'Int8'
  | 'Int16'
  | 'Int32'
  | 'Int64'
  | 'UInt8'
  | 'UInt16'
  | 'UInt32'
  | 'UInt64'
  | 'Float32'
  | 'Float64'
  | 'Text'
  | 'Data';

export interface ListType {
  kind: 'list';
  elementType: Type;
}

export interface StructType {
  kind: 'struct';
  name: string;
}

export type Type = PrimitiveType | ListType | StructType;

export interface Field {
  name: string;
  index: number;
  type: Type;
}

export interface Struct {
  name: string;
  fields: Field[];
}

export interface EnumValue {
  name: string;
  index: number;
}

export interface Enum {
  name: string;
  values: EnumValue[];
}

export interface Schema {
  structs: Struct[];
  enums: Enum[];
}

const PRIMITIVE_TYPES: Set<string> = new Set([
  'Void',
  'Bool',
  'Int8',
  'Int16',
  'Int32',
  'Int64',
  'UInt8',
  'UInt16',
  'UInt32',
  'UInt64',
  'Float32',
  'Float64',
  'Text',
  'Data',
]);

function isPrimitive(type: string): type is PrimitiveType {
  return PRIMITIVE_TYPES.has(type);
}

/**
 * 解析 Cap'n Proto schema
 *
 * 支持的语法：
 * - Struct 定义
 * - Enum 定义
 * - 基础类型字段
 * - List 类型
 * - 嵌套 struct 引用
 *
 * 不支持的语法（会忽略或报错）：
 * - Union
 * - Group
 * - Interface
 * - Const
 * - Annotation
 * - 默认值
 */
export function parseSchemaV2(source: string): Schema {
  const structs: Struct[] = [];
  const enums: Enum[] = [];

  // 移除注释
  const cleanSource = source
    .replace(/#.*$/gm, '') // 行注释
    .replace(/\/\*[\s\S]*?\*\//g, ''); // 块注释

  // 解析 struct
  const structRegex = /struct\s+(\w+)\s*\{([^}]*)\}/g;
  let match;
  while ((match = structRegex.exec(cleanSource)) !== null) {
    const name = match[1];
    const body = match[2];
    const fields = parseFields(body);
    structs.push({ name, fields });
  }

  // 解析 enum
  const enumRegex = /enum\s+(\w+)\s*\{([^}]*)\}/g;
  while ((match = enumRegex.exec(cleanSource)) !== null) {
    const name = match[1];
    const body = match[2];
    const values = parseEnumValues(body);
    enums.push({ name, values });
  }

  return { structs, enums };
}

function parseFields(body: string): Field[] {
  const fields: Field[] = [];

  // 字段格式: name @index :Type;
  const fieldRegex = /(\w+)\s*@(\d+)\s*:\s*([^;]+);/g;
  let match;

  while ((match = fieldRegex.exec(body)) !== null) {
    const name = match[1];
    const index = Number.parseInt(match[2]);
    const typeStr = match[3].trim();
    const type = parseType(typeStr);

    fields.push({ name, index, type });
  }

  return fields.sort((a, b) => a.index - b.index);
}

function parseType(typeStr: string): Type {
  // 检查 List 类型
  const listMatch = typeStr.match(/^List\((.+)\)$/);
  if (listMatch) {
    const elementType = parseType(listMatch[1].trim());
    return { kind: 'list', elementType };
  }

  // 检查基础类型
  if (isPrimitive(typeStr)) {
    return typeStr;
  }

  // 假设是 struct 类型
  return { kind: 'struct', name: typeStr };
}

function parseEnumValues(body: string): EnumValue[] {
  const values: EnumValue[] = [];

  // 格式: name @index;
  const valueRegex = /(\w+)\s*@(\d+)\s*;/g;
  let match;

  while ((match = valueRegex.exec(body)) !== null) {
    const name = match[1];
    const index = Number.parseInt(match[2]);
    values.push({ name, index });
  }

  return values.sort((a, b) => a.index - b.index);
}
