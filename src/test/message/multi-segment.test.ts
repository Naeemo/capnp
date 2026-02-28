/**
 * 多段消息测试
 */

import { describe, it, expect } from 'vitest';
import { MessageReader, MessageBuilder } from '../../index.js';

describe('Multi-segment Messages', () => {
  it('should handle message with multiple segments', () => {
    // Note: Current MessageBuilder always creates single-segment messages
    // This test documents the expected behavior when multi-segment is implemented
    
    const builder = new MessageBuilder();
    const root = builder.initRoot(2, 2);
    
    root.setInt32(0, 42);
    root.setText(0, 'hello');
    root.setText(1, 'world');
    
    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer);
    
    // Single segment for now
    expect(reader.segmentCount).toBe(1);
    
    const readRoot = reader.getRoot(2, 2);
    expect(readRoot.getInt32(0)).toBe(42);
    expect(readRoot.getText(0)).toBe('hello');
    expect(readRoot.getText(1)).toBe('world');
  });

  it('should read multi-segment message header correctly', () => {
    // Manually construct a multi-segment message
    // Header: segmentCount-1 = 1 (2 segments)
    // Segment sizes: 2 words, 2 words
    // Padding to 8-byte alignment
    // Segment 0 data: 16 bytes
    // Segment 1 data: 16 bytes
    
    const buffer = new ArrayBuffer(48); // 8 (header) + 4 (size) + 4 (pad) + 16 + 16
    const view = new DataView(buffer);
    
    // Header
    view.setUint32(0, 1, true);  // segmentCount - 1 = 1
    view.setUint32(4, 2, true);  // segment 0 size = 2 words
    view.setUint32(8, 2, true);  // segment 1 size = 2 words
    // Padding: bytes 12-15
    
    // Segment 0 starts at offset 16
    // Root struct pointer at offset 16
    // Struct pointer: offset=0, dataWords=1, pointerCount=0
    view.setBigUint64(16, 0x0000000100000000n, true);
    
    // Data at offset 24 (word 3)
    view.setInt32(24, 42, true);
    
    // Segment 1 starts at offset 32
    view.setInt32(32, 100, true);
    
    const reader = new MessageReader(buffer);
    expect(reader.segmentCount).toBe(2);
    
    const root = reader.getRoot(1, 0);
    expect(root.getInt32(0)).toBe(42);
  });

  it('should handle far pointer to another segment', () => {
    // Create a message where data is in segment 1, pointed to by far pointer in segment 0
    const buffer = new ArrayBuffer(56);
    const view = new DataView(buffer);
    
    // Header: 2 segments
    view.setUint32(0, 1, true);  // segmentCount - 1 = 1
    view.setUint32(4, 3, true);  // segment 0 size = 3 words
    view.setUint32(8, 2, true);  // segment 1 size = 2 words
    // Padding: bytes 12-15
    
    // Segment 0 starts at offset 16
    // Far pointer at offset 16 pointing to segment 1, offset 0
    // Far pointer: segmentId=1, offset=0, type=2 (far)
    const farPtr = (1n << 32n) | 2n;
    view.setBigUint64(16, farPtr, true);
    
    // Landing pad at offset 24 (still in segment 0)
    // This would normally point to the actual struct in segment 1
    // For now, just verify the message parses
    
    // Segment 1 starts at offset 40 (after 3 words = 24 bytes from offset 16)
    // Actually: offset 16 + 24 = 40
    view.setInt32(40, 999, true);
    
    const reader = new MessageReader(buffer);
    expect(reader.segmentCount).toBe(2);
  });
});
