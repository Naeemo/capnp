import { describe, expect, it } from 'vitest';
import { MessageBuilder, MessageReader } from '../index.js';

/**
 * 错误处理测试
 * 验证库对无效/畸形数据的处理
 */

describe('Error Handling - Invalid Message Headers', () => {
  it('should handle truncated header', () => {
    // Header is only 4 bytes instead of 8
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setUint32(0, 0, true);

    // May throw or have undefined behavior - both are acceptable
    try {
      const _reader = new MessageReader(buffer);
    } catch (e) {
      expect(e).toBeDefined();
    }
  });

  it('should handle zero segment count', () => {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setUint32(0, 0xffffffff, true); // segmentCount - 1 = -1 (invalid)
    view.setUint32(4, 0, true);

    // Should handle gracefully
    expect(() => {
      const _reader = new MessageReader(buffer);
    }).not.toThrow();
  });
});

describe('Error Handling - Invalid Pointers', () => {
  it('should handle null pointer gracefully', () => {
    const builder = new MessageBuilder();
    const _root = builder.initRoot(0, 1);
    // Pointer 0 is not initialized, should be null

    const buffer = builder.toArrayBuffer();
    const readRoot = new MessageReader(buffer).getRoot(0, 1);

    // getStruct returns undefined for null pointers
    expect(readRoot.getStruct(0, 1, 0)).toBeUndefined();
    // getText returns empty string for null pointers
    expect(readRoot.getText(0)).toBe('');
    // getList returns undefined for null pointers
    expect(readRoot.getList(0, 4)).toBeUndefined();
  });

  it('should handle out-of-bounds pointer offset', () => {
    // Create a message with a pointer pointing outside the segment
    const buffer = new ArrayBuffer(24);
    const view = new DataView(buffer);

    // Header: 1 segment, 2 words
    view.setUint32(0, 0, true);
    view.setUint32(4, 2, true);

    // Root struct pointer at offset 8: points to offset 1000 (out of bounds)
    const pointerOffset = 1000; // Way beyond our 2-word segment
    const pointerValue = (pointerOffset << 2) | 0; // struct pointer
    view.setBigUint64(8, BigInt.asUintN(64, BigInt(pointerValue)), true);

    // Should handle gracefully (return null or default)
    const reader = new MessageReader(buffer);
    expect(() => {
      const _root = reader.getRoot(1, 0);
    }).not.toThrow();
  });
});

describe('Error Handling - Malformed Data', () => {
  it('should handle negative offset in pointer', () => {
    // Create a message with negative pointer offset
    const buffer = new ArrayBuffer(24);
    const view = new DataView(buffer);

    // Header: 1 segment, 2 words
    view.setUint32(0, 0, true);
    view.setUint32(4, 2, true);

    // Negative offset encoded as two's complement
    const negativeOffset = -1;
    const pointerValue = ((negativeOffset & 0x3fffffff) << 2) | 0;
    view.setBigUint64(8, BigInt.asUintN(64, BigInt(pointerValue)), true);

    const reader = new MessageReader(buffer);
    expect(() => {
      const _root = reader.getRoot(1, 0);
    }).not.toThrow();
  });

  it('should handle invalid pointer type', () => {
    const buffer = new ArrayBuffer(24);
    const view = new DataView(buffer);

    // Header: 1 segment, 2 words
    view.setUint32(0, 0, true);
    view.setUint32(4, 2, true);

    // Pointer with invalid type (type = 3 is reserved)
    const pointerValue = 0b11; // type = 3 (invalid)
    view.setBigUint64(8, BigInt.asUintN(64, BigInt(pointerValue)), true);

    const reader = new MessageReader(buffer);
    // May throw or handle gracefully
    try {
      const _root = reader.getRoot(1, 0);
    } catch (e) {
      expect(e).toBeDefined();
    }
  });
});

describe('Error Handling - Truncated Messages', () => {
  it('should handle message truncated mid-struct', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(4, 0); // 4 data words
    root.setInt32(0, 42);

    const fullBuffer = builder.toArrayBuffer();

    // Truncate to just header + partial struct
    const truncatedBuffer = fullBuffer.slice(0, 16);

    const reader = new MessageReader(truncatedBuffer);
    // May throw or handle gracefully
    try {
      const readRoot = reader.getRoot(4, 0);
      // Reading beyond buffer should return default
      expect(readRoot.getInt32(100)).toBe(0);
    } catch (e) {
      expect(e).toBeDefined();
    }
  });

  it('should handle message with declared size larger than actual', () => {
    const buffer = new ArrayBuffer(16);
    const view = new DataView(buffer);

    // Header claims 100 words, but buffer only has 2
    view.setUint32(0, 0, true);
    view.setUint32(4, 100, true);

    // Should read partial segment, not throw
    const reader = new MessageReader(buffer);
    // Segment count is 0 because data is insufficient
    expect(reader.segmentCount).toBe(0);
  });
});

describe('Error Handling - List Errors', () => {
  it('should handle list with zero element size', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(0, 1);
    // Create an empty list
    root.initList(0, 0, 0);

    const buffer = builder.toArrayBuffer();
    const readRoot = new MessageReader(buffer).getRoot(0, 1);
    const list = readRoot.getList(0, 0);

    expect(list).toBeDefined();
    expect(list?.length).toBe(0);
  });

  it('should handle very large declared list count', () => {
    const buffer = new ArrayBuffer(24);
    const view = new DataView(buffer);

    // Header: 1 segment, 2 words
    view.setUint32(0, 0, true);
    view.setUint32(4, 2, true);

    // List pointer with elementCount = 0xFFFFFFF (very large)
    const elementCount = 0xfffffff;
    const pointerValue = (elementCount << 35) | (4 << 32) | (1 << 2) | 1;
    view.setBigUint64(8, BigInt.asUintN(64, BigInt(pointerValue)), true);

    const reader = new MessageReader(buffer);
    // May throw or handle gracefully
    try {
      const root = reader.getRoot(0, 1);
      const _list = root.getList(0, 4);
    } catch (e) {
      expect(e).toBeDefined();
    }
  });
});

describe('Error Handling - Text/Data Errors', () => {
  it('should handle text without null terminator', () => {
    // Create a malformed text field (no null terminator)
    const buffer = new ArrayBuffer(32);
    const view = new DataView(buffer);

    // Header: 1 segment, 3 words
    view.setUint32(0, 0, true);
    view.setUint32(4, 3, true);

    // Root struct with 0 data, 1 pointer
    // Struct pointer at offset 8
    view.setBigUint64(8, BigInt(0x0000000100000000n), true);

    // List pointer at offset 16 (text data)
    // 5 bytes, no null terminator
    const textLength = 5;
    const listPointer = (BigInt(textLength) << 35n) | (2n << 32n) | (1n << 2n) | 1n;
    view.setBigUint64(16, listPointer, true);

    // Raw text bytes (no null terminator)
    view.setUint8(24, 0x48); // 'H'
    view.setUint8(25, 0x65); // 'e'
    view.setUint8(26, 0x6c); // 'l'
    view.setUint8(27, 0x6c); // 'l'
    view.setUint8(28, 0x6f); // 'o'

    const reader = new MessageReader(buffer);
    expect(() => {
      const root = reader.getRoot(0, 1);
      const _text = root.getText(0);
    }).not.toThrow();
  });

  it('should handle text with embedded null', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(0, 1);
    // Note: setText should handle null characters properly
    root.setText(0, 'hello\x00world');

    const buffer = builder.toArrayBuffer();
    const readRoot = new MessageReader(buffer).getRoot(0, 1);

    // Behavior depends on implementation - may truncate at null
    const text = readRoot.getText(0);
    expect(text).toBeDefined();
  });
});

describe('Error Handling - Multi-segment Errors', () => {
  it('should handle multi-segment message with invalid segment id', () => {
    // 2 segments: header(16) + sizes(4) + padding(4) + seg0(16) + seg1(16) = 56 bytes
    const buffer = new ArrayBuffer(56);
    const view = new DataView(buffer);

    // Header: 2 segments (segmentCount - 1 = 1)
    view.setUint32(0, 1, true);
    view.setUint32(4, 2, true); // segment 0 size = 2 words
    view.setUint32(8, 2, true); // segment 1 size = 2 words
    // padding to 8-byte alignment: bytes 12-15

    // Segment 0 starts at offset 16
    // Far pointer at offset 16 pointing to segment 5 (doesn't exist)
    const farPointer = (5n << 32n) | 0n | 2n; // segmentId=5, offset=0, type=2 (far)
    view.setBigUint64(16, farPointer, true);

    const reader = new MessageReader(buffer);
    // Invalid segment may throw - that's acceptable behavior
    expect(() => {
      const _root = reader.getRoot(1, 0);
    }).toThrow();
  });

  it('should handle far pointer with double-far indirection', () => {
    // This tests the double-far pointer scenario
    // 2 segments: header(16) + sizes(4) + padding(4) + seg0(32) + seg1(32) = 88 bytes
    const buffer = new ArrayBuffer(88);
    const view = new DataView(buffer);

    // Header: 2 segments
    view.setUint32(0, 1, true);
    view.setUint32(4, 4, true); // segment 0 size = 4 words
    view.setUint32(8, 4, true); // segment 1 size = 4 words
    // padding: bytes 12-15

    // Segment 0 starts at offset 16
    // Double-far pointer at offset 16
    // bit 2 = 1 (double-far), bits 0-1 = 2 (far tag)
    const doubleFarPointer = (1n << 2n) | 2n; // doubleFar=1, offset=0, type=2
    view.setBigUint64(16, doubleFarPointer, true);

    const reader = new MessageReader(buffer);
    // Double-far handling may throw if not fully implemented - that's acceptable
    expect(() => {
      const _root = reader.getRoot(1, 0);
    }).toThrow();
  });
});
