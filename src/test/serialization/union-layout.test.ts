/**
 * Union 布局测试
 * 验证 Union discriminant 和数据位置的编码
 */

import { describe, it, expect } from 'vitest';
import { MessageReader, MessageBuilder, createUnionReader, createUnionBuilder } from '../../index.js';

describe('Union Layout', () => {
  it('should place discriminant at correct offset', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(2, 0);
    const union = createUnionBuilder(root, 0);
    
    // Set tag to 5
    union.setTag(5);
    
    const buffer = builder.toArrayBuffer();
    const view = new DataView(buffer);
    
    // Buffer layout:
    // Word 0: Header (segmentCount-1, segmentSize)
    // Word 1: Root struct pointer
    // Word 2+: Struct data (discriminant at byte 0 of struct = offset 16)
    const discriminant = view.getUint16(16, true);
    
    expect(discriminant).toBe(5);
  });

  it('should handle union at non-zero discriminant offset', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(4, 0);
    
    // Union at discriminant offset 4 (bytes 4-5 of struct data)
    const union = createUnionBuilder(root, 4);
    union.setTag(3);
    
    // Set some data at offset 8
    root.setInt32(8, 42);
    
    const buffer = builder.toArrayBuffer();
    const view = new DataView(buffer);
    
    // Struct data starts at offset 16 (word 2)
    // Discriminant at offset 16 + 4 = 20
    const discriminant = view.getUint16(20, true);
    expect(discriminant).toBe(3);
    
    // Data at offset 16 + 8 = 24
    const data = view.getInt32(24, true);
    expect(data).toBe(42);
  });

  it('should handle multiple unions in same struct', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(4, 0);
    
    // First union at offset 0
    const union1 = createUnionBuilder(root, 0);
    union1.setTag(1);
    
    // Second union at offset 2
    const union2 = createUnionBuilder(root, 2);
    union2.setTag(2);
    
    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer).getRoot(4, 0);
    
    const readUnion1 = createUnionReader(reader, 0, { 0: 'A', 1: 'B' });
    const readUnion2 = createUnionReader(reader, 2, { 0: 'X', 1: 'Y', 2: 'Z' });
    
    expect(readUnion1.getTag()).toBe(1);
    expect(readUnion1.getVariantName()).toBe('B');
    
    expect(readUnion2.getTag()).toBe(2);
    expect(readUnion2.getVariantName()).toBe('Z');
  });

  it('should verify union discriminant is UInt16', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(1, 0);
    const union = createUnionBuilder(root, 0);
    
    // Max UInt16 value
    union.setTag(65535);
    
    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer).getRoot(1, 0);
    const readUnion = createUnionReader(reader, 0, {});
    
    expect(readUnion.getTag()).toBe(65535);
  });
});
