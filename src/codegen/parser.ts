/**
 * Cap'n Proto Schema 解析器
 * 从 .capnp 文件解析 schema 信息
 */

export interface Field {
  name: string;
  index: number;
  type: string;
  offset: number;
  isPointer: boolean;
  defaultValue?: string | number | bigint | boolean;
}

export interface StructDef {
  name: string;
  id: bigint;
  dataWords: number;
  pointerCount: number;
  fields: Field[];
  isGroup?: boolean;
}

export interface UnionDef {
  name: string;
  tagOffset: number;
  variants: { tag: number; name: string; struct: StructDef }[];
}

export interface EnumDef {
  name: string;
  values: { name: string; value: number }[];
}

export interface Schema {
  structs: StructDef[];
  enums: EnumDef[];
  imports: string[];
}

/**
 * 简单的 schema 解析器（基于正则）
 * 注意：这只是临时方案，完整的应该用官方 parser
 */
export function parseSchema(source: string): Schema {
  const structs: StructDef[] = [];
  const enums: EnumDef[] = [];

  // 解析 enum
  const enumRegex = /enum\s+(\w+)\s*\{([^}]+)\}/g;
  let enumMatch;
  while ((enumMatch = enumRegex.exec(source)) !== null) {
    const name = enumMatch[1];
    const body = enumMatch[2];
    const values: { name: string; value: number }[] = [];

    const valueRegex = /(\w+)\s*@(\d+)/g;
    let valueMatch;
    while ((valueMatch = valueRegex.exec(body)) !== null) {
      values.push({ name: valueMatch[1], value: parseInt(valueMatch[2]) });
    }

    enums.push({ name, values });
  }

  // 解析 struct（简化版，不处理嵌套）
  const structRegex = /struct\s+(\w+)\s*\{([^}]+)\}/g;
  let structMatch;
  while ((structMatch = structRegex.exec(source)) !== null) {
    const name = structMatch[1];
    const body = structMatch[2];

    // 简化：计算字段偏移
    const fields: Field[] = [];
    let dataOffset = 0;
    let pointerIndex = 0;

    const fieldRegex = /(\w+)\s+@(\d+)\s*:\s*(\w+);/g;
    let fieldMatch;
    while ((fieldMatch = fieldRegex.exec(body)) !== null) {
      const fieldName = fieldMatch[1];
      const index = parseInt(fieldMatch[2]);
      const type = fieldMatch[3];

      const isPointer = ['Text', 'Data', 'List'].includes(type) || type.includes('(');

      fields.push({
        name: fieldName,
        index,
        type,
        offset: isPointer ? pointerIndex++ : dataOffset,
        isPointer,
      });

      if (!isPointer) {
        dataOffset += getTypeSize(type);
      }
    }

    structs.push({
      name,
      id: BigInt(0),
      dataWords: Math.ceil(dataOffset / 8),
      pointerCount: pointerIndex,
      fields,
    });
  }

  return { structs, enums, imports: [] };
}

function getTypeSize(type: string): number {
  switch (type) {
    case 'Bool': return 1;
    case 'Int8':
    case 'UInt8': return 1;
    case 'Int16':
    case 'UInt16': return 2;
    case 'Int32':
    case 'UInt32':
    case 'Float32': return 4;
    case 'Int64':
    case 'UInt64':
    case 'Float64': return 8;
    default: return 8;
  }
}
