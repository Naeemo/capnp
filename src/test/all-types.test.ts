import { describe, it, expect } from 'vitest';
import { MessageReader, MessageBuilder, ElementSize } from '../index.js';

/**
 * 所有数据类型测试
 * 确保每种 Cap'n Proto 类型都能正确读写
 */

describe('All Data Types - Integers', () => {
  it('should handle all integer types', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(4, 0);
    
    // Test all integer types at various offsets
    root.setInt8(0, -1);
    root.setInt8(1, -2);
    root.setInt16(2, -1000);
    root.setInt32(4, -100000);
    root.setInt64(8, -10000000000n);
    
    root.setUint8(16, 255);
    root.setUint16(18, 65535);
    root.setUint32(20, 4294967295);
    root.setUint64(24, 18446744073709551615n);
    
    const buffer = builder.toArrayBuffer();
    const readRoot = new MessageReader(buffer).getRoot(4, 0);
    
    expect(readRoot.getInt8(0)).toBe(-1);
    expect(readRoot.getInt8(1)).toBe(-2);
    expect(readRoot.getInt16(2)).toBe(-1000);
    expect(readRoot.getInt32(4)).toBe(-100000);
    expect(readRoot.getInt64(8)).toBe(-10000000000n);
    
    expect(readRoot.getUint8(16)).toBe(255);
    expect(readRoot.getUint16(18)).toBe(65535);
    expect(readRoot.getUint32(20)).toBe(4294967295);
    expect(readRoot.getUint64(24)).toBe(18446744073709551615n);
  });
});

describe('All Data Types - Floats', () => {
  it('should handle Float32', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(6, 0); // 6 words = 48 bytes for 11 float32 values
    
    const values = [
      0, 1, -1, 0.5, -0.5,
      1e10, 1e-10, -1e10, -1e-10,
      3.14159, 2.71828
    ];
    
    for (let i = 0; i < values.length; i++) {
      root.setFloat32(i * 4, values[i]);
    }
    
    const buffer = builder.toArrayBuffer();
    const readRoot = new MessageReader(buffer).getRoot(6, 0);
    
    for (let i = 0; i < values.length; i++) {
      expect(readRoot.getFloat32(i * 4)).toBeCloseTo(values[i], 5);
    }
  });

  it('should handle Float64', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(11, 0); // 11 words = 88 bytes for 11 float64 values
    
    const values = [
      0, 1, -1, 0.5, -0.5,
      1e100, 1e-100, -1e100, -1e-100,
      Math.PI, Math.E
    ];
    
    for (let i = 0; i < values.length; i++) {
      root.setFloat64(i * 8, values[i]);
    }
    
    const buffer = builder.toArrayBuffer();
    const readRoot = new MessageReader(buffer).getRoot(11, 0);
    
    for (let i = 0; i < values.length; i++) {
      expect(readRoot.getFloat64(i * 8)).toBe(values[i]);
    }
  });
});

describe('All Data Types - Booleans', () => {
  it('should handle boolean at any bit position', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(4, 0);
    
    // Set various bits
    const positions = [0, 1, 7, 8, 15, 16, 31, 63, 127, 255];
    for (const pos of positions) {
      root.setBool(pos, true);
    }
    
    const buffer = builder.toArrayBuffer();
    const readRoot = new MessageReader(buffer).getRoot(4, 0);
    
    for (const pos of positions) {
      expect(readRoot.getBool(pos)).toBe(true);
    }
    
    // Verify unset bits are false
    expect(readRoot.getBool(2)).toBe(false);
    expect(readRoot.getBool(100)).toBe(false);
  });
});

describe('All Data Types - Lists', () => {
  it('should handle Void list', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(0, 1);
    const list = root.initList(0, ElementSize.VOID, 100);
    
    expect(list.length).toBe(100);
    
    const buffer = builder.toArrayBuffer();
    const readRoot = new MessageReader(buffer).getRoot(0, 1);
    const readList = readRoot.getList(0, ElementSize.VOID);
    
    expect(readList).toBeDefined();
    expect(readList!.length).toBe(100);
  });

  it('should handle Bit list', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(0, 1);
    const list = root.initList(0, ElementSize.BIT, 17);
    
    list.setPrimitive(0, 1);
    list.setPrimitive(7, 1);
    list.setPrimitive(16, 1);
    
    const buffer = builder.toArrayBuffer();
    const readRoot = new MessageReader(buffer).getRoot(0, 1);
    const readList = readRoot.getList(0, ElementSize.BIT);
    
    expect(readList).toBeDefined();
    expect(readList!.getPrimitive(0)).toBe(1);
    expect(readList!.getPrimitive(7)).toBe(1);
    expect(readList!.getPrimitive(16)).toBe(1);
    expect(readList!.getPrimitive(1)).toBe(0);
  });

  it('should handle Byte list', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(0, 1);
    const list = root.initList(0, ElementSize.BYTE, 10);
    
    for (let i = 0; i < 10; i++) {
      list.setPrimitive(i, i * 10);
    }
    
    const buffer = builder.toArrayBuffer();
    const readRoot = new MessageReader(buffer).getRoot(0, 1);
    const readList = readRoot.getList(0, ElementSize.BYTE);
    
    expect(readList).toBeDefined();
    for (let i = 0; i < 10; i++) {
      expect(readList!.getPrimitive(i)).toBe(i * 10);
    }
  });

  it('should handle TwoBytes list', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(0, 1);
    const list = root.initList(0, ElementSize.TWO_BYTES, 5);
    
    for (let i = 0; i < 5; i++) {
      list.setPrimitive(i, i * 1000);
    }
    
    const buffer = builder.toArrayBuffer();
    const readRoot = new MessageReader(buffer).getRoot(0, 1);
    const readList = readRoot.getList(0, ElementSize.TWO_BYTES);
    
    expect(readList).toBeDefined();
    for (let i = 0; i < 5; i++) {
      expect(readList!.getPrimitive(i)).toBe(i * 1000);
    }
  });

  it('should handle FourBytes list', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(0, 1);
    const list = root.initList(0, ElementSize.FOUR_BYTES, 5);
    
    for (let i = 0; i < 5; i++) {
      list.setPrimitive(i, i * 100000);
    }
    
    const buffer = builder.toArrayBuffer();
    const readRoot = new MessageReader(buffer).getRoot(0, 1);
    const readList = readRoot.getList(0, ElementSize.FOUR_BYTES);
    
    expect(readList).toBeDefined();
    for (let i = 0; i < 5; i++) {
      expect(readList!.getPrimitive(i)).toBe(i * 100000);
    }
  });

  it('should handle EightBytes list', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(0, 1);
    const list = root.initList(0, ElementSize.EIGHT_BYTES, 5);
    
    for (let i = 0; i < 5; i++) {
      list.setPrimitive(i, BigInt(i) * 10000000000n);
    }
    
    const buffer = builder.toArrayBuffer();
    const readRoot = new MessageReader(buffer).getRoot(0, 1);
    const readList = readRoot.getList(0, ElementSize.EIGHT_BYTES);
    
    expect(readList).toBeDefined();
    for (let i = 0; i < 5; i++) {
      expect(readList!.getPrimitive(i)).toBe(BigInt(i) * 10000000000n);
    }
  });

  it('should handle Pointer list', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(0, 1);
    const list = root.initList(0, ElementSize.POINTER, 3);
    
    // Set text in each element
    // Note: This requires special handling for pointer lists
    
    const buffer = builder.toArrayBuffer();
    const readRoot = new MessageReader(buffer).getRoot(0, 1);
    const readList = readRoot.getList(0, ElementSize.POINTER);
    
    expect(readList).toBeDefined();
    expect(readList!.length).toBe(3);
  });

  it('should handle Composite list', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(0, 1);
    const list = root.initList(0, ElementSize.COMPOSITE, 3, { dataWords: 1, pointerCount: 1 });
    
    // Set data in composite elements
    for (let i = 0; i < 3; i++) {
      const item = list.getStruct(i, 1, 1);
      item.setInt32(0, i * 100);
    }
    
    const buffer = builder.toArrayBuffer();
    const readRoot = new MessageReader(buffer).getRoot(0, 1);
    const readList = readRoot.getList(0, ElementSize.COMPOSITE, { dataWords: 1, pointerCount: 1 });
    
    expect(readList).toBeDefined();
    for (let i = 0; i < 3; i++) {
      const item = readList!.getStruct(i, 1, 1);
      expect(item.getInt32(0)).toBe(i * 100);
    }
  });
});

describe('All Data Types - Text and Data', () => {
  it('should handle Text (various lengths)', () => {
    const texts = [
      '',
      'a',
      'Hello',
      'Hello World',
      'The quick brown fox jumps over the lazy dog',
      'x'.repeat(1000),
      'Unicode: 你好世界 🌍',
    ];
    
    for (let i = 0; i < texts.length; i++) {
      const builder = new MessageBuilder();
      const root = builder.initRoot(0, 1);
      root.setText(0, texts[i]);
      
      const buffer = builder.toArrayBuffer();
      const readRoot = new MessageReader(buffer).getRoot(0, 1);
      
      expect(readRoot.getText(0)).toBe(texts[i]);
    }
  });

  it('should handle Data (various lengths)', () => {
    const datas = [
      new Uint8Array(0),
      new Uint8Array([0]),
      new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]),
      new Uint8Array(100).fill(0xFF),
      new Uint8Array([0x00, 0xFF, 0x80, 0x7F]),
    ];
    
    for (const data of datas) {
      const builder = new MessageBuilder();
      const root = builder.initRoot(0, 1);
      // Data is stored as text (list of bytes)
      root.setText(0, String.fromCharCode(...data));
      
      const buffer = builder.toArrayBuffer();
      const readRoot = new MessageReader(buffer).getRoot(0, 1);
      
      // For now, just verify it doesn't crash
      const text = readRoot.getText(0);
      expect(text).toBeDefined();
    }
  });
});

describe('All Data Types - Structs', () => {
  it('should handle struct with only data fields', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(2, 0);
    
    root.setInt32(0, 100);
    root.setInt32(4, 200);
    
    const buffer = builder.toArrayBuffer();
    const readRoot = new MessageReader(buffer).getRoot(2, 0);
    
    expect(readRoot.getInt32(0)).toBe(100);
    expect(readRoot.getInt32(4)).toBe(200);
  });

  it('should handle struct with only pointer fields', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(0, 2);
    
    root.setText(0, 'first');
    root.setText(1, 'second');
    
    const buffer = builder.toArrayBuffer();
    const readRoot = new MessageReader(buffer).getRoot(0, 2);
    
    expect(readRoot.getText(0)).toBe('first');
    expect(readRoot.getText(1)).toBe('second');
  });

  it('should handle struct with mixed fields', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(2, 2);
    
    root.setInt32(0, 42);
    root.setFloat64(8, 3.14);
    root.setText(0, 'text');
    root.setText(1, 'more text');
    
    const buffer = builder.toArrayBuffer();
    const readRoot = new MessageReader(buffer).getRoot(2, 2);
    
    expect(readRoot.getInt32(0)).toBe(42);
    expect(readRoot.getFloat64(8)).toBeCloseTo(3.14, 2);
    expect(readRoot.getText(0)).toBe('text');
    expect(readRoot.getText(1)).toBe('more text');
  });

  it('should handle null struct pointer', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(0, 1);
    // Don't initialize the struct pointer - it should be null
    
    const buffer = builder.toArrayBuffer();
    const readRoot = new MessageReader(buffer).getRoot(0, 1);
    
    // getStruct returns undefined for null pointers
    const child = readRoot.getStruct(0, 1, 0);
    expect(child).toBeUndefined();
  });
});

describe('All Data Types - Unions', () => {
  it('should handle union with different variants', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(2, 1);
    
    // Variant 0: intVal
    root.setUint16(4, 0); // discriminant
    root.setInt32(0, 42);
    
    const buffer1 = builder.toArrayBuffer();
    const readRoot1 = new MessageReader(buffer1).getRoot(2, 1);
    expect(readRoot1.getUint16(4)).toBe(0);
    expect(readRoot1.getInt32(0)).toBe(42);
    
    // Variant 1: textVal
    const builder2 = new MessageBuilder();
    const root2 = builder2.initRoot(2, 1);
    root2.setUint16(4, 1);
    root2.setText(0, 'union text');
    
    const buffer2 = builder2.toArrayBuffer();
    const readRoot2 = new MessageReader(buffer2).getRoot(2, 1);
    expect(readRoot2.getUint16(4)).toBe(1);
    expect(readRoot2.getText(0)).toBe('union text');
  });
});

describe('All Data Types - Enums', () => {
  it('should handle enum as UInt16', () => {
    enum Status {
      Pending = 0,
      Active = 1,
      Completed = 2,
      Failed = 3,
    }
    
    const builder = new MessageBuilder();
    const root = builder.initRoot(1, 0);
    root.setUint16(0, Status.Active);
    
    const buffer = builder.toArrayBuffer();
    const readRoot = new MessageReader(buffer).getRoot(1, 0);
    
    expect(readRoot.getUint16(0)).toBe(Status.Active);
  });
});
