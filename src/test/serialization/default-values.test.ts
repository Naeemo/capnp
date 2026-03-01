/**
 * 默认值（XOR 编码）测试
 *
 * Cap'n Proto 使用 XOR 编码来支持默认值：
 * - 写入时：stored_value = actual_value XOR default_value
 * - 读取时：actual_value = stored_value XOR default_value
 * - 如果 actual_value == default_value，则 stored_value = 0（压缩友好）
 */

import { describe, expect, it } from 'vitest';
import { StructBuilder } from '../../core/message-builder.js';
import { StructReader } from '../../core/message-reader.js';
import { MessageBuilder, MessageReader } from '../../index.js';

describe('Default Values - XOR Encoding', () => {
  describe('Basic XOR principle', () => {
    it('should XOR with default on write and read', () => {
      // 创建一个支持默认值的 struct
      // 假设默认值是 100
      const defaultValue = 100;
      const actualValue = 42;

      // 写入时 XOR
      const storedValue = actualValue ^ defaultValue;

      // 读取时 XOR 回来
      const readValue = storedValue ^ defaultValue;

      expect(readValue).toBe(actualValue);
    });

    it('should store zero when value equals default', () => {
      const defaultValue = 100;
      const actualValue = 100;

      // 写入时 XOR
      const storedValue = actualValue ^ defaultValue;

      // 当值等于默认值时，存储为零
      expect(storedValue).toBe(0);
    });
  });

  describe('StructReader with defaults', () => {
    it('should read uint32 with default value', () => {
      const builder = new MessageBuilder();
      const root = builder.initRoot(1, 0);

      // 写入 42，假设默认值是 100
      // stored = 42 XOR 100 = 74
      root.setUint32(0, 42 ^ 100);

      const buffer = builder.toArrayBuffer();
      const reader = new MessageReader(buffer).getRoot(1, 0);

      // 读取时 XOR 默认值
      const storedValue = reader.getUint32(0);
      const actualValue = storedValue ^ 100;

      expect(actualValue).toBe(42);
    });

    it('should read int32 with default value', () => {
      const builder = new MessageBuilder();
      const root = builder.initRoot(1, 0);

      // 写入 -10，假设默认值是 100
      const defaultValue = 100;
      const actualValue = -10;
      // stored = actual XOR default (使用无符号32位)
      const storedValue = (actualValue >>> 0) ^ defaultValue;

      root.setUint32(0, storedValue);

      const buffer = builder.toArrayBuffer();
      const reader = new MessageReader(buffer).getRoot(1, 0);

      // 读取时 XOR 默认值
      const readStored = reader.getUint32(0);
      const readActual = (readStored ^ defaultValue) | 0; // 转回有符号

      expect(readActual).toBe(actualValue);
    });

    it('should read float64 with default value', () => {
      const builder = new MessageBuilder();
      const root = builder.initRoot(2, 0);

      // float64 的 XOR 需要特殊处理
      // 使用 DataView 来转换 float64 和 uint64
      const defaultView = new DataView(new ArrayBuffer(8));
      const actualView = new DataView(new ArrayBuffer(8));

      defaultView.setFloat64(0, Math.PI, true);
      actualView.setFloat64(0, Math.E, true);

      const defaultBits = defaultView.getBigUint64(0, true);
      const actualBits = actualView.getBigUint64(0, true);

      // XOR 存储
      const storedBits = actualBits ^ defaultBits;

      root.setUint64(0, storedBits);

      const buffer = builder.toArrayBuffer();
      const reader = new MessageReader(buffer).getRoot(2, 0);

      // XOR 读取
      const readStored = reader.getUint64(0);
      const readBits = readStored ^ defaultBits;

      const resultView = new DataView(new ArrayBuffer(8));
      resultView.setBigUint64(0, readBits, true);
      const readValue = resultView.getFloat64(0, true);

      expect(readValue).toBeCloseTo(Math.E, 5);
    });
  });

  describe('Boolean with defaults', () => {
    it('should handle bool default value', () => {
      const builder = new MessageBuilder();
      const root = builder.initRoot(1, 0);

      // 假设 bool 默认值是 true
      // 存储时：actual XOR default
      // false XOR true = true (需要翻转)
      // true XOR true = false (存储为 0)

      // 写入 false，默认值 true
      // stored = false XOR true = true
      root.setBool(0, true); // bit 0 = 1

      const buffer = builder.toArrayBuffer();
      const reader = new MessageReader(buffer).getRoot(1, 0);

      const storedBit = reader.getBool(0);
      const actualValue = storedBit !== true; // XOR with default (true)

      expect(actualValue).toBe(false);
    });
  });

  describe('Zero as default (common case)', () => {
    it('should work normally when default is zero', () => {
      // 当默认值为 0 时，XOR 不改变值
      const builder = new MessageBuilder();
      const root = builder.initRoot(1, 0);

      root.setUint32(0, 42); // stored = 42 XOR 0 = 42

      const buffer = builder.toArrayBuffer();
      const reader = new MessageReader(buffer).getRoot(1, 0);

      expect(reader.getUint32(0)).toBe(42);
    });
  });
});
