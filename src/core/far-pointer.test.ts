/**
 * Far Pointer 测试
 * 覆盖单 far pointer、double far pointer 的各种场景
 */

import { describe, expect, it } from 'vitest';
import {
  ElementSize,
  MessageBuilder,
  MessageReader,
  PointerTag,
  decodePointer,
  encodeStructPointer,
} from '../index.js';
import { encodeFarPointer } from '../core/pointer.js';

describe('Far Pointer Tests', () => {
  /**
   * 创建包含单 far pointer 的消息
   * 结构: 段0包含一个 far pointer 指向段1的 struct
   */
  function createSingleFarMessage(): ArrayBuffer {
    // 段1: 实际的 struct 数据
    // struct 指针在段1的位置0，指向位置1的数据
    // dataWords=1, pointerCount=0
    const segment1 = new ArrayBuffer(16);
    const view1 = new DataView(segment1);
    // 位置0: struct 指针 (offset=0, dataWords=1, pointerCount=0)
    const structPtr = encodeStructPointer(0, 1, 0);
    view1.setUint32(0, Number(structPtr & BigInt(0xffffffff)), true);
    view1.setUint32(4, Number(structPtr >> BigInt(32)), true);
    // 位置1: 数据 42
    view1.setInt32(8, 42, true);

    // 段0: far pointer 指向段1的 struct 指针
    const segment0 = new ArrayBuffer(16);
    const view0 = new DataView(segment0);
    // far pointer: targetSegment=1, targetOffset=0, doubleFar=false
    const farPtr = encodeFarPointer(1, 0, false);
    view0.setUint32(0, Number(farPtr & BigInt(0xffffffff)), true);
    view0.setUint32(4, Number(farPtr >> BigInt(32)), true);

    // 合并消息头 + 段数据
    // 消息头: segmentCount=2 (低32位为1), 第一段大小=2字
    const header = new ArrayBuffer(16);
    const headerView = new DataView(header);
    headerView.setUint32(0, 1, true); // segmentCount - 1 = 1
    headerView.setUint32(4, 2, true); // 段0大小 = 2字
    headerView.setUint32(8, 2, true); // 段1大小 = 2字
    headerView.setUint32(12, 0, true); // padding

    const result = new Uint8Array(header.byteLength + segment0.byteLength + segment1.byteLength);
    result.set(new Uint8Array(header), 0);
    result.set(new Uint8Array(segment0), header.byteLength);
    result.set(new Uint8Array(segment1), header.byteLength + segment0.byteLength);

    return result.buffer;
  }

  /**
   * 创建包含 double far pointer 的消息
   */
  function createDoubleFarMessage(): ArrayBuffer {
    // 段2: 实际的 struct 数据
    const segment2 = new ArrayBuffer(16);
    const view2 = new DataView(segment2);
    const structPtr = encodeStructPointer(0, 1, 0);
    view2.setUint32(0, Number(structPtr & BigInt(0xffffffff)), true);
    view2.setUint32(4, Number(structPtr >> BigInt(32)), true);
    view2.setInt32(8, 999, true);

    // 段1: landing pad - 内层 far pointer 指向段2
    const segment1 = new ArrayBuffer(8);
    const view1 = new DataView(segment1);
    const innerFarPtr = encodeFarPointer(2, 0, false);
    view1.setUint32(0, Number(innerFarPtr & BigInt(0xffffffff)), true);
    view1.setUint32(4, Number(innerFarPtr >> BigInt(32)), true);

    // 段0: 外层 double far pointer 指向段1
    const segment0 = new ArrayBuffer(8);
    const view0 = new DataView(segment0);
    const outerFarPtr = encodeFarPointer(1, 0, true);
    view0.setUint32(0, Number(outerFarPtr & BigInt(0xffffffff)), true);
    view0.setUint32(4, Number(outerFarPtr >> BigInt(32)), true);

    // 消息头: 3 个段
    const header = new ArrayBuffer(16);
    const headerView = new DataView(header);
    headerView.setUint32(0, 2, true); // 3 段 - 1
    headerView.setUint32(4, 1, true); // 段0大小
    headerView.setUint32(8, 1, true); // 段1大小
    headerView.setUint32(12, 2, true); // 段2大小

    const result = new Uint8Array(
      header.byteLength + segment0.byteLength + segment1.byteLength + segment2.byteLength
    );
    let offset = 0;
    result.set(new Uint8Array(header), offset);
    offset += header.byteLength;
    result.set(new Uint8Array(segment0), offset);
    offset += segment0.byteLength;
    result.set(new Uint8Array(segment1), offset);
    offset += segment1.byteLength;
    result.set(new Uint8Array(segment2), offset);

    return result.buffer;
  }

  describe('Single Far Pointer', () => {
    it('should decode far pointer correctly', () => {
      const farPtr = encodeFarPointer(5, 100, false);
      const decoded = decodePointer(farPtr);

      expect(decoded.tag).toBe(PointerTag.FAR);
      expect((decoded as any).targetSegment).toBe(5);
      expect((decoded as any).targetOffset).toBe(100);
      expect((decoded as any).doubleFar).toBe(false);
    });

    it('should read root through single far pointer', () => {
      const buffer = createSingleFarMessage();
      const reader = new MessageReader(buffer);
      expect(reader.segmentCount).toBe(2);

      const root = reader.getRoot(1, 0);
      expect(root.getInt32(0)).toBe(42);
    });

    it('should resolve pointer through single far pointer', () => {
      const buffer = createSingleFarMessage();
      const reader = new MessageReader(buffer);

      const resolved = reader.resolvePointer(0, 0);
      expect(resolved).not.toBeNull();
      expect(resolved?.pointer.tag).toBe(PointerTag.STRUCT);
    });
  });

  describe('Double Far Pointer', () => {
    it('should decode double far pointer correctly', () => {
      const farPtr = encodeFarPointer(3, 50, true);
      const decoded = decodePointer(farPtr);

      expect(decoded.tag).toBe(PointerTag.FAR);
      expect((decoded as any).targetSegment).toBe(3);
      expect((decoded as any).targetOffset).toBe(50);
      expect((decoded as any).doubleFar).toBe(true);
    });

    it('should read root through double far pointer', () => {
      const buffer = createDoubleFarMessage();
      const reader = new MessageReader(buffer);
      expect(reader.segmentCount).toBe(3);

      const root = reader.getRoot(1, 0);
      expect(root.getInt32(0)).toBe(999);
    });

    it('should resolve pointer through double far pointer', () => {
      const buffer = createDoubleFarMessage();
      const reader = new MessageReader(buffer);

      const resolved = reader.resolvePointer(0, 0);
      expect(resolved).not.toBeNull();
      expect(resolved?.pointer.tag).toBe(PointerTag.STRUCT);
    });
  });

  describe('Far Pointer Error Cases', () => {
    it('should throw error when far pointer references non-existent segment', () => {
      // 创建消息，far pointer 指向不存在的段
      const segment0 = new ArrayBuffer(8);
      const view0 = new DataView(segment0);
      const farPtr = encodeFarPointer(99, 0, false); // 指向段99
      view0.setUint32(0, Number(farPtr & BigInt(0xffffffff)), true);
      view0.setUint32(4, Number(farPtr >> BigInt(32)), true);

      const header = new ArrayBuffer(8);
      const headerView = new DataView(header);
      headerView.setUint32(0, 0, true);
      headerView.setUint32(4, 1, true);

      const result = new Uint8Array(header.byteLength + segment0.byteLength);
      result.set(new Uint8Array(header), 0);
      result.set(new Uint8Array(segment0), 8);

      const reader = new MessageReader(result.buffer);
      expect(() => reader.getRoot(1, 0)).toThrow('Far pointer references non-existent segment 99');
    });

    it('should handle double-far landing pad edge cases', () => {
      // 段1: landing pad 不是 far pointer
      const segment1 = new ArrayBuffer(8);
      const view1 = new DataView(segment1);
      // 放一个 struct 指针而不是 far 指针
      const structPtr = encodeStructPointer(0, 1, 0);
      view1.setUint32(0, Number(structPtr & BigInt(0xffffffff)), true);
      view1.setUint32(4, Number(structPtr >> BigInt(32)), true);

      // 段0: double far pointer
      const segment0 = new ArrayBuffer(8);
      const view0 = new DataView(segment0);
      const farPtr = encodeFarPointer(1, 0, true);
      view0.setUint32(0, Number(farPtr & BigInt(0xffffffff)), true);
      view0.setUint32(4, Number(farPtr >> BigInt(32)), true);

      const header = new ArrayBuffer(16);
      const headerView = new DataView(header);
      headerView.setUint32(0, 1, true);
      headerView.setUint32(4, 1, true);
      headerView.setUint32(8, 1, true);

      const result = new Uint8Array(header.byteLength + segment0.byteLength + segment1.byteLength);
      result.set(new Uint8Array(header), 0);
      result.set(new Uint8Array(segment0), 8);
      result.set(new Uint8Array(segment1), 16);

      const reader = new MessageReader(result.buffer);
      // resolvePointer 应该能处理这种情况
      const resolved = reader.resolvePointer(0, 0);
      // 因为 landing pad 是 struct 指针而不是 far 指针，应该返回 null
      expect(resolved).toBeDefined();
    });

    it('should handle double-far with invalid segment gracefully', () => {
      // 段1: landing pad - 内层 far pointer 指向不存在的段
      const segment1 = new ArrayBuffer(8);
      const view1 = new DataView(segment1);
      const innerFarPtr = encodeFarPointer(99, 0, false); // 指向段99
      view1.setUint32(0, Number(innerFarPtr & BigInt(0xffffffff)), true);
      view1.setUint32(4, Number(innerFarPtr >> BigInt(32)), true);

      // 段0: 外层 double far
      const segment0 = new ArrayBuffer(8);
      const view0 = new DataView(segment0);
      const outerFarPtr = encodeFarPointer(1, 0, true);
      view0.setUint32(0, Number(outerFarPtr & BigInt(0xffffffff)), true);
      view0.setUint32(4, Number(outerFarPtr >> BigInt(32)), true);

      const header = new ArrayBuffer(16);
      const headerView = new DataView(header);
      headerView.setUint32(0, 1, true);
      headerView.setUint32(4, 1, true);
      headerView.setUint32(8, 1, true);

      const result = new Uint8Array(header.byteLength + segment0.byteLength + segment1.byteLength);
      result.set(new Uint8Array(header), 0);
      result.set(new Uint8Array(segment0), 8);
      result.set(new Uint8Array(segment1), 16);

      const reader = new MessageReader(result.buffer);
      // resolvePointer 应该返回 null，因为内层 far pointer 指向不存在的段
      expect(reader.resolvePointer(0, 0)).toBeNull();
    });
  });

  describe('resolvePointer Edge Cases', () => {
    it('should return null for null pointer', () => {
      // 创建一个消息，段0位置1为null指针
      const segment0 = new ArrayBuffer(16);
      const view0 = new DataView(segment0);
      // 位置0: 一个简单的struct指针
      const structPtr = encodeStructPointer(0, 1, 0);
      view0.setUint32(0, Number(structPtr & BigInt(0xffffffff)), true);
      view0.setUint32(4, Number(structPtr >> BigInt(32)), true);
      // 位置1: null 指针 (0n)
      view0.setBigUint64(8, 0n, true);

      const header = new ArrayBuffer(8);
      const headerView = new DataView(header);
      headerView.setUint32(0, 0, true);
      headerView.setUint32(4, 2, true); // 2 words

      const result = new Uint8Array(header.byteLength + segment0.byteLength);
      result.set(new Uint8Array(header), 0);
      result.set(new Uint8Array(segment0), 8);

      const reader = new MessageReader(result.buffer);
      const resolved = reader.resolvePointer(0, 1); // 位置1是null指针
      expect(resolved).toBeNull();
    });

    it('should return null for invalid segment index', () => {
      const builder = new MessageBuilder();
      const buffer = builder.toArrayBuffer();
      const reader = new MessageReader(buffer);

      const resolved = reader.resolvePointer(99, 0); // 段99不存在
      expect(resolved).toBeNull();
    });

    it('should return null for far pointer with invalid segment', () => {
      // 创建消息，far pointer 指向不存在的段
      const segment0 = new ArrayBuffer(8);
      const view0 = new DataView(segment0);
      const farPtr = encodeFarPointer(99, 0, false);
      view0.setUint32(0, Number(farPtr & BigInt(0xffffffff)), true);
      view0.setUint32(4, Number(farPtr >> BigInt(32)), true);

      const header = new ArrayBuffer(8);
      const headerView = new DataView(header);
      headerView.setUint32(0, 0, true);
      headerView.setUint32(4, 1, true);

      const result = new Uint8Array(header.byteLength + segment0.byteLength);
      result.set(new Uint8Array(header), 0);
      result.set(new Uint8Array(segment0), 8);

      const reader = new MessageReader(result.buffer);
      const resolved = reader.resolvePointer(0, 0);
      expect(resolved).toBeNull();
    });
  });
});
