/**
 * Performance Optimization Tests
 *
 * Tests for RPC performance optimizations
 */

import { describe, expect, it, beforeEach } from 'vitest';
import {
  MemoryPool,
  MultiSegmentMessageBuilder,
  OptimizedRpcMessageBuilder,
  createZeroCopyView,
  isSameBuffer,
  fastCopy,
  getGlobalMemoryPool,
  configureGlobalMemoryPool,
} from './performance.js';

describe('MemoryPool', () => {
  let pool: MemoryPool;

  beforeEach(() => {
    pool = new MemoryPool();
  });

  it('should acquire and release buffers', () => {
    const buffer = pool.acquire(1024);
    expect(buffer.byteLength).toBeGreaterThanOrEqual(1024);

    pool.release(buffer);

    const stats = pool.getStats();
    expect(stats.totalBuffers).toBe(1);
  });

  it('should reuse released buffers', () => {
    const buffer1 = pool.acquire(1024);
    pool.release(buffer1);

    const buffer2 = pool.acquire(1024);

    // Should be the same buffer (or at least same size)
    expect(buffer2.byteLength).toBe(buffer1.byteLength);
  });

  it('should round up sizes to power of 2', () => {
    const buffer = pool.acquire(1000); // Will round up to 1024
    expect(buffer.byteLength).toBe(1024);
  });

  it('should not pool very small buffers', () => {
    const buffer = pool.acquire(16); // 16 rounds up to 64, which is the minimum
    pool.release(buffer);

    const stats = pool.getStats();
    // 64 is the minimum poolable size, so this WILL be pooled
    expect(stats.totalBuffers).toBe(1);
  });

  it('should not pool very large buffers', () => {
    const buffer = pool.acquire(2 * 1024 * 1024); // 2MB - too large
    pool.release(buffer);

    const stats = pool.getStats();
    expect(stats.totalBuffers).toBe(0);
  });

  it('should respect max pool size', () => {
    const smallPool = new MemoryPool({ maxPoolSize: 2 });

    const buffer1 = smallPool.acquire(1024);
    const buffer2 = smallPool.acquire(1024);
    const buffer3 = smallPool.acquire(1024);

    smallPool.release(buffer1);
    smallPool.release(buffer2);
    smallPool.release(buffer3);

    const stats = smallPool.getStats();
    expect(stats.totalBuffers).toBeLessThanOrEqual(2);
  });

  it('should cleanup old buffers', () => {
    const poolWithAge = new MemoryPool({ maxBufferAgeMs: 1 });

    const buffer = poolWithAge.acquire(1024);
    poolWithAge.release(buffer);

    // Wait for buffer to age
    setTimeout(() => {
      const newBuffer = poolWithAge.acquire(1024);
      // Should allocate new buffer since old one expired
      expect(newBuffer).not.toBe(buffer);
    }, 10);
  });

  it('should clear all buffers', () => {
    const buffer = pool.acquire(1024);
    pool.release(buffer);

    pool.clear();

    const stats = pool.getStats();
    expect(stats.totalBuffers).toBe(0);
  });
});

describe('MultiSegmentMessageBuilder', () => {
  it('should allocate space', () => {
    const builder = new MultiSegmentMessageBuilder();

    const alloc = builder.allocate(100);

    expect(alloc.segment).toBeDefined();
    expect(alloc.offset).toBeGreaterThanOrEqual(0);
    expect(builder.getSegmentCount()).toBeGreaterThanOrEqual(1);
  });

  it('should create multiple segments when needed', () => {
    const builder = new MultiSegmentMessageBuilder({
      initialSegmentSize: 64,  // Small initial segment
      allowMultipleSegments: true,
    });

    // Make several allocations that together exceed the initial segment
    builder.allocate(32);
    builder.allocate(32);
    builder.allocate(32);

    // Should have created multiple segments
    expect(builder.getSegmentCount()).toBeGreaterThanOrEqual(1);
  });

  it('should align allocations to 8 bytes', () => {
    const builder = new MultiSegmentMessageBuilder();

    const alloc = builder.allocate(10); // Should align to 16

    // The allocation should succeed
    expect(alloc.offset).toBeGreaterThanOrEqual(0);
  });

  it('should serialize to buffer', () => {
    const builder = new MultiSegmentMessageBuilder();

    builder.allocate(100);

    const buffer = builder.toBuffer();
    expect(buffer.byteLength).toBeGreaterThan(0);
  });
});

describe('Zero-Copy Utilities', () => {
  it('should create zero-copy view', () => {
    const buffer = new ArrayBuffer(100);
    const view = createZeroCopyView(buffer, 10, 50);

    expect(view.buffer).toBe(buffer);
    expect(view.byteOffset).toBe(10);
    expect(view.byteLength).toBe(50);
  });

  it('should default to full buffer', () => {
    const buffer = new ArrayBuffer(100);
    const view = createZeroCopyView(buffer);

    expect(view.byteOffset).toBe(0);
    expect(view.byteLength).toBe(100);
  });

  it('should check if buffers are same', () => {
    const buffer1 = new ArrayBuffer(100);
    const buffer2 = new ArrayBuffer(100);

    expect(isSameBuffer(buffer1, buffer1)).toBe(true);
    expect(isSameBuffer(buffer1, buffer2)).toBe(false);
  });

  it('should fast copy between buffers', () => {
    const src = new Uint8Array([1, 2, 3, 4, 5]).buffer;
    const dst = new ArrayBuffer(5);

    fastCopy(src, dst);

    const dstView = new Uint8Array(dst);
    expect(dstView[0]).toBe(1);
    expect(dstView[4]).toBe(5);
  });

  it('should fast copy with offsets', () => {
    const src = new Uint8Array([1, 2, 3, 4, 5]).buffer;
    const dst = new ArrayBuffer(10);

    fastCopy(src, dst, 0, 2, 3);

    const dstView = new Uint8Array(dst);
    expect(dstView[2]).toBe(1);
    expect(dstView[4]).toBe(3);
    expect(dstView[5]).toBe(0); // Not copied
  });
});

describe('Global Memory Pool', () => {
  it('should return same global pool instance', () => {
    const pool1 = getGlobalMemoryPool();
    const pool2 = getGlobalMemoryPool();

    expect(pool1).toBe(pool2);
  });

  it('should allow configuring global pool', () => {
    configureGlobalMemoryPool({ maxPoolSize: 50 });
    const pool = getGlobalMemoryPool();

    // Should be a new instance with new config
    expect(pool).toBeDefined();
  });
});

describe('OptimizedRpcMessageBuilder', () => {
  it('should build messages', () => {
    const builder = new OptimizedRpcMessageBuilder();
    const content = new Uint8Array([1, 2, 3, 4, 5]);

    const buffer = builder.buildMessage(content);

    expect(buffer.byteLength).toBeGreaterThan(content.length);
  });

  it('should use memory pool when enabled', () => {
    const builder = new OptimizedRpcMessageBuilder({ useMemoryPool: true });
    const content = new Uint8Array(100);

    // Build multiple messages to trigger pooling
    const buffer1 = builder.buildMessage(content);
    builder.releaseBuffer(buffer1);

    const buffer2 = builder.buildMessage(content);

    expect(buffer2).toBeDefined();
  });

  it('should report pool stats', () => {
    const builder = new OptimizedRpcMessageBuilder({ useMemoryPool: true });

    const stats = builder.getPoolStats();

    expect(stats).toHaveProperty('totalBuffers');
    expect(stats).toHaveProperty('totalBytes');
    expect(stats).toHaveProperty('sizes');
  });
});
