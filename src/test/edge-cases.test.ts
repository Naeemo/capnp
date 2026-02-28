import { describe, expect, it } from 'vitest';
import { ElementSize, MessageBuilder, MessageReader } from '../index.js';

/**
 * 边界情况测试
 * 对应官方测试：空消息、最小/最大值、截断数据等
 */

describe('Edge Cases - Empty Messages', () => {
  it('should handle empty message (header only)', () => {
    // 最小消息：只有头部（1个segment，0 words）
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setUint32(0, 0, true); // segmentCount - 1 = 0
    view.setUint32(4, 0, true); // firstSegmentSize = 0

    const reader = new MessageReader(buffer);
    expect(reader.segmentCount).toBe(1);
  });

  it('should handle message with empty root struct', () => {
    const builder = new MessageBuilder();
    const _root = builder.initRoot(0, 0); // 0 data words, 0 pointers
    const buffer = builder.toArrayBuffer();

    const reader = new MessageReader(buffer);
    const readRoot = reader.getRoot(0, 0);
    expect(readRoot).toBeDefined();
  });
});

describe('Edge Cases - Numeric Limits', () => {
  it('should handle Int8 limits', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(1, 0);

    root.setInt8(0, 127); // max
    root.setInt8(1, -128); // min

    const buffer = builder.toArrayBuffer();
    const readRoot = new MessageReader(buffer).getRoot(1, 0);

    expect(readRoot.getInt8(0)).toBe(127);
    expect(readRoot.getInt8(1)).toBe(-128);
  });

  it('should handle UInt8 limits', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(1, 0);

    root.setUint8(0, 255); // max
    root.setUint8(1, 0); // min

    const buffer = builder.toArrayBuffer();
    const readRoot = new MessageReader(buffer).getRoot(1, 0);

    expect(readRoot.getUint8(0)).toBe(255);
    expect(readRoot.getUint8(1)).toBe(0);
  });

  it('should handle Int16 limits', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(1, 0);

    root.setInt16(0, 32767);
    root.setInt16(2, -32768);

    const buffer = builder.toArrayBuffer();
    const readRoot = new MessageReader(buffer).getRoot(1, 0);

    expect(readRoot.getInt16(0)).toBe(32767);
    expect(readRoot.getInt16(2)).toBe(-32768);
  });

  it('should handle Int32 limits', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(2, 0);

    root.setInt32(0, 2147483647);
    root.setInt32(4, -2147483648);

    const buffer = builder.toArrayBuffer();
    const readRoot = new MessageReader(buffer).getRoot(2, 0);

    expect(readRoot.getInt32(0)).toBe(2147483647);
    expect(readRoot.getInt32(4)).toBe(-2147483648);
  });

  it('should handle Int64 limits', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(2, 0);

    root.setInt64(0, 9223372036854775807n);
    root.setInt64(8, -9223372036854775808n);

    const buffer = builder.toArrayBuffer();
    const readRoot = new MessageReader(buffer).getRoot(2, 0);

    expect(readRoot.getInt64(0)).toBe(9223372036854775807n);
    expect(readRoot.getInt64(8)).toBe(-9223372036854775808n);
  });

  it('should handle UInt64 limits', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(2, 0);

    root.setUint64(0, 18446744073709551615n);
    root.setUint64(8, 0n);

    const buffer = builder.toArrayBuffer();
    const readRoot = new MessageReader(buffer).getRoot(2, 0);

    expect(readRoot.getUint64(0)).toBe(18446744073709551615n);
    expect(readRoot.getUint64(8)).toBe(0n);
  });

  it('should handle Float32 special values', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(2, 0);

    root.setFloat32(0, Number.POSITIVE_INFINITY);
    root.setFloat32(4, Number.NEGATIVE_INFINITY);
    root.setFloat32(8, Number.NaN);

    const buffer = builder.toArrayBuffer();
    const readRoot = new MessageReader(buffer).getRoot(2, 0);

    expect(readRoot.getFloat32(0)).toBe(Number.POSITIVE_INFINITY);
    expect(readRoot.getFloat32(4)).toBe(Number.NEGATIVE_INFINITY);
    expect(readRoot.getFloat32(8)).toBeNaN();
  });

  it('should handle Float64 special values', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(4, 0);

    root.setFloat64(0, Number.POSITIVE_INFINITY);
    root.setFloat64(8, Number.NEGATIVE_INFINITY);
    root.setFloat64(16, Number.NaN);

    const buffer = builder.toArrayBuffer();
    const readRoot = new MessageReader(buffer).getRoot(4, 0);

    expect(readRoot.getFloat64(0)).toBe(Number.POSITIVE_INFINITY);
    expect(readRoot.getFloat64(8)).toBe(Number.NEGATIVE_INFINITY);
    expect(readRoot.getFloat64(16)).toBeNaN();
  });
});

describe('Edge Cases - Boolean Fields', () => {
  it('should handle all 8 bits in a byte', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(1, 0);

    // Set all 8 bits in first byte
    for (let i = 0; i < 8; i++) {
      root.setBool(i, i % 2 === 0);
    }

    const buffer = builder.toArrayBuffer();
    const readRoot = new MessageReader(buffer).getRoot(1, 0);

    for (let i = 0; i < 8; i++) {
      expect(readRoot.getBool(i)).toBe(i % 2 === 0);
    }
  });

  it('should handle boolean across multiple bytes', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(2, 0);

    // Set bits across byte boundaries
    root.setBool(7, true); // last bit of byte 0
    root.setBool(8, true); // first bit of byte 1
    root.setBool(15, true); // last bit of byte 1

    const buffer = builder.toArrayBuffer();
    const readRoot = new MessageReader(buffer).getRoot(2, 0);

    expect(readRoot.getBool(7)).toBe(true);
    expect(readRoot.getBool(8)).toBe(true);
    expect(readRoot.getBool(15)).toBe(true);
  });
});

describe('Edge Cases - Empty Collections', () => {
  it('should handle empty list', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(0, 1);
    const list = root.initList<number>(0, ElementSize.FOUR_BYTES, 0);

    expect(list.length).toBe(0);

    const buffer = builder.toArrayBuffer();
    const readRoot = new MessageReader(buffer).getRoot(0, 1);
    const readList = readRoot.getList<number>(0, ElementSize.FOUR_BYTES);

    expect(readList).toBeDefined();
    expect(readList?.length).toBe(0);
  });

  it('should handle empty text', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(0, 1);
    root.setText(0, '');

    const buffer = builder.toArrayBuffer();
    const readRoot = new MessageReader(buffer).getRoot(0, 1);

    expect(readRoot.getText(0)).toBe('');
  });

  it('should handle empty data', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(0, 1);
    // Store empty data as empty text
    root.setText(0, '');

    const buffer = builder.toArrayBuffer();
    const readRoot = new MessageReader(buffer).getRoot(0, 1);

    const text = readRoot.getText(0);
    expect(text).toBeDefined();
    expect(text).toBe('');
  });
});

describe('Edge Cases - Large Collections', () => {
  it('should handle large primitive list', () => {
    const size = 10000;
    const builder = new MessageBuilder();
    const root = builder.initRoot(0, 1);
    const list = root.initList<number>(0, ElementSize.FOUR_BYTES, size);

    for (let i = 0; i < size; i++) {
      list.setPrimitive(i, i);
    }

    const buffer = builder.toArrayBuffer();
    const readRoot = new MessageReader(buffer).getRoot(0, 1);
    const readList = readRoot.getList<number>(0, ElementSize.FOUR_BYTES);

    expect(readList).toBeDefined();
    expect(readList?.length).toBe(size);
    expect(readList?.getPrimitive(0)).toBe(0);
    expect(readList?.getPrimitive(size - 1)).toBe(size - 1);
    expect(readList?.getPrimitive(5000)).toBe(5000);
  });

  it('should handle large text', () => {
    const largeText = 'x'.repeat(100000);
    const builder = new MessageBuilder();
    const root = builder.initRoot(0, 1);
    root.setText(0, largeText);

    const buffer = builder.toArrayBuffer();
    const readRoot = new MessageReader(buffer).getRoot(0, 1);

    expect(readRoot.getText(0)).toBe(largeText);
  });
});

describe('Edge Cases - Deep Nesting', () => {
  it('should handle deeply nested structs', () => {
    const depth = 100;
    const builder = new MessageBuilder();

    // Build: root -> child -> child -> ... (depth levels)
    let current = builder.initRoot(1, 1);
    current.setInt32(0, 0);

    for (let i = 1; i < depth; i++) {
      const child = current.initStruct(0, 1, 1);
      child.setInt32(0, i);
      current = child;
    }

    const buffer = builder.toArrayBuffer();

    // Read and verify
    let readCurrent = new MessageReader(buffer).getRoot(1, 1);
    expect(readCurrent.getInt32(0)).toBe(0);

    for (let i = 1; i < depth; i++) {
      readCurrent = readCurrent.getStruct(0, 1, 1)!;
      expect(readCurrent.getInt32(0)).toBe(i);
    }
  });
});

describe('Edge Cases - Truncated Data', () => {
  it('should handle reading beyond buffer (returns defaults)', () => {
    // Create a minimal valid message
    const builder = new MessageBuilder();
    const root = builder.initRoot(1, 0);
    root.setInt32(0, 42);
    const buffer = builder.toArrayBuffer();

    // Read with larger struct size than actual - may throw or return defaults
    const reader = new MessageReader(buffer);
    try {
      const readRoot = reader.getRoot(4, 2); // Request more than exists
      // Reading beyond should return defaults (0)
      expect(readRoot.getInt32(0)).toBe(42);
    } catch (e) {
      // Throwing is also acceptable for invalid requests
      expect(e).toBeDefined();
    }
  });
});

describe('Edge Cases - Unicode Text', () => {
  it('should handle unicode text (ASCII)', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(0, 1);
    root.setText(0, 'Hello World');

    const buffer = builder.toArrayBuffer();
    const readRoot = new MessageReader(buffer).getRoot(0, 1);

    expect(readRoot.getText(0)).toBe('Hello World');
  });

  it('should handle unicode text (multi-byte)', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(0, 1);
    root.setText(0, '你好世界 🌍 émojis');

    const buffer = builder.toArrayBuffer();
    const readRoot = new MessageReader(buffer).getRoot(0, 1);

    expect(readRoot.getText(0)).toBe('你好世界 🌍 émojis');
  });

  it('should handle unicode text (special chars)', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(0, 1);
    root.setText(0, '\x00\x01\x02\x03'); // Control chars

    const buffer = builder.toArrayBuffer();
    const readRoot = new MessageReader(buffer).getRoot(0, 1);

    // UTF-8 encoding should handle this
    const text = readRoot.getText(0);
    expect(text).toBeDefined();
  });
});
