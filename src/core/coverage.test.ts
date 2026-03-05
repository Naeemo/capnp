/**
 * Core 模块边界条件和错误处理测试
 * 目标是提升 src/core 的测试覆盖率到 >90%
 */

import { describe, expect, it } from 'vitest';
import {
  ElementSize,
  ListBuilder,
  ListReader,
  MessageBuilder,
  MessageReader,
  Segment,
  StructBuilder,
  StructReader,
  createUnionBuilder,
  createUnionReader,
  decodePointer,
  encodeFarPointer,
  encodeListPointer,
  encodeStructPointer,
} from '../index.js';

describe('Core Module Coverage Tests', () => {
  describe('Segment Edge Cases', () => {
    it('should throw error when getWord is out of bounds', () => {
      const segment = new Segment(64);
      segment.allocate(2); // 分配2个字 = 16字节

      expect(() => segment.getWord(10)).toThrow('outside the bounds');
    });

    it('should throw error when setWord is out of bounds', () => {
      const segment = new Segment(64);
      // 没有分配空间，直接设置会越界
      expect(() => segment.setWord(10, 123n)).toThrow('outside the bounds');
    });

    it('should expand capacity when allocating more space', () => {
      const segment = new Segment(16); // 很小的初始容量
      const offset1 = segment.allocate(1);
      expect(offset1).toBe(0);

      // 分配大量空间，触发扩容
      const offset2 = segment.allocate(100);
      expect(offset2).toBe(1);
      expect(segment.byteLength).toBe(101 * 8);
    });

    it('should create segment from existing buffer', () => {
      const buffer = new ArrayBuffer(64);
      const view = new DataView(buffer);
      view.setUint32(0, 0x12345678, true);

      const segment = Segment.fromBuffer(buffer);
      expect(segment.byteLength).toBe(64);
      expect(segment.wordCount).toBe(8);
      expect(segment.getWord(0)).toBe(0x12345678n);
    });
  });

  describe('ListReader/Builder Edge Cases', () => {
    it('should throw RangeError for out of bounds index in getPrimitive', () => {
      const builder = new MessageBuilder();
      const root = builder.initRoot(0, 1);
      const _list = root.initList<number>(0, ElementSize.FOUR_BYTES, 3);

      const buffer = builder.toArrayBuffer();
      const reader = new MessageReader(buffer);
      const readRoot = reader.getRoot(0, 1);
      const readList = readRoot.getList<number>(0, ElementSize.FOUR_BYTES)!;

      expect(() => readList.getPrimitive(-1)).toThrow('Index out of bounds');
      expect(() => readList.getPrimitive(3)).toThrow('Index out of bounds');
    });

    it('should throw RangeError for out of bounds index in setPrimitive', () => {
      const builder = new MessageBuilder();
      const root = builder.initRoot(0, 1);
      const list = root.initList<number>(0, ElementSize.FOUR_BYTES, 3);

      expect(() => list.setPrimitive(-1, 100)).toThrow('Index out of bounds');
      expect(() => list.setPrimitive(3, 100)).toThrow('Index out of bounds');
    });

    it('should throw error when calling getStruct on non-struct list', () => {
      const builder = new MessageBuilder();
      const root = builder.initRoot(0, 1);
      root.initList<number>(0, ElementSize.FOUR_BYTES, 3);

      const buffer = builder.toArrayBuffer();
      const reader = new MessageReader(buffer);
      const readRoot = reader.getRoot(0, 1);
      const readList = readRoot.getList<number>(0, ElementSize.FOUR_BYTES)!;

      expect(() => readList.getStruct(0)).toThrow('Not a struct list');
    });

    it('should throw error when calling getStruct on non-struct list builder', () => {
      const builder = new MessageBuilder();
      const root = builder.initRoot(0, 1);
      const list = root.initList<number>(0, ElementSize.FOUR_BYTES, 3);

      expect(() => list.getStruct(0)).toThrow('Not a struct list');
    });

    it('should iterate through list items', () => {
      const builder = new MessageBuilder();
      const root = builder.initRoot(0, 1);
      const list = root.initList<number>(0, ElementSize.FOUR_BYTES, 3);
      list.setPrimitive(0, 10);
      list.setPrimitive(1, 20);
      list.setPrimitive(2, 30);

      const buffer = builder.toArrayBuffer();
      const reader = new MessageReader(buffer);
      const readRoot = reader.getRoot(0, 1);
      const readList = readRoot.getList<number>(0, ElementSize.FOUR_BYTES)!;

      const items: number[] = [];
      for (const item of readList) {
        items.push(item);
      }
      expect(items).toEqual([10, 20, 30]);
    });

    it('should handle empty list iteration', () => {
      const builder = new MessageBuilder();
      const root = builder.initRoot(0, 1);
      root.initList<number>(0, ElementSize.FOUR_BYTES, 0);

      const buffer = builder.toArrayBuffer();
      const reader = new MessageReader(buffer);
      const readRoot = reader.getRoot(0, 1);
      const readList = readRoot.getList<number>(0, ElementSize.FOUR_BYTES)!;

      const items: number[] = [];
      for (const item of readList) {
        items.push(item);
      }
      expect(items).toEqual([]);
    });
  });

  describe('MessageReader Edge Cases', () => {
    it('should handle empty buffer', () => {
      const reader = new MessageReader(new ArrayBuffer(0));
      expect(reader.segmentCount).toBe(0);
    });

    it('should handle buffer too small for header', () => {
      const reader = new MessageReader(new ArrayBuffer(4));
      expect(reader.segmentCount).toBe(0);
    });

    it('should handle message with invalid segment count in strict mode', () => {
      // 创建消息头部，设置段数量为 100（超过默认限制 64）
      const buffer = new ArrayBuffer(8);
      const view = new DataView(buffer);
      view.setUint32(0, 99, true); // segmentCount - 1 = 99, 所以 segmentCount = 100
      view.setUint32(4, 1, true); // 第一段大小为 1 个字

      // 非严格模式下应该截断
      const reader1 = new MessageReader(buffer);
      expect(reader1.segmentCount).toBe(0);

      // 严格模式下应该抛出错误
      expect(() => new MessageReader(buffer, { strictMode: true })).toThrow(
        'Segment count (100) exceeds maximum allowed'
      );
    });

    it('should handle oversized message in strict mode', () => {
      // 创建一个宣称很大但实际很小的消息
      const buffer = new ArrayBuffer(8);
      const view = new DataView(buffer);
      view.setUint32(0, 0, true); // 单段
      view.setUint32(4, 0xffffffff, true); // 巨大的段大小

      expect(() => new MessageReader(buffer, { strictMode: true, maxTotalSize: 1024 })).toThrow(
        'Total message size'
      );
    });

    it('should handle message that ends prematurely', () => {
      // 创建消息，声称有多个段，但数据不够
      const buffer = new ArrayBuffer(12);
      const view = new DataView(buffer);
      view.setUint32(0, 2, true); // 3 个段
      view.setUint32(4, 1, true); // 第一段 1 个字
      view.setUint32(8, 1, true); // 第二段 1 个字
      // 缺少第三段大小和实际数据

      // 非严格模式下应该处理
      const reader = new MessageReader(buffer);
      expect(reader.segmentCount).toBeLessThanOrEqual(2);

      // 严格模式下应该抛出错误
      expect(() => new MessageReader(buffer, { strictMode: true })).toThrow(
        'Message ended prematurely'
      );
    });

    it('should handle insufficient segment table data', () => {
      // 创建消息，段表数据不完整
      const buffer = new ArrayBuffer(9);
      const view = new DataView(buffer);
      view.setUint32(0, 5, true); // 6 个段
      view.setUint32(4, 1, true);
      // 只有 9 字节，但声称有 6 个段

      // 消息过早结束会先被检测到
      expect(() => new MessageReader(buffer, { strictMode: true })).toThrow(
        'Message ended prematurely'
      );
    });

    it('should handle insufficient segment data', () => {
      // 创建消息，段数据不完整
      const buffer = new ArrayBuffer(16);
      const view = new DataView(buffer);
      view.setUint32(0, 0, true); // 1 个段
      view.setUint32(4, 100, true); // 声称有 100 个字
      // 实际数据只有 8 字节

      // 非严格模式下应该返回已读取的部分
      const reader = new MessageReader(buffer);
      expect(reader.segmentCount).toBe(0); // 因为数据不足，没有成功创建段

      // 严格模式下应该抛出错误
      expect(() => new MessageReader(buffer, { strictMode: true })).toThrow(
        'Insufficient data for segment'
      );
    });

    it('should get security options', () => {
      const builder = new MessageBuilder();
      const buffer = builder.toArrayBuffer();
      const reader = new MessageReader(buffer, { strictMode: true, maxSegments: 32 });
      const options = reader.getSecurityOptions();
      expect(options.strictMode).toBe(true);
      expect(options.maxSegments).toBe(32);
    });
  });

  describe('StructReader Boundary Checks', () => {
    it('should return default values when reading out of bounds', () => {
      const builder = new MessageBuilder();
      const root = builder.initRoot(1, 0); // 1 个数据字 = 8 字节
      root.setInt32(0, 42);

      const buffer = builder.toArrayBuffer();
      const reader = new MessageReader(buffer);
      const readRoot = reader.getRoot(1, 0);

      // 读取超出数据区域应该返回默认值
      expect(readRoot.getInt32(4)).toBe(0); // 超出 4 字节
      expect(readRoot.getBool(64)).toBe(false); // 超出位偏移
    });

    it('should handle large positive offsets gracefully', () => {
      const builder = new MessageBuilder();
      const root = builder.initRoot(1, 0);
      root.setInt32(0, 42);

      const buffer = builder.toArrayBuffer();
      const reader = new MessageReader(buffer);
      const readRoot = reader.getRoot(1, 0);

      // 大偏移应该返回默认值
      expect(readRoot.getInt32(1000)).toBe(0);
      expect(readRoot.getBool(1000)).toBe(false);
    });
  });

  describe('setData Method', () => {
    it('should set empty data', () => {
      const builder = new MessageBuilder();
      const root = builder.initRoot(0, 1);
      root.setData(0, new Uint8Array(0));

      const buffer = builder.toArrayBuffer();
      const reader = new MessageReader(buffer);
      const readRoot = reader.getRoot(0, 1);
      const data = readRoot.getData(0);
      expect(data).toEqual(new Uint8Array(0));
    });

    it('should set non-empty data', () => {
      const builder = new MessageBuilder();
      const root = builder.initRoot(0, 1);
      const testData = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]);
      root.setData(0, testData);

      const buffer = builder.toArrayBuffer();
      const reader = new MessageReader(buffer);
      const readRoot = reader.getRoot(0, 1);
      const data = readRoot.getData(0);
      expect(data).toEqual(testData);
    });

    it('should return undefined for null data pointer', () => {
      const builder = new MessageBuilder();
      const _root = builder.initRoot(0, 1);
      // 不设置数据，指针为 null

      const buffer = builder.toArrayBuffer();
      const reader = new MessageReader(buffer);
      const readRoot = reader.getRoot(0, 1);
      expect(readRoot.getData(0)).toBeUndefined();
    });
  });

  describe('Text Edge Cases', () => {
    it('should handle empty text', () => {
      const builder = new MessageBuilder();
      const root = builder.initRoot(0, 1);
      root.setText(0, '');

      const buffer = builder.toArrayBuffer();
      const reader = new MessageReader(buffer);
      const readRoot = reader.getRoot(0, 1);
      expect(readRoot.getText(0)).toBe('');
    });

    it('should handle null text pointer', () => {
      const builder = new MessageBuilder();
      const _root = builder.initRoot(0, 1);
      // 不设置文本

      const buffer = builder.toArrayBuffer();
      const reader = new MessageReader(buffer);
      const readRoot = reader.getRoot(0, 1);
      expect(readRoot.getText(0)).toBe('');
    });
  });

  describe('Union Edge Cases', () => {
    it('should return undefined for unknown variant', () => {
      const builder = new MessageBuilder();
      const root = builder.initRoot(2, 0);
      const union = createUnionBuilder(root, 0);
      union.setTag(999); // 未知的 tag

      const buffer = builder.toArrayBuffer();
      const reader = new MessageReader(buffer);
      const readRoot = reader.getRoot(2, 0);
      const readUnion = createUnionReader(readRoot, 0, { 0: 'A', 1: 'B' });

      expect(readUnion.getVariantName()).toBeUndefined();
      expect(readUnion.is(0)).toBe(false);
      expect(readUnion.is(999)).toBe(true);
    });

    it('should init variant with callback', () => {
      const builder = new MessageBuilder();
      const root = builder.initRoot(2, 0);
      const union = createUnionBuilder(root, 0);

      let callbackCalled = false;
      union.initVariant(1, () => {
        callbackCalled = true;
        root.setInt32(4, 200);
      });

      expect(callbackCalled).toBe(true);
      expect(union.getTag()).toBe(1);

      const buffer = builder.toArrayBuffer();
      const reader = new MessageReader(buffer);
      const readRoot = reader.getRoot(2, 0);
      expect(readRoot.getInt32(4)).toBe(200);
    });
  });

  describe('MessageBuilder Root Already Set', () => {
    it('should throw error when initializing root twice', () => {
      const builder = new MessageBuilder();
      builder.initRoot(1, 0);
      expect(() => builder.initRoot(1, 0)).toThrow('Root already initialized');
    });
  });
});
