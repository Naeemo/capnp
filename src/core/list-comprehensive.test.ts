/**
 * List 全面测试
 * 覆盖所有 element sizes 和 struct list
 */

import { describe, expect, it } from 'vitest';
import { ElementSize, MessageBuilder, MessageReader, StructBuilder } from '../index.js';

describe('List Comprehensive Tests', () => {
  describe('BIT Element Size', () => {
    it('should read and write bit list', () => {
      const builder = new MessageBuilder();
      const root = builder.initRoot(0, 1);
      const list = root.initList<number>(0, ElementSize.BIT, 10);

      // 设置一些位
      list.setPrimitive(0, 1);
      list.setPrimitive(3, 1);
      list.setPrimitive(7, 1);
      list.setPrimitive(8, 1);
      list.setPrimitive(9, 1);

      const buffer = builder.toArrayBuffer();
      const reader = new MessageReader(buffer);
      const readRoot = reader.getRoot(0, 1);
      const readList = readRoot.getList<number>(0, ElementSize.BIT)!;

      expect(readList.length).toBe(10);
      expect(readList.getPrimitive(0)).toBe(1);
      expect(readList.getPrimitive(1)).toBe(0);
      expect(readList.getPrimitive(3)).toBe(1);
      expect(readList.getPrimitive(7)).toBe(1);
      expect(readList.getPrimitive(8)).toBe(1);
      expect(readList.getPrimitive(9)).toBe(1);
    });

    it('should iterate bit list', () => {
      const builder = new MessageBuilder();
      const root = builder.initRoot(0, 1);
      const list = root.initList<number>(0, ElementSize.BIT, 5);
      list.setPrimitive(0, 1);
      list.setPrimitive(2, 1);
      list.setPrimitive(4, 1);

      const buffer = builder.toArrayBuffer();
      const reader = new MessageReader(buffer);
      const readRoot = reader.getRoot(0, 1);
      const readList = readRoot.getList<number>(0, ElementSize.BIT)!;

      const bits: number[] = [];
      for (const bit of readList) {
        bits.push(bit);
      }
      expect(bits).toEqual([1, 0, 1, 0, 1]);
    });

    it('should handle clearing bits', () => {
      const builder = new MessageBuilder();
      const root = builder.initRoot(0, 1);
      const list = root.initList<number>(0, ElementSize.BIT, 8);

      // 设置所有位
      for (let i = 0; i < 8; i++) {
        list.setPrimitive(i, 1);
      }

      // 清除一些位
      list.setPrimitive(1, 0);
      list.setPrimitive(3, 0);
      list.setPrimitive(5, 0);
      list.setPrimitive(7, 0);

      const buffer = builder.toArrayBuffer();
      const reader = new MessageReader(buffer);
      const readRoot = reader.getRoot(0, 1);
      const readList = readRoot.getList<number>(0, ElementSize.BIT)!;

      expect(readList.getPrimitive(0)).toBe(1);
      expect(readList.getPrimitive(1)).toBe(0);
      expect(readList.getPrimitive(2)).toBe(1);
      expect(readList.getPrimitive(3)).toBe(0);
      expect(readList.getPrimitive(4)).toBe(1);
      expect(readList.getPrimitive(5)).toBe(0);
      expect(readList.getPrimitive(6)).toBe(1);
      expect(readList.getPrimitive(7)).toBe(0);
    });
  });

  describe('BYTE Element Size', () => {
    it('should read and write byte list', () => {
      const builder = new MessageBuilder();
      const root = builder.initRoot(0, 1);
      const list = root.initList<number>(0, ElementSize.BYTE, 5);

      list.setPrimitive(0, 0x01);
      list.setPrimitive(1, 0xab);
      list.setPrimitive(2, 0xff);
      list.setPrimitive(3, 0x00);
      list.setPrimitive(4, 0xcd);

      const buffer = builder.toArrayBuffer();
      const reader = new MessageReader(buffer);
      const readRoot = reader.getRoot(0, 1);
      const readList = readRoot.getList<number>(0, ElementSize.BYTE)!;

      expect(readList.getPrimitive(0)).toBe(0x01);
      expect(readList.getPrimitive(1)).toBe(0xab);
      expect(readList.getPrimitive(2)).toBe(0xff);
      expect(readList.getPrimitive(3)).toBe(0x00);
      expect(readList.getPrimitive(4)).toBe(0xcd);
    });

    it('should iterate byte list', () => {
      const builder = new MessageBuilder();
      const root = builder.initRoot(0, 1);
      const list = root.initList<number>(0, ElementSize.BYTE, 4);
      list.setPrimitive(0, 10);
      list.setPrimitive(1, 20);
      list.setPrimitive(2, 30);
      list.setPrimitive(3, 40);

      const buffer = builder.toArrayBuffer();
      const reader = new MessageReader(buffer);
      const readRoot = reader.getRoot(0, 1);
      const readList = readRoot.getList<number>(0, ElementSize.BYTE)!;

      const bytes: number[] = [];
      for (const b of readList) {
        bytes.push(b);
      }
      expect(bytes).toEqual([10, 20, 30, 40]);
    });
  });

  describe('TWO_BYTES Element Size', () => {
    it('should read and write 2-byte list', () => {
      const builder = new MessageBuilder();
      const root = builder.initRoot(0, 1);
      const list = root.initList<number>(0, ElementSize.TWO_BYTES, 4);

      list.setPrimitive(0, 0x1234);
      list.setPrimitive(1, 0xabcd);
      list.setPrimitive(2, 0x00ff);
      list.setPrimitive(3, 0xff00);

      const buffer = builder.toArrayBuffer();
      const reader = new MessageReader(buffer);
      const readRoot = reader.getRoot(0, 1);
      const readList = readRoot.getList<number>(0, ElementSize.TWO_BYTES)!;

      expect(readList.getPrimitive(0)).toBe(0x1234);
      expect(readList.getPrimitive(1)).toBe(0xabcd);
      expect(readList.getPrimitive(2)).toBe(0x00ff);
      expect(readList.getPrimitive(3)).toBe(0xff00);
    });
  });

  describe('FOUR_BYTES Element Size', () => {
    it('should read and write 4-byte list', () => {
      const builder = new MessageBuilder();
      const root = builder.initRoot(0, 1);
      const list = root.initList<number>(0, ElementSize.FOUR_BYTES, 3);

      list.setPrimitive(0, 0x12345678);
      list.setPrimitive(1, 0xdeadbeef);
      list.setPrimitive(2, 0x00000000);

      const buffer = builder.toArrayBuffer();
      const reader = new MessageReader(buffer);
      const readRoot = reader.getRoot(0, 1);
      const readList = readRoot.getList<number>(0, ElementSize.FOUR_BYTES)!;

      expect(readList.getPrimitive(0)).toBe(0x12345678);
      expect(readList.getPrimitive(1)).toBe(0xdeadbeef);
      expect(readList.getPrimitive(2)).toBe(0x00000000);
    });
  });

  describe('EIGHT_BYTES Element Size', () => {
    it('should read and write 8-byte (int64) list', () => {
      const builder = new MessageBuilder();
      const root = builder.initRoot(0, 1);
      const list = root.initList<bigint>(0, ElementSize.EIGHT_BYTES, 3);

      list.setPrimitive(0, 0x0123456789abcdefn);
      list.setPrimitive(1, 0xfedcba9876543210n);
      list.setPrimitive(2, 0x0000000000000000n);

      const buffer = builder.toArrayBuffer();
      const reader = new MessageReader(buffer);
      const readRoot = reader.getRoot(0, 1);
      const readList = readRoot.getList<bigint>(0, ElementSize.EIGHT_BYTES)!;

      expect(readList.getPrimitive(0)).toBe(0x0123456789abcdefn);
      expect(readList.getPrimitive(1)).toBe(0xfedcba9876543210n);
      expect(readList.getPrimitive(2)).toBe(0x0000000000000000n);
    });

    it('should handle negative int64 values', () => {
      const builder = new MessageBuilder();
      const root = builder.initRoot(0, 1);
      const list = root.initList<bigint>(0, ElementSize.EIGHT_BYTES, 2);

      list.setPrimitive(0, -1n);
      list.setPrimitive(1, -0x123456789abcdefn);

      const buffer = builder.toArrayBuffer();
      const reader = new MessageReader(buffer);
      const readRoot = reader.getRoot(0, 1);
      const readList = readRoot.getList<bigint>(0, ElementSize.EIGHT_BYTES)!;

      // 注意：getPrimitive 返回的是 unsigned 的 bigint
      // 因为我们使用 getUint32 来读取
      expect(readList.getPrimitive(0)).toBe(0xffffffffffffffffn);
    });
  });

  describe('List Edge Cases', () => {
    it('should handle single element list', () => {
      const builder = new MessageBuilder();
      const root = builder.initRoot(0, 1);
      const list = root.initList<number>(0, ElementSize.FOUR_BYTES, 1);
      list.setPrimitive(0, 42);

      const buffer = builder.toArrayBuffer();
      const reader = new MessageReader(buffer);
      const readRoot = reader.getRoot(0, 1);
      const readList = readRoot.getList<number>(0, ElementSize.FOUR_BYTES)!;

      expect(readList.length).toBe(1);
      expect(readList.getPrimitive(0)).toBe(42);
    });

    it('should handle large list', () => {
      const count = 1000;
      const builder = new MessageBuilder();
      const root = builder.initRoot(0, 1);
      const list = root.initList<number>(0, ElementSize.FOUR_BYTES, count);

      for (let i = 0; i < count; i++) {
        list.setPrimitive(i, i * 2);
      }

      const buffer = builder.toArrayBuffer();
      const reader = new MessageReader(buffer);
      const readRoot = reader.getRoot(0, 1);
      const readList = readRoot.getList<number>(0, ElementSize.FOUR_BYTES)!;

      expect(readList.length).toBe(count);
      expect(readList.getPrimitive(0)).toBe(0);
      expect(readList.getPrimitive(500)).toBe(1000);
      expect(readList.getPrimitive(999)).toBe(1998);
    });

    it('should return undefined for null list pointer', () => {
      const builder = new MessageBuilder();
      const _root = builder.initRoot(0, 1);
      // 不初始化列表

      const buffer = builder.toArrayBuffer();
      const reader = new MessageReader(buffer);
      const readRoot = reader.getRoot(0, 1);
      const readList = readRoot.getList<number>(0, ElementSize.FOUR_BYTES);

      expect(readList).toBeUndefined();
    });

    it('should return undefined when pointer tag is not LIST', () => {
      const builder = new MessageBuilder();
      const root = builder.initRoot(0, 1);
      // 初始化一个 struct 而不是 list
      root.initStruct(0, 1, 0).setInt32(0, 42);

      const buffer = builder.toArrayBuffer();
      const reader = new MessageReader(buffer);
      const readRoot = reader.getRoot(0, 1);
      const readList = readRoot.getList<number>(0, ElementSize.FOUR_BYTES);

      expect(readList).toBeUndefined();
    });
  });
});
