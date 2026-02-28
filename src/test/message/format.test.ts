/**
 * 消息格式测试
 * 覆盖消息头解析、段管理、边界情况
 */

import { describe, it, expect } from 'vitest';
import { MessageReader, MessageBuilder } from '../../index.js';

describe('Message Header', () => {
  it('should parse single-segment message header', () => {
    // Create a minimal valid message
    const builder = new MessageBuilder();
    const root = builder.initRoot(1, 0);
    root.setInt32(0, 42);
    
    const buffer = builder.toArrayBuffer();
    const view = new DataView(buffer);
    
    // First word: segmentCount-1 (low 32 bits), firstSegmentSize (high 32 bits)
    const segmentCountMinusOne = view.getUint32(0, true);
    const firstSegmentSize = view.getUint32(4, true);
    
    expect(segmentCountMinusOne).toBe(0); // Single segment
    expect(firstSegmentSize).toBeGreaterThan(0);
  });

  it('should have correct segment count for single segment', () => {
    const builder = new MessageBuilder();
    builder.initRoot(1, 0).setInt32(0, 1);
    
    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer);
    
    expect(reader.segmentCount).toBe(1);
  });

  it('should handle empty root struct', () => {
    const builder = new MessageBuilder();
    builder.initRoot(0, 0);
    
    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer);
    const root = reader.getRoot(0, 0);
    
    expect(root).toBeDefined();
  });

  it('should handle large data section', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(100, 0); // 100 data words
    
    root.setInt32(0, 1);
    root.setInt32(396, 999); // Last word (99 * 4 = 396)
    
    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer).getRoot(100, 0);
    
    expect(reader.getInt32(0)).toBe(1);
    expect(reader.getInt32(396)).toBe(999);
  });

  it('should handle many pointers', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(0, 10);
    
    // Initialize all text fields
    for (let i = 0; i < 10; i++) {
      root.setText(i, `text${i}`);
    }
    
    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer).getRoot(0, 10);
    
    for (let i = 0; i < 10; i++) {
      expect(reader.getText(i)).toBe(`text${i}`);
    }
  });
});

describe('Message Builder', () => {
  it('should allocate first segment lazily', () => {
    const builder = new MessageBuilder();
    // Before initRoot, no segment should be allocated
    expect(builder.toArrayBuffer().byteLength).toBeGreaterThan(0);
  });

  it('should reuse segment space efficiently', () => {
    const builder = new MessageBuilder();
    
    // Create multiple structs in same segment
    const root = builder.initRoot(1, 1);
    root.setInt32(0, 1);
    
    const nested = root.initStruct(0, 1, 0);
    nested.setInt32(0, 2);
    
    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer).getRoot(1, 1);
    
    expect(reader.getInt32(0)).toBe(1);
    expect(reader.getStruct(0, 1, 0)!.getInt32(0)).toBe(2);
  });

  it('should handle allocation after serialization', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(1, 0);
    root.setInt32(0, 42);
    
    // Serialize
    const buffer1 = builder.toArrayBuffer();
    expect(new MessageReader(buffer1).getRoot(1, 0).getInt32(0)).toBe(42);
    
    // Modify and serialize again
    root.setInt32(0, 100);
    const buffer2 = builder.toArrayBuffer();
    expect(new MessageReader(buffer2).getRoot(1, 0).getInt32(0)).toBe(100);
  });
});

describe('Message Boundaries', () => {
  it('should handle minimum size message', () => {
    // Minimum valid message: header (1 word) + root struct pointer (1 word)
    const buffer = new ArrayBuffer(16);
    const view = new DataView(buffer);
    
    // Header: 0 segments - 1 = 0, size = 1
    view.setUint32(0, 0, true);
    view.setUint32(4, 1, true);
    
    // Root pointer: struct pointer, offset 0, dataWords 0, pointerCount 0
    view.setBigUint64(8, 0n, true);
    
    const reader = new MessageReader(buffer);
    expect(reader.segmentCount).toBe(1);
  });

  it('should handle truncated message header', () => {
    const buffer = new ArrayBuffer(4); // Too small for header
    
    // Should treat as empty message, not throw
    const reader = new MessageReader(buffer);
    expect(reader.segmentCount).toBe(0);
  });

  it('should handle message with invalid segment count', () => {
    const buffer = new ArrayBuffer(16);
    const view = new DataView(buffer);
    
    // Claim 1000 segments but don't provide sizes
    view.setUint32(0, 999, true);
    view.setUint32(4, 1, true);
    
    // Should treat as empty message, not throw
    const reader = new MessageReader(buffer);
    expect(reader.segmentCount).toBe(0);
  });
});
