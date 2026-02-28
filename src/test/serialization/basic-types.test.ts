/**
 * 基础数据类型测试
 * 覆盖所有 Cap'n Proto 基础类型的读写
 */

import { describe, it, expect } from 'vitest';
import { MessageReader, MessageBuilder } from '../../index.js';

describe('Basic Types - Integers', () => {
  it('should handle int8 min/max values', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(1, 0);
    
    root.setInt8(0, 127);
    root.setInt8(1, -128);
    
    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer).getRoot(1, 0);
    
    expect(reader.getInt8(0)).toBe(127);
    expect(reader.getInt8(1)).toBe(-128);
  });

  it('should handle int16 min/max values', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(1, 0);
    
    root.setInt16(0, 32767);
    root.setInt16(2, -32768);
    
    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer).getRoot(1, 0);
    
    expect(reader.getInt16(0)).toBe(32767);
    expect(reader.getInt16(2)).toBe(-32768);
  });

  it('should handle int32 min/max values', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(1, 0);
    
    root.setInt32(0, 2147483647);
    root.setInt32(4, -2147483648);
    
    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer).getRoot(1, 0);
    
    expect(reader.getInt32(0)).toBe(2147483647);
    expect(reader.getInt32(4)).toBe(-2147483648);
  });

  it('should handle int64 min/max values', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(2, 0);
    
    root.setInt64(0, 9223372036854775807n);
    root.setInt64(8, -9223372036854775808n);
    
    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer).getRoot(2, 0);
    
    expect(reader.getInt64(0)).toBe(9223372036854775807n);
    expect(reader.getInt64(8)).toBe(-9223372036854775808n);
  });

  it('should handle uint8 max value', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(1, 0);
    
    root.setUint8(0, 255);
    root.setUint8(1, 0);
    
    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer).getRoot(1, 0);
    
    expect(reader.getUint8(0)).toBe(255);
    expect(reader.getUint8(1)).toBe(0);
  });

  it('should handle uint16 max value', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(1, 0);
    
    root.setUint16(0, 65535);
    
    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer).getRoot(1, 0);
    
    expect(reader.getUint16(0)).toBe(65535);
  });

  it('should handle uint32 max value', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(1, 0);
    
    root.setUint32(0, 4294967295);
    
    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer).getRoot(1, 0);
    
    expect(reader.getUint32(0)).toBe(4294967295);
  });

  it('should handle uint64 max value', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(2, 0);
    
    root.setUint64(0, 18446744073709551615n);
    
    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer).getRoot(2, 0);
    
    expect(reader.getUint64(0)).toBe(18446744073709551615n);
  });
});

describe('Basic Types - Floats', () => {
  it('should handle float32 special values', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(2, 0);
    
    root.setFloat32(0, 0);
    root.setFloat32(4, -0);
    root.setFloat32(8, Infinity);
    root.setFloat32(12, -Infinity);
    
    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer).getRoot(2, 0);
    
    expect(reader.getFloat32(0)).toBe(0);
    expect(Object.is(reader.getFloat32(4), -0)).toBe(true);
    expect(reader.getFloat32(8)).toBe(Infinity);
    expect(reader.getFloat32(12)).toBe(-Infinity);
  });

  it('should handle float32 NaN', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(1, 0);
    
    root.setFloat32(0, NaN);
    
    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer).getRoot(1, 0);
    
    expect(Number.isNaN(reader.getFloat32(0))).toBe(true);
  });

  it('should handle float64 special values', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(2, 0);
    
    root.setFloat64(0, Number.MAX_VALUE);
    root.setFloat64(8, Number.MIN_VALUE);
    
    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer).getRoot(2, 0);
    
    expect(reader.getFloat64(0)).toBe(Number.MAX_VALUE);
    expect(reader.getFloat64(8)).toBe(Number.MIN_VALUE);
  });

  it('should handle float64 precision', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(2, 0);
    
    const pi = 3.14159265358979323846;
    root.setFloat64(0, pi);
    
    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer).getRoot(2, 0);
    
    expect(reader.getFloat64(0)).toBeCloseTo(pi, 15);
  });
});

describe('Basic Types - Booleans', () => {
  it('should handle all 8 boolean positions in a byte', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(1, 0);
    
    // Set all 8 bits in first byte
    for (let i = 0; i < 8; i++) {
      root.setBool(i, i % 2 === 0);
    }
    
    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer).getRoot(1, 0);
    
    for (let i = 0; i < 8; i++) {
      expect(reader.getBool(i)).toBe(i % 2 === 0);
    }
  });

  it('should handle booleans across multiple bytes', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(2, 0);
    
    root.setBool(0, true);   // byte 0, bit 0
    root.setBool(7, true);   // byte 0, bit 7
    root.setBool(8, true);   // byte 1, bit 0
    root.setBool(15, true);  // byte 1, bit 7
    
    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer).getRoot(2, 0);
    
    expect(reader.getBool(0)).toBe(true);
    expect(reader.getBool(7)).toBe(true);
    expect(reader.getBool(8)).toBe(true);
    expect(reader.getBool(15)).toBe(true);
    expect(reader.getBool(1)).toBe(false);
    expect(reader.getBool(9)).toBe(false);
  });
});

describe('Basic Types - Mixed', () => {
  it('should handle mixed types in same struct', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(4, 1);
    
    root.setInt32(0, 42);
    root.setFloat64(8, 3.14159);
    root.setBool(64, true);
    root.setText(0, 'hello');
    
    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer).getRoot(4, 1);
    
    expect(reader.getInt32(0)).toBe(42);
    expect(reader.getFloat64(8)).toBeCloseTo(3.14159, 5);
    expect(reader.getBool(64)).toBe(true);
    expect(reader.getText(0)).toBe('hello');
  });
});
