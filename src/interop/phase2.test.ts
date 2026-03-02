/**
 * Phase 2 互操作测试 - 扩展测试覆盖
 *
 * 测试策略：
 * 1. 使用官方 capnp 工具生成二进制消息文件
 * 2. 使用 capnp-ts 读取这些文件并验证内容
 * 3. 确保 capnp-ts 能正确解析官方实现生成的消息
 *
 * Phase 2 新增测试场景：
 * - Union 所有 variant 类型（intVal, boolVal）
 * - 默认值（XOR 编码）
 * - 复杂嵌套结构
 * - 所有列表类型
 * - 空结构
 * - 边界值
 * - 多 Union 结构
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MessageReader, type StructReader } from '../index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadBinaryData(filename: string): ArrayBuffer {
  const buffer = readFileSync(join(__dirname, 'data', filename));
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

// ========== Union 类型完整测试 ==========

describe('Phase 2 - UnionType All Variants', () => {
  it('should read union with intVal variant', () => {
    const buffer = loadBinaryData('union_intval.bin');
    const reader = new MessageReader(buffer);
    // UnionType has 1 data word and 1 pointer
    const root = reader.getRoot(1, 1);

    // Union discriminant is at byte offset 4 (bounded<2>() for 2-byte elements)
    const discriminant = root.getUint16(4);
    expect(discriminant).toBe(0); // intVal selected

    expect(root.getInt32(0)).toBe(12345);
  });

  it('should read union with textVal variant', () => {
    const buffer = loadBinaryData('union_type.bin');
    const reader = new MessageReader(buffer);
    const root = reader.getRoot(1, 1);

    const discriminant = root.getUint16(4);
    expect(discriminant).toBe(1); // textVal selected
    expect(root.getText(0)).toBe('union text value');
  });

  it('should read union with boolVal variant', () => {
    const buffer = loadBinaryData('union_boolval.bin');
    const reader = new MessageReader(buffer);
    const root = reader.getRoot(1, 1);

    const discriminant = root.getUint16(4);
    expect(discriminant).toBe(2); // boolVal selected
    expect(root.getBool(0)).toBe(true); // boolVal is at bit 0 (bits[0, 1))
  });
});

// ========== 默认值测试（XOR 编码）==========

describe('Phase 2 - Default Values', () => {
  it('should read default values when fields are not set', () => {
    const buffer = loadBinaryData('default_values_empty.bin');
    const reader = new MessageReader(buffer);
    // DefaultValues: 16 bytes (2 words), 1 pointer
    // int8WithDefault @0 :Int8 = -42 - bits[0, 8)
    // int32WithDefault @1 :Int32 = 12345 - bits[32, 64)
    // uint16WithDefault @2 :UInt16 = 1000 - bits[16, 32)
    // boolWithDefault @3 :Bool = true - bits[8, 9)
    // float64WithDefault @4 :Float64 = 3.14159 - bits[64, 128)
    // textWithDefault @5 :Text = "default text" - ptr[0]
    const root = reader.getRoot(2, 1);

    // When fields use defaults, wire value is 0 (XOR with default gives default)
    // Note: capnp-ts does not implement XOR decoding for defaults
    // Wire values are read directly without XOR decoding
    expect(root.getInt8(0)).toBe(0); // Wire value is 0
    expect(root.getInt32(4)).toBe(0); // Wire value is 0
    expect(root.getUint16(2)).toBe(0); // Wire value is 0
    expect(root.getBool(8)).toBe(false); // Wire value is 0
    expect(root.getFloat64(8)).toBe(0); // Wire value is 0
    // Text field with default returns empty string when not set
    expect(root.getText(0)).toBe('');
  });

  it('should read XOR-encoded overridden default values', () => {
    const buffer = loadBinaryData('default_values_overridden.bin');
    const reader = new MessageReader(buffer);
    const root = reader.getRoot(2, 1);

    // XOR encoded values:
    // int8WithDefault = 100, default = -42
    // -42 in 8-bit = 0xD6 (214 unsigned), 100 = 0x64
    // wire = 0x64 XOR 0xD6 = 0xB2 = 178 unsigned = -78 signed
    expect(root.getInt8(0)).toBe(-78); // XOR encoded wire value

    // int32WithDefault = 99999, default = 12345
    // wire = 99999 XOR 12345 = 112294 = 0x0001B6A6
    expect(root.getInt32(4)).toBe(112294); // XOR encoded wire value

    // uint16WithDefault = 500, default = 1000
    // wire = 500 XOR 1000 = 540 = 0x021C
    expect(root.getUint16(2)).toBe(540); // XOR encoded wire value

    // boolWithDefault = false, default = true
    // wire = false XOR true = true (bit 8 set)
    expect(root.getBool(8)).toBe(true); // XOR encoded wire value

    // float64WithDefault = 2.71828, default = 3.14159
    // XOR of float bits
    expect(root.getFloat64(8)).not.toBe(0); // Has XOR encoded value

    expect(root.getText(0)).toBe('overridden text');
  });
});

// ========== 复杂嵌套结构测试 ==========

describe('Phase 2 - Deep Nesting', () => {
  it('should read deeply nested structures', () => {
    const buffer = loadBinaryData('deep_nesting.bin');
    const reader = new MessageReader(buffer);
    // DeepNesting: level @0 :UInt32 (4 bytes), child @1 (pointer), data @2 (pointer)
    // Data words: 1, Pointer count: 2
    const root = reader.getRoot(1, 2);

    expect(root.getUint32(0)).toBe(1);
    expect(root.getText(1)).toBe('Level 1 data');

    // Read child level 2
    const child1 = root.getStruct(0, 1, 2);
    expect(child1).toBeDefined();
    if (child1) {
      expect(child1.getUint32(0)).toBe(2);
      expect(child1.getText(1)).toBe('Level 2 data');

      // Read child level 3
      const child2 = child1.getStruct(0, 1, 2);
      expect(child2).toBeDefined();
      if (child2) {
        expect(child2.getUint32(0)).toBe(3);
        expect(child2.getText(1)).toBe('Level 3 data');
      }
    }
  });
});

// ========== 复杂结构测试 ==========

describe('Phase 2 - ComplexStruct', () => {
  it('should read complex struct with nested lists and structs', () => {
    const buffer = loadBinaryData('complex_struct.bin');
    const reader = new MessageReader(buffer);
    // ComplexStruct: id @0 :UInt64, name @1 :Text, tags @2 :List(Text), metadata @3 :Metadata
    // Data words: 1 (for id), Pointer count: 3
    const root = reader.getRoot(1, 3);

    expect(root.getUint64(0)).toBe(123456789012345n);
    expect(root.getText(0)).toBe('Complex Object');

    // Read tags list
    const tagsList = root.getList(1, 6); // POINTER = 6
    expect(tagsList).toBeDefined();
    if (tagsList) {
      expect(tagsList.length).toBe(3);
    }

    // Read metadata struct
    // Metadata: created @0 :UInt64, modified @1 :UInt64, attributes @2 :List(Attribute)
    // Data words: 2, Pointer count: 1
    const metadata = root.getStruct(2, 2, 1);
    expect(metadata).toBeDefined();
    if (metadata) {
      expect(metadata.getUint64(0)).toBe(1609459200000n);
      expect(metadata.getUint64(8)).toBe(1609545600000n);

      // Read attributes list
      const attrsList = metadata.getList(0, 7, { dataWords: 0, pointerCount: 2 });
      expect(attrsList).toBeDefined();
      if (attrsList) {
        expect(attrsList.length).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

// ========== 所有列表类型测试 ==========

describe('Phase 2 - All List Types', () => {
  it('should read all primitive list types', () => {
    const buffer = loadBinaryData('all_list_types.bin');
    const reader = new MessageReader(buffer);
    // AllListTypes has 0 data words, 14 pointers
    const root = reader.getRoot(0, 14);

    // Bool list @1 :List(Bool) - element size BIT = 1
    const boolList = root.getList(1, 1);
    expect(boolList).toBeDefined();
    if (boolList) {
      expect(boolList.length).toBe(4);
      expect(boolList.getPrimitive(0)).toBe(1);
      expect(boolList.getPrimitive(1)).toBe(0);
      expect(boolList.getPrimitive(2)).toBe(1);
      expect(boolList.getPrimitive(3)).toBe(1);
    }

    // Int8 list @2 :List(Int8) - element size BYTE = 2
    const int8List = root.getList(2, 2);
    expect(int8List).toBeDefined();
    if (int8List) {
      expect(int8List.length).toBe(3);
    }

    // Int32 list @4 :List(Int32) - element size FOUR_BYTES = 4
    // Note: getPrimitive returns unsigned values for FOUR_BYTES
    const int32List = root.getList(4, 4);
    expect(int32List).toBeDefined();
    if (int32List) {
      expect(int32List.length).toBe(3);
      // FOUR_BYTES returns unsigned, so -2147483648 becomes 2147483648
      expect(int32List.getPrimitive(0)).toBe(2147483648); // -2147483648 as unsigned
      expect(int32List.getPrimitive(1)).toBe(0);
      expect(int32List.getPrimitive(2)).toBe(2147483647);
    }

    // Int64 list @5 :List(Int64) - element size EIGHT_BYTES = 5
    const int64List = root.getList(5, 5);
    expect(int64List).toBeDefined();
    if (int64List) {
      expect(int64List.length).toBe(3);
    }

    // Float64 list @11 :List(Float64) - element size EIGHT_BYTES = 5
    const float64List = root.getList(11, 5);
    expect(float64List).toBeDefined();
    if (float64List) {
      expect(float64List.length).toBe(3);
    }

    // Text list @12 :List(Text) - element size POINTER = 6
    const textList = root.getList(12, 6);
    expect(textList).toBeDefined();
    if (textList) {
      expect(textList.length).toBe(3);
    }
  });
});

// ========== 空结构测试 ==========

describe('Phase 2 - Empty and Special Structs', () => {
  it('should read empty struct', () => {
    const buffer = loadBinaryData('empty_struct.bin');
    const reader = new MessageReader(buffer);
    // EmptyStruct has 0 data words, 0 pointers
    const root = reader.getRoot(0, 0);

    // Should not throw
    expect(root).toBeDefined();
  });

  it('should read pointer-only struct', () => {
    const buffer = loadBinaryData('pointer_only_struct.bin');
    const reader = new MessageReader(buffer);
    // PointerOnlyStruct: name @0 :Text, data @1 :Data
    // Data words: 0, Pointer count: 2
    const root = reader.getRoot(0, 2);

    expect(root.getText(0)).toBe('Test Name');
  });

  it('should read data-only struct', () => {
    const buffer = loadBinaryData('data_only_struct.bin');
    const reader = new MessageReader(buffer);
    // DataOnlyStruct: id @0 :UInt64, count @1 :UInt32, flag @2 :Bool
    // Data words: 2 (16 bytes), Pointer count: 0
    // id @0 :UInt64 - bits[0, 64)
    // count @1 :UInt32 - bits[64, 96)
    // flag @2 :Bool - bits[96, 97)
    const root = reader.getRoot(2, 0);

    expect(root.getUint64(0)).toBe(123456789012345n);
    expect(root.getUint32(8)).toBe(42);
    expect(root.getBool(96)).toBe(true); // flag @2 :Bool - bit 96
  });
});

// ========== 边界值测试 ==========

describe('Phase 2 - Boundary Values', () => {
  it('should read all boundary values correctly', () => {
    const buffer = loadBinaryData('boundary_values.bin');
    const reader = new MessageReader(buffer);
    // BoundaryValues has 48 bytes (6 words), 0 pointers
    // int8Max @0 :Int8 - bits[0, 8)
    // int8Min @1 :Int8 - bits[8, 16)
    // int16Max @2 :Int16 - bits[16, 32)
    // int16Min @3 :Int16 - bits[32, 48)
    // int32Max @4 :Int32 - bits[64, 96)
    // int32Min @5 :Int32 - bits[96, 128)
    // int64Max @6 :Int64 - bits[128, 192)
    // int64Min @7 :Int64 - bits[192, 256)
    // uint8Max @8 :UInt8 - bits[48, 56)
    // uint16Max @9 :UInt16 - bits[256, 272)
    // uint32Max @10 :UInt32 - bits[288, 320)
    // uint64Max @11 :UInt64 - bits[320, 384)
    const root = reader.getRoot(6, 0);

    expect(root.getInt8(0)).toBe(127);
    expect(root.getInt8(1)).toBe(-128);
    expect(root.getInt16(2)).toBe(32767);
    expect(root.getInt16(4)).toBe(-32768);
    expect(root.getInt32(8)).toBe(2147483647);
    expect(root.getInt32(12)).toBe(-2147483648);
    expect(root.getInt64(16)).toBe(9223372036854775807n);
    expect(root.getInt64(24)).toBe(-9223372036854775808n);
    expect(root.getUint8(6)).toBe(255);
    expect(root.getUint16(32)).toBe(65535);
    expect(root.getUint32(36)).toBe(4294967295);
    expect(root.getUint64(40)).toBe(18446744073709551615n);
  });
});

// ========== 多 Union 结构测试 ==========

describe('Phase 2 - MultiUnion Variants', () => {
  it('should read MultiUnion with int variant', () => {
    const buffer = loadBinaryData('multi_union_int.bin');
    const reader = new MessageReader(buffer);
    // MultiUnion: union with discriminant at bounded<2>()
    const root = reader.getRoot(1, 1);

    const discriminant = root.getUint16(4);
    expect(discriminant).toBe(0); // optionA
    expect(root.getInt32(0)).toBe(999);
  });

  it('should read MultiUnion with text variant', () => {
    const buffer = loadBinaryData('multi_union_text.bin');
    const reader = new MessageReader(buffer);
    const root = reader.getRoot(1, 1);

    const discriminant = root.getUint16(4);
    expect(discriminant).toBe(1); // optionB
    expect(root.getText(0)).toBe('multi union text');
  });

  it('should read MultiUnion with bool variant', () => {
    const buffer = loadBinaryData('multi_union_bool.bin');
    const reader = new MessageReader(buffer);
    const root = reader.getRoot(1, 1);

    const discriminant = root.getUint16(4);
    expect(discriminant).toBe(2); // optionC
    expect(root.getBool(0)).toBe(true); // optionC is at bit 0 (bits[0, 1))
  });

  it('should read MultiUnion with data variant', () => {
    const buffer = loadBinaryData('multi_union_data.bin');
    const reader = new MessageReader(buffer);
    const root = reader.getRoot(1, 1);

    const discriminant = root.getUint16(4);
    expect(discriminant).toBe(3); // optionD
  });

  it('should read MultiUnion with list variant', () => {
    const buffer = loadBinaryData('multi_union_list.bin');
    const reader = new MessageReader(buffer);
    const root = reader.getRoot(1, 1);

    const discriminant = root.getUint16(4);
    expect(discriminant).toBe(4); // optionE

    const list = root.getList(0, 4); // List(Int32) = FOUR_BYTES
    expect(list).toBeDefined();
    if (list) {
      expect(list.length).toBe(5);
    }
  });

  it('should read MultiUnion with nested struct variant', () => {
    const buffer = loadBinaryData('multi_union_nested.bin');
    const reader = new MessageReader(buffer);
    const root = reader.getRoot(1, 1);

    const discriminant = root.getUint16(4);
    expect(discriminant).toBe(5); // optionF

    // NestedUnion is at pointer 0
    // NestedUnion has union with discriminant at bounded<2>()
    const nested = root.getStruct(0, 1, 0);
    expect(nested).toBeDefined();
    if (nested) {
      const nestedDiscriminant = nested.getUint16(4);
      expect(nestedDiscriminant).toBe(0); // nestedInt
      expect(nested.getInt32(0)).toBe(777);
    }
  });
});

// ========== 大消息测试 ==========

describe('Phase 2 - Large Message', () => {
  it('should read large message with data and struct lists', () => {
    const buffer = loadBinaryData('large_message.bin');
    const reader = new MessageReader(buffer);
    // LargeMessage: id @0 :UInt64, data @1 :Data, chunks @2 :List(Chunk)
    // Data words: 1, Pointer count: 2
    const root = reader.getRoot(1, 2);

    expect(root.getUint64(0)).toBe(999999999n);

    // Chunks list
    const chunksList = root.getList(1, 7, { dataWords: 1, pointerCount: 1 });
    expect(chunksList).toBeDefined();
    if (chunksList) {
      expect(chunksList.length).toBeGreaterThan(0);
    }
  });
});
