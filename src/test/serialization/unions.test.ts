/**
 * 联合体 (Union) 测试
 */

import { describe, it, expect } from 'vitest';
import { MessageReader, MessageBuilder, createUnionReader, createUnionBuilder } from '../../index.js';

describe('Union Basics', () => {
  it('should handle union with int variant', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(2, 0);
    const union = createUnionBuilder(root, 0);
    
    union.setTag(0); // Select first variant
    root.setInt32(4, 42);
    
    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer).getRoot(2, 0);
    const readUnion = createUnionReader(reader, 0, { 0: 'intVal', 1: 'textVal' });
    
    expect(readUnion.getTag()).toBe(0);
    expect(readUnion.getVariantName()).toBe('intVal');
    expect(readUnion.is(0)).toBe(true);
    expect(reader.getInt32(4)).toBe(42);
  });

  it('should handle union with text variant', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(1, 1);
    const union = createUnionBuilder(root, 0);
    
    union.setTag(1); // Select second variant
    root.setText(0, 'union text');
    
    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer).getRoot(1, 1);
    const readUnion = createUnionReader(reader, 0, { 0: 'intVal', 1: 'textVal' });
    
    expect(readUnion.getTag()).toBe(1);
    expect(readUnion.getVariantName()).toBe('textVal');
    expect(readUnion.is(1)).toBe(true);
    expect(reader.getText(0)).toBe('union text');
  });

  it('should handle union switching', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(2, 1);
    const union = createUnionBuilder(root, 0);
    
    // Start with int variant
    union.setTag(0);
    root.setInt32(4, 100);
    
    // Switch to text variant
    union.setTag(1);
    root.setText(0, 'switched');
    
    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer).getRoot(2, 1);
    const readUnion = createUnionReader(reader, 0, { 0: 'intVal', 1: 'textVal' });
    
    expect(readUnion.getTag()).toBe(1);
    expect(reader.getText(0)).toBe('switched');
  });
});

describe('Union Edge Cases', () => {
  it('should handle union with default tag', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(2, 0);
    // Don't explicitly set tag - should default to 0
    
    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer).getRoot(2, 0);
    const readUnion = createUnionReader(reader, 0, { 0: 'default', 1: 'other' });
    
    expect(readUnion.getTag()).toBe(0);
    expect(readUnion.getVariantName()).toBe('default');
  });

  it('should handle union with multiple variants', () => {
    const variants = {
      0: 'none',
      1: 'intVal',
      2: 'textVal',
      3: 'boolVal',
      4: 'structVal'
    };
    
    const builder = new MessageBuilder();
    const root = builder.initRoot(2, 1);
    const union = createUnionBuilder(root, 0);
    
    // Test each variant
    for (let i = 0; i < 5; i++) {
      union.setTag(i);
      expect(union.getTag()).toBe(i);
    }
  });

  it('should handle nested union in struct', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(3, 1);
    
    // Outer struct data
    root.setInt32(8, 999);
    
    // Union at discriminant position 0
    const union = createUnionBuilder(root, 0);
    union.setTag(1);
    root.setText(0, 'nested union');
    
    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer).getRoot(3, 1);
    
    expect(reader.getInt32(8)).toBe(999);
    
    const readUnion = createUnionReader(reader, 0, { 0: 'a', 1: 'b' });
    expect(readUnion.getTag()).toBe(1);
    expect(reader.getText(0)).toBe('nested union');
  });
});

describe('Group Union', () => {
  it('should handle union with group-like fields', () => {
    // Simulating a union where each variant has different fields
    const builder = new MessageBuilder();
    const root = builder.initRoot(3, 1);
    const union = createUnionBuilder(root, 0);
    
    // Variant 0: uses fields at offset 4 and 8
    union.setTag(0);
    root.setInt32(4, 100);
    root.setFloat64(8, 3.14);
    
    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer).getRoot(3, 1);
    const readUnion = createUnionReader(reader, 0, { 0: 'numeric', 1: 'textual' });
    
    expect(readUnion.getTag()).toBe(0);
    expect(reader.getInt32(4)).toBe(100);
    expect(reader.getFloat64(8)).toBeCloseTo(3.14, 2);
  });
});
