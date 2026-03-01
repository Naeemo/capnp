/**
 * Cap'n Proto 编译后 Schema 的 TypeScript Reader
 * 基于官方 schema.capnp 手动编写
 *
 * 这是自举的基础：我们需要先能读取 schema 才能生成 schema 的代码
 *
 * 结构信息来自: capnp compile -ocapnp schema.capnp
 */

import { MessageReader, StructReader } from '../core/index.js';
import { ElementSize } from '../core/pointer.js';

// ============================================================================
// 基础类型
// ============================================================================

/** UInt64 作为 bigint */
export type Id = bigint;

// ============================================================================
// Node
// ============================================================================

export class NodeReader {
  constructor(private reader: StructReader) {}

  get id(): Id {
    return this.reader.getUint64(0);
  }

  get displayName(): string {
    return this.reader.getText(0);
  }

  get displayNamePrefixLength(): number {
    return this.reader.getUint32(8);
  }

  get scopeId(): Id {
    return this.reader.getUint64(16);
  }

  /** union tag 在 bits [96, 112) = bytes [12, 14) */
  private get unionTag(): number {
    return this.reader.getUint16(12);
  }

  get isFile(): boolean {
    return this.unionTag === 0;
  }

  get isStruct(): boolean {
    return this.unionTag === 1;
  }

  get isEnum(): boolean {
    return this.unionTag === 2;
  }

  get isInterface(): boolean {
    return this.unionTag === 3;
  }

  get isConst(): boolean {
    return this.unionTag === 4;
  }

  get isAnnotation(): boolean {
    return this.unionTag === 5;
  }

  // --- Struct 相关字段 (union tag = 1) ---
  // struct group 从 bit 112 = byte 14 开始

  get structDataWordCount(): number {
    return this.reader.getUint16(14);
  }

  get structPointerCount(): number {
    return this.reader.getUint16(24);
  }

  get structPreferredListEncoding(): number {
    return this.reader.getUint16(26);
  }

  get structIsGroup(): boolean {
    // isGroup @10 :Bool; 在 bit 224 = byte 28
    return this.reader.getBool(224);
  }

  get structDiscriminantCount(): number {
    return this.reader.getUint16(30);
  }

  get structDiscriminantOffset(): number {
    return this.reader.getUint32(32);
  }

  get structFields(): FieldReader[] {
    // fields @13 :List(Field); 是 ptr[3]
    // Field: 24 bytes = 3 words data, 4 pointers
    const listReader = this.reader.getList(3, ElementSize.INLINE_COMPOSITE, { dataWords: 3, pointerCount: 4 });
    if (!listReader) return [];

    const fields: FieldReader[] = [];
    for (let i = 0; i < listReader.length; i++) {
      const itemReader = listReader.getStruct(i);
      const field = new FieldReader(itemReader);
      // Stop if we encounter a field with empty name (likely past the actual fields)
      if (!field.name && i > 0) break;
      fields.push(field);
    }
    return fields;
  }

  // --- Enum 相关字段 (union tag = 2) ---

  get enumEnumerants(): EnumerantReader[] {
    // enumerants @14 :List(Enumerant); 在 enum group 内，ptr[3]
    const listReader = this.reader.getList(3, ElementSize.INLINE_COMPOSITE, { dataWords: 1, pointerCount: 2 });
    if (!listReader) return [];

    const enumerants: EnumerantReader[] = [];
    for (let i = 0; i < Math.min(listReader.length, 10); i++) {
      try {
        const itemReader = listReader.getStruct(i);
        const enumerant = new EnumerantReader(itemReader);
        // Stop if we encounter an enumerant with empty name
        if (!enumerant.name) break;
        enumerants.push(enumerant);
      } catch (e) {
        // Stop on any error (likely past the actual enumerants)
        break;
      }
    }
    return enumerants;
  }

  // --- NestedNodes ---

  get nestedNodes(): NestedNodeReader[] {
    // nestedNodes @4 :List(NestedNode); 是 ptr[1]
    const listReader = this.reader.getList(1, ElementSize.INLINE_COMPOSITE, { dataWords: 1, pointerCount: 1 });
    if (!listReader) return [];

    const nodes: NestedNodeReader[] = [];
    for (let i = 0; i < listReader.length; i++) {
      const itemReader = listReader.getStruct(i);
      nodes.push(new NestedNodeReader(itemReader));
    }
    return nodes;
  }
}

// ============================================================================
// Field
// ============================================================================

export class FieldReader {
  constructor(private reader: StructReader) {}

  get name(): string {
    return this.reader.getText(0);
  }

  get codeOrder(): number {
    return this.reader.getUint16(0);
  }

  get discriminantValue(): number {
    return this.reader.getUint16(2);
  }

  /** union tag 在 bits [64, 80) = bytes [8, 10) */
  private get unionTag(): number {
    return this.reader.getUint16(8);
  }

  get isSlot(): boolean {
    return this.unionTag === 0;
  }

  get isGroup(): boolean {
    return this.unionTag === 1;
  }

  // --- Slot 相关 ---

  get slotOffset(): number {
    return this.reader.getUint32(4);
  }

  get slotType(): TypeReader | null {
    // type @5 :Type; 是 ptr[2]
    const typeReader = this.reader.getStruct(2, 3, 1); // Type: 24 bytes = 3 words, 1 pointer
    return typeReader ? new TypeReader(typeReader) : null;
  }

  // --- Group 相关 ---

  get groupTypeId(): Id {
    // typeId @7 :UInt64; 在 group group 内，bits [128, 192) = bytes [16, 24)
    return this.reader.getUint64(16);
  }
}

// ============================================================================
// Type
// ============================================================================

export class TypeReader {
  constructor(private reader: StructReader) {}

  get kind(): TypeKind {
    const tag = this.reader.getUint16(0);
    return TYPE_KIND_MAP[tag] ?? 'unknown';
  }

  get isPrimitive(): boolean {
    const k = this.kind;
    return k !== 'list' && k !== 'enum' && k !== 'struct' && k !== 'interface' && k !== 'anyPointer';
  }

  // --- List ---

  get listElementType(): TypeReader | null {
    if (this.kind !== 'list') return null;
    // elementType @14 :Type; 是 ptr[0]
    const elementReader = this.reader.getStruct(0, 3, 1);
    return elementReader ? new TypeReader(elementReader) : null;
  }

  // --- Enum/Struct/Interface ---

  get typeId(): Id | null {
    const k = this.kind;
    if (k === 'enum' || k === 'struct' || k === 'interface') {
      // typeId 在 bits [64, 128) = bytes [8, 16)
      return this.reader.getUint64(8);
    }
    return null;
  }
}

export type TypeKind =
  | 'void' | 'bool'
  | 'int8' | 'int16' | 'int32' | 'int64'
  | 'uint8' | 'uint16' | 'uint32' | 'uint64'
  | 'float32' | 'float64'
  | 'text' | 'data'
  | 'list' | 'enum' | 'struct' | 'interface' | 'anyPointer'
  | 'unknown';

const TYPE_KIND_MAP: Record<number, TypeKind> = {
  0: 'void',
  1: 'bool',
  2: 'int8',
  3: 'int16',
  4: 'int32',
  5: 'int64',
  6: 'uint8',
  7: 'uint16',
  8: 'uint32',
  9: 'uint64',
  10: 'float32',
  11: 'float64',
  12: 'text',
  13: 'data',
  14: 'list',
  15: 'enum',
  16: 'struct',
  17: 'interface',
  18: 'anyPointer',
};

// ============================================================================
// Enumerant
// ============================================================================

export class EnumerantReader {
  constructor(private reader: StructReader) {}

  get name(): string {
    return this.reader.getText(0);
  }

  get codeOrder(): number {
    return this.reader.getUint16(0);
  }
}

// ============================================================================
// NestedNode
// ============================================================================

export class NestedNodeReader {
  constructor(private reader: StructReader) {}

  get name(): string {
    return this.reader.getText(0);
  }

  get id(): Id {
    return this.reader.getUint64(0);
  }
}

// ============================================================================
// CodeGeneratorRequest
// ============================================================================

export class CodeGeneratorRequestReader {
  constructor(private message: MessageReader) {}

  static fromBuffer(buffer: ArrayBuffer): CodeGeneratorRequestReader {
    const message = new MessageReader(buffer);
    return new CodeGeneratorRequestReader(message);
  }

  get nodes(): NodeReader[] {
    // CodeGeneratorRequest: 0 data words, 4 pointers
    const root = this.message.getRoot(0, 4);
    // nodes @0 :List(Node);
    const listReader = root.getList(0, ElementSize.INLINE_COMPOSITE, { dataWords: 6, pointerCount: 6 });
    if (!listReader) return [];

    const nodes: NodeReader[] = [];
    for (let i = 0; i < listReader.length; i++) {
      const nodeReader = listReader.getStruct(i);
      nodes.push(new NodeReader(nodeReader));
    }
    return nodes;
  }

  get requestedFiles(): RequestedFileReader[] {
    const root = this.message.getRoot(0, 4);
    // requestedFiles @1 :List(RequestedFile);
    const listReader = root.getList(1, ElementSize.INLINE_COMPOSITE, { dataWords: 1, pointerCount: 2 });
    if (!listReader) return [];

    const files: RequestedFileReader[] = [];
    for (let i = 0; i < listReader.length; i++) {
      try {
        const fileReader = listReader.getStruct(i);
        const file = new RequestedFileReader(fileReader);
        // Stop if we encounter a file with empty filename
        if (!file.filename && files.length > 0) break;
        files.push(file);
      } catch (e) {
        // Stop on any error (likely past the actual files)
        break;
      }
    }
    return files;
  }
}

// ============================================================================
// RequestedFile
// ============================================================================

export class RequestedFileReader {
  constructor(private reader: StructReader) {}

  get id(): Id {
    return this.reader.getUint64(0);
  }

  get filename(): string {
    return this.reader.getText(0);
  }
}
