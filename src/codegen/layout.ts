/**
 * Cap'n Proto 字段布局算法
 * 实现与官方编译器一致的字段布局算法
 * 
 * 参考：https://capnproto.org/encoding.html
 */

import type {
  StructDeclaration,
  Field,
  Union,
  Group,
  Type
} from './parser-v2.js';

// 字段大小（位）
const TYPE_SIZES: Record<string, number> = {
  void: 0,
  bool: 1,
  int8: 8,
  int16: 16,
  int32: 32,
  int64: 64,
  uint8: 8,
  uint16: 16,
  uint32: 32,
  uint64: 64,
  float32: 32,
  float64: 64,
  text: -1,    // pointer
  data: -1,    // pointer
  list: -1,    // pointer
  struct: -1,  // pointer
  enum: 16,    // stored as UInt16
  anyPointer: -1,
  capability: -1,
};

// 字段对齐（位）
const TYPE_ALIGNMENTS: Record<string, number> = {
  void: 1,
  bool: 1,
  int8: 8,
  int16: 16,
  int32: 32,
  int64: 64,
  uint8: 8,
  uint16: 16,
  uint32: 32,
  uint64: 64,
  float32: 32,
  float64: 64,
  text: 64,
  data: 64,
  list: 64,
  struct: 64,
  enum: 16,
  anyPointer: 64,
  capability: 64,
};

// 布局后的字段信息
export interface LayoutField extends Field {
  byteOffset: number;    // 字节偏移
  bitOffset?: number;    // 位偏移（仅用于 bool）
  pointerIndex?: number; // 指针索引（仅用于指针类型）
  discriminantValue?: number; // Union discriminant 值
}

// Union 布局信息
export interface LayoutUnion {
  name?: string;
  tagOffset: number;     // discriminant 的字节偏移
  tagSize: number;       // 16 bits
  fields: LayoutField[];
}

// Group 布局信息
export interface LayoutGroup {
  name: string;
  dataOffset: number;    // 数据部分偏移
  pointerOffset: number; // 指针部分偏移
  fields: LayoutField[];
  unions: LayoutUnion[];
}

// 结构体布局结果
export interface StructLayout {
  name: string;
  id?: bigint;
  dataWords: number;     // 数据部分字数（64-bit words）
  pointerCount: number;  // 指针数量
  fields: LayoutField[];
  unions: LayoutUnion[];
  groups: LayoutGroup[];
  discriminantCount: number; // 用于分配 discriminant 值
}

// 布局上下文
interface LayoutContext {
  dataBits: number;      // 当前数据位偏移
  pointerIndex: number;  // 当前指针索引
  discriminantOffset: number; // 下一个 discriminant 的字节偏移
  discriminantCount: number;  // 已分配的 discriminant 数量
  usedDataBits: Set<number>;  // 已使用的数据位
}

/**
 * 判断类型是否为指针类型
 */
function isPointerType(type: Type): boolean {
  switch (type.kind) {
    case 'text':
    case 'data':
    case 'list':
    case 'struct':
    case 'anyPointer':
    case 'capability':
      return true;
    case 'optional':
      // Optional 类型在 Cap'n Proto 中通常通过指针实现
      // 或者对于原始类型使用特殊标记
      return isPointerType(type.inner);
    default:
      return false;
  }
}

/**
 * 获取类型大小（位），指针类型返回 -1
 */
function getTypeSize(type: Type): number {
  if (type.kind === 'optional') {
    return getTypeSize(type.inner);
  }
  return TYPE_SIZES[type.kind] ?? 64;
}

/**
 * 获取类型对齐（位）
 */
function getTypeAlignment(type: Type): number {
  if (type.kind === 'optional') {
    return getTypeAlignment(type.inner);
  }
  return TYPE_ALIGNMENTS[type.kind] ?? 64;
}

/**
 * 对齐到指定边界
 */
function alignUp(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}

/**
 * 查找可以容纳指定大小的空闲位范围
 */
function findFreeBits(usedBits: Set<number>, size: number, alignment: number): number {
  // 从 0 开始搜索，按对齐要求递增
  let offset = 0;
  
  while (true) {
    // 对齐到指定边界
    offset = alignUp(offset, alignment);
    
    // 检查从 offset 开始的 size 个位是否都空闲
    let free = true;
    for (let i = 0; i < size; i++) {
      if (usedBits.has(offset + i)) {
        free = false;
        break;
      }
    }
    
    if (free) {
      return offset;
    }
    
    // 移动到下一个可能的位置
    offset += alignment;
  }
}

/**
 * 标记位范围为已使用
 */
function markBitsUsed(usedBits: Set<number>, start: number, size: number): void {
  for (let i = 0; i < size; i++) {
    usedBits.add(start + i);
  }
}

/**
 * 计算字段布局
 * 
 * 算法原则：
 * 1. 每个字段的位置只取决于它自己的定义和编号更小的字段
 * 2. 后续字段可以填充到前面字段留下的 padding 中
 * 3. 最多 63 位的 padding
 */
function layoutField(
  field: Field,
  ctx: LayoutContext
): LayoutField {
  const size = getTypeSize(field.type);
  const alignment = getTypeAlignment(field.type);
  const isPointer = isPointerType(field.type);

  if (isPointer) {
    // 指针类型
    const pointerIndex = ctx.pointerIndex++;
    return {
      ...field,
      byteOffset: 0, // 指针字段不使用 byteOffset
      pointerIndex,
    };
  }

  // 非指针类型（数据字段）
  if (size === 0) {
    // Void 类型不占空间
    return {
      ...field,
      byteOffset: 0,
    };
  }

  // 查找空闲位
  const bitOffset = findFreeBits(ctx.usedDataBits, size, alignment);
  markBitsUsed(ctx.usedDataBits, bitOffset, size);

  // 更新数据位计数
  ctx.dataBits = Math.max(ctx.dataBits, bitOffset + size);

  return {
    ...field,
    byteOffset: Math.floor(bitOffset / 8),
    bitOffset: bitOffset % 8,
  };
}

/**
 * 计算 Union 布局
 * 
 * Union 的 discriminant 存储在数据段中，占用 16 位（2 字节）
 * Union 的字段共享存储空间
 */
function layoutUnion(
  union: Union,
  ctx: LayoutContext
): LayoutUnion {
  // 分配 discriminant 位置
  const tagAlignment = 16; // 16-bit alignment
  const tagOffset = findFreeBits(ctx.usedDataBits, 16, tagAlignment);
  markBitsUsed(ctx.usedDataBits, tagOffset, 16);
  ctx.dataBits = Math.max(ctx.dataBits, tagOffset + 16);

  // 创建临时上下文来布局 Union 字段
  // Union 字段共享空间，所以每个字段都从 0 开始布局
  const unionFields: LayoutField[] = [];
  
  for (let i = 0; i < union.fields.length; i++) {
    const field = union.fields[i];
    const fieldCtx: LayoutContext = {
      dataBits: 0,
      pointerIndex: 0,
      discriminantOffset: 0,
      discriminantCount: 0,
      usedDataBits: new Set(),
    };

    const layoutField_ = layoutField(field, fieldCtx);
    
    // 合并 Union 字段的位使用信息到主上下文
    for (const bit of fieldCtx.usedDataBits) {
      ctx.usedDataBits.add(bit);
    }
    ctx.dataBits = Math.max(ctx.dataBits, fieldCtx.dataBits);
    ctx.pointerIndex = Math.max(ctx.pointerIndex, fieldCtx.pointerIndex);

    unionFields.push({
      ...layoutField_,
      discriminantValue: i,
    });
  }

  return {
    name: union.name,
    tagOffset: Math.floor(tagOffset / 8),
    tagSize: 2,
    fields: unionFields,
  };
}

/**
 * 计算 Group 布局
 * 
 * Group 不是独立的类型，而是字段的集合
 * Group 的字段直接嵌入到父结构体中
 */
function layoutGroup(
  group: Group,
  ctx: LayoutContext
): LayoutGroup {
  // 保存当前状态
  const savedDataBits = ctx.dataBits;
  const savedPointerIndex = ctx.pointerIndex;
  const savedDiscriminantOffset = ctx.discriminantOffset;
  const savedDiscriminantCount = ctx.discriminantCount;
  const savedUsedBits = new Set(ctx.usedDataBits);

  // 布局 Group 的字段
  const fields: LayoutField[] = [];
  for (const field of group.fields) {
    fields.push(layoutField(field, ctx));
  }

  // 布局 Group 的 Unions
  const unions: LayoutUnion[] = [];
  for (const union of group.unions) {
    unions.push(layoutUnion(union, ctx));
  }

  return {
    name: group.name,
    dataOffset: Math.floor(savedDataBits / 8),
    pointerOffset: savedPointerIndex,
    fields,
    unions,
  };
}

/**
 * 计算结构体布局
 * 
 * 这是主要的布局函数，计算 dataWords 和 pointerCount
 */
export function computeStructLayout(struct: StructDeclaration): StructLayout {
  const ctx: LayoutContext = {
    dataBits: 0,
    pointerIndex: 0,
    discriminantOffset: 0,
    discriminantCount: 0,
    usedDataBits: new Set(),
  };

  // 布局普通字段
  const fields: LayoutField[] = [];
  for (const field of struct.fields) {
    fields.push(layoutField(field, ctx));
  }

  // 布局 Unions
  const unions: LayoutUnion[] = [];
  for (const union of struct.unions) {
    unions.push(layoutUnion(union, ctx));
  }

  // 布局 Groups
  const groups: LayoutGroup[] = [];
  for (const group of struct.groups) {
    groups.push(layoutGroup(group, ctx));
  }

  // 计算最终结果
  const dataWords = Math.ceil(ctx.dataBits / 64);
  const pointerCount = ctx.pointerIndex;

  return {
    name: struct.name,
    id: struct.id,
    dataWords,
    pointerCount,
    fields,
    unions,
    groups,
    discriminantCount: ctx.discriminantCount,
  };
}

/**
 * 计算多个结构体的布局
 */
export function computeLayouts(structs: StructDeclaration[]): Map<string, StructLayout> {
  const layouts = new Map<string, StructLayout>();
  
  for (const struct of structs) {
    layouts.set(struct.name, computeStructLayout(struct));
  }
  
  return layouts;
}

/**
 * 获取类型的字符串表示（用于调试）
 */
export function typeToString(type: Type): string {
  switch (type.kind) {
    case 'void': return 'Void';
    case 'bool': return 'Bool';
    case 'int8': return 'Int8';
    case 'int16': return 'Int16';
    case 'int32': return 'Int32';
    case 'int64': return 'Int64';
    case 'uint8': return 'UInt8';
    case 'uint16': return 'UInt16';
    case 'uint32': return 'UInt32';
    case 'uint64': return 'UInt64';
    case 'float32': return 'Float32';
    case 'float64': return 'Float64';
    case 'text': return 'Text';
    case 'data': return 'Data';
    case 'list': return `List(${typeToString(type.elementType)})`;
    case 'struct': return type.name;
    case 'enum': return type.name;
    case 'anyPointer': return 'AnyPointer';
    case 'capability': return 'Capability';
    case 'optional': return `Optional(${typeToString(type.inner)})`;
    default: return 'Unknown';
  }
}

/**
 * 打印布局信息（用于调试）
 */
export function printLayout(layout: StructLayout): string {
  const lines: string[] = [];
  lines.push(`struct ${layout.name} {`);
  lines.push(`  # dataWords: ${layout.dataWords}, pointerCount: ${layout.pointerCount}`);
  lines.push('');

  // 普通字段
  for (const field of layout.fields) {
    const typeStr = typeToString(field.type);
    if (field.pointerIndex !== undefined) {
      lines.push(`  ${field.name} @${field.index} :${typeStr};  # pointer[${field.pointerIndex}]`);
    } else if (field.bitOffset !== undefined) {
      lines.push(`  ${field.name} @${field.index} :${typeStr};  # byte ${field.byteOffset}, bit ${field.bitOffset}`);
    } else {
      lines.push(`  ${field.name} @${field.index} :${typeStr};  # byte ${field.byteOffset}`);
    }
  }

  // Unions
  for (const union of layout.unions) {
    lines.push('');
    const name = union.name || '(anonymous)';
    lines.push(`  union ${name} {`);
    lines.push(`    # discriminant at byte ${union.tagOffset}`);
    for (const field of union.fields) {
      const typeStr = typeToString(field.type);
      const disc = field.discriminantValue;
      if (field.pointerIndex !== undefined) {
        lines.push(`    ${field.name} @${field.index} :${typeStr};  # discriminant ${disc}, pointer[${field.pointerIndex}]`);
      } else if (field.bitOffset !== undefined) {
        lines.push(`    ${field.name} @${field.index} :${typeStr};  # discriminant ${disc}, byte ${field.byteOffset}, bit ${field.bitOffset}`);
      } else {
        lines.push(`    ${field.name} @${field.index} :${typeStr};  # discriminant ${disc}, byte ${field.byteOffset}`);
      }
    }
    lines.push('  }');
  }

  // Groups
  for (const group of layout.groups) {
    lines.push('');
    lines.push(`  group ${group.name} {`);
    lines.push(`    # data offset: ${group.dataOffset}, pointer offset: ${group.pointerOffset}`);
    for (const field of group.fields) {
      const typeStr = typeToString(field.type);
      if (field.pointerIndex !== undefined) {
        lines.push(`    ${field.name} @${field.index} :${typeStr};  # pointer[${field.pointerIndex}]`);
      } else if (field.bitOffset !== undefined) {
        lines.push(`    ${field.name} @${field.index} :${typeStr};  # byte ${field.byteOffset}, bit ${field.bitOffset}`);
      } else {
        lines.push(`    ${field.name} @${field.index} :${typeStr};  # byte ${field.byteOffset}`);
      }
    }
    lines.push('  }');
  }

  lines.push('}');
  return lines.join('\n');
}
