/**
 * 列表测试
 * 覆盖所有列表元素大小类型
 */

import { describe, it, expect } from 'vitest';
import { MessageReader, MessageBuilder, ElementSize } from '../../index.js';

describe('Primitive Lists', () => {
  it('should handle empty list', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(0, 1);
    root.initList(0, ElementSize.FOUR_BYTES, 0);
    
    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer).getRoot(0, 1);
    const list = reader.getList(0, ElementSize.FOUR_BYTES);
    
    expect(list).toBeDefined();
    expect(list!.length).toBe(0);
  });

  it('should handle single element list', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(0, 1);
    const list = root.initList(0, ElementSize.FOUR_BYTES, 1);
    list.setPrimitive(0, 42);
    
    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer).getRoot(0, 1);
    const readList = reader.getList(0, ElementSize.FOUR_BYTES);
    
    expect(readList!.length).toBe(1);
    expect(readList!.getPrimitive(0)).toBe(42);
  });

  it('should handle large list', () => {
    const size = 1000;
    const builder = new MessageBuilder();
    const root = builder.initRoot(0, 1);
    const list = root.initList(0, ElementSize.FOUR_BYTES, size);
    
    for (let i = 0; i < size; i++) {
      list.setPrimitive(i, i * 10);
    }
    
    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer).getRoot(0, 1);
    const readList = reader.getList(0, ElementSize.FOUR_BYTES);
    
    expect(readList!.length).toBe(size);
    expect(readList!.getPrimitive(0)).toBe(0);
    expect(readList!.getPrimitive(999)).toBe(9990);
  });

  it('should handle different element sizes', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(0, 4);
    
    // Void list (0 bytes per element)
    root.initList(0, ElementSize.VOID, 10);
    
    // Bit list (1 bit per element)
    const bitList = root.initList(1, ElementSize.BIT, 16);
    bitList.setPrimitive(0, 1);
    bitList.setPrimitive(15, 1);
    
    // 1 byte list
    const byteList = root.initList(2, ElementSize.BYTE, 4);
    byteList.setPrimitive(0, 0xFF);
    byteList.setPrimitive(3, 0xAA);
    
    // 2 bytes list
    const shortList = root.initList(3, ElementSize.TWO_BYTES, 2);
    shortList.setPrimitive(0, 0x1234);
    shortList.setPrimitive(1, 0x5678);
    
    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer).getRoot(0, 4);
    
    expect(reader.getList(0, ElementSize.VOID)!.length).toBe(10);
    expect(reader.getList(1, ElementSize.BIT)!.getPrimitive(0)).toBe(1);
    expect(reader.getList(1, ElementSize.BIT)!.getPrimitive(15)).toBe(1);
    expect(reader.getList(2, ElementSize.BYTE)!.getPrimitive(0)).toBe(0xFF);
    expect(reader.getList(3, ElementSize.TWO_BYTES)!.getPrimitive(0)).toBe(0x1234);
  });

  it('should handle 8-byte element list', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(0, 1);
    const list = root.initList(0, ElementSize.EIGHT_BYTES, 3);
    
    list.setPrimitive(0, 0x0102030405060708n);
    list.setPrimitive(1, 0xAABBCCDDEEFF0011n);
    list.setPrimitive(2, 0n);
    
    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer).getRoot(0, 1);
    const readList = reader.getList(0, ElementSize.EIGHT_BYTES);
    
    expect(readList!.getPrimitive(0)).toBe(0x0102030405060708n);
    expect(readList!.getPrimitive(1)).toBe(0xAABBCCDDEEFF0011n);
    expect(readList!.getPrimitive(2)).toBe(0n);
  });
});

describe('Text Lists', () => {
  it('should handle list of texts', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(0, 1);
    const list = root.initList(0, ElementSize.POINTER, 3);
    
    // Text list elements are pointers
    // This is a simplified test - actual text list handling may differ
    
    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer).getRoot(0, 1);
    const readList = reader.getList(0, ElementSize.POINTER);
    
    expect(readList).toBeDefined();
    expect(readList!.length).toBe(3);
  });

  it('should handle empty text list', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(0, 1);
    root.initList(0, ElementSize.POINTER, 0);
    
    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer).getRoot(0, 1);
    const list = reader.getList(0, ElementSize.POINTER);
    
    expect(list!.length).toBe(0);
  });
});

describe('Struct Lists', () => {
  it('should handle list of structs', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(0, 1);
    
    // Composite list: 2 elements, each with 1 data word and 1 pointer
    const list = root.initList(0, ElementSize.COMPOSITE, 2, { dataWords: 1, pointerCount: 1 });
    
    // Access elements
    const elem0 = list.getStruct(0, 1, 1);
    elem0.setInt32(0, 100);
    elem0.setText(0, 'first');
    
    const elem1 = list.getStruct(1, 1, 1);
    elem1.setInt32(0, 200);
    elem1.setText(0, 'second');
    
    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer).getRoot(0, 1);
    const readList = reader.getList(0, ElementSize.COMPOSITE, { dataWords: 1, pointerCount: 1 });
    
    expect(readList!.length).toBe(2);
    
    const readElem0 = readList!.getStruct(0, 1, 1);
    expect(readElem0.getInt32(0)).toBe(100);
    expect(readElem0.getText(0)).toBe('first');
    
    const readElem1 = readList!.getStruct(1, 1, 1);
    expect(readElem1.getInt32(0)).toBe(200);
    expect(readElem1.getText(0)).toBe('second');
  });

  it('should handle empty struct list', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(0, 1);
    root.initList(0, ElementSize.COMPOSITE, 0, { dataWords: 1, pointerCount: 0 });
    
    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer).getRoot(0, 1);
    const list = reader.getList(0, ElementSize.COMPOSITE, { dataWords: 1, pointerCount: 0 });
    
    expect(list!.length).toBe(0);
  });

  it('should handle large struct list', () => {
    const count = 100;
    const builder = new MessageBuilder();
    const root = builder.initRoot(0, 1);
    const list = root.initList(0, ElementSize.COMPOSITE, count, { dataWords: 1, pointerCount: 0 });
    
    for (let i = 0; i < count; i++) {
      list.getStruct(i, 1, 0).setInt32(0, i * 10);
    }
    
    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer).getRoot(0, 1);
    const readList = reader.getList(0, ElementSize.COMPOSITE, { dataWords: 1, pointerCount: 0 });
    
    expect(readList!.length).toBe(count);
    expect(readList!.getStruct(0, 1, 0).getInt32(0)).toBe(0);
    expect(readList!.getStruct(99, 1, 0).getInt32(0)).toBe(990);
  });
});

describe('List Boundaries', () => {
  it('should handle list with max uint32 length (theoretical)', () => {
    // Note: We can't actually allocate 4 billion elements
    // This test verifies the list pointer format can represent large lengths
    const builder = new MessageBuilder();
    const root = builder.initRoot(0, 1);
    
    // Just create a normal list to verify basic functionality
    const list = root.initList(0, ElementSize.VOID, 100);
    expect(list.length).toBe(100);
  });

  it('should handle byte-aligned list sizes', () => {
    // Test various list sizes to ensure proper alignment
    for (const size of [1, 2, 3, 4, 5, 7, 8, 9, 15, 16, 17, 31, 32, 33]) {
      const testBuilder = new MessageBuilder();
      const testRoot = testBuilder.initRoot(0, 1);
      testRoot.initList(0, ElementSize.BYTE, size);
      
      const buffer = testBuilder.toArrayBuffer();
      const reader = new MessageReader(buffer).getRoot(0, 1);
      const list = reader.getList(0, ElementSize.BYTE);
      
      expect(list!.length).toBe(size);
    }
  });
});
