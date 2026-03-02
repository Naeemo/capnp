/**
 * Performance Optimizations for RPC
 *
 * Phase 3: Performance improvements
 * - Multi-segment message support
 * - Memory pooling
 * - Zero-copy paths where possible
 */

import { Segment } from '../core/segment.js';

// ========================================================================================
// Memory Pool
// ========================================================================================

interface PooledBuffer {
  buffer: ArrayBuffer;
  size: number;
  lastUsed: number;
}

/**
 * Memory pool for reusing ArrayBuffers
 * Reduces GC pressure for frequent allocations
 */
export class MemoryPool {
  private pools = new Map<number, PooledBuffer[]>();
  private maxPoolSize: number;
  private maxBufferAge: number;

  constructor(options?: { maxPoolSize?: number; maxBufferAgeMs?: number }) {
    this.maxPoolSize = options?.maxPoolSize ?? 100;
    this.maxBufferAge = options?.maxBufferAgeMs ?? 60000; // 1 minute
  }

  /**
   * Acquire a buffer of at least the requested size
   */
  acquire(size: number): ArrayBuffer {
    // Round up to nearest power of 2 for better pooling
    const pooledSize = this.roundUpSize(size);
    const pool = this.pools.get(pooledSize);

    if (pool && pool.length > 0) {
      const now = Date.now();
      // Find a buffer that's not too old
      const index = pool.findIndex(b => now - b.lastUsed < this.maxBufferAge);

      if (index >= 0) {
        const pooled = pool.splice(index, 1)[0];
        return pooled.buffer;
      }
    }

    // Allocate new buffer
    return new ArrayBuffer(pooledSize);
  }

  /**
   * Release a buffer back to the pool
   */
  release(buffer: ArrayBuffer): void {
    const size = buffer.byteLength;

    // Don't pool very small or very large buffers
    if (size < 64 || size > 1024 * 1024) {
      return;
    }

    let pool = this.pools.get(size);
    if (!pool) {
      pool = [];
      this.pools.set(size, pool);
    }

    if (pool.length < this.maxPoolSize) {
      pool.push({
        buffer,
        size,
        lastUsed: Date.now(),
      });
    }
  }

  /**
   * Clear all pooled buffers
   */
  clear(): void {
    this.pools.clear();
  }

  /**
   * Get pool statistics
   */
  getStats(): { totalBuffers: number; totalBytes: number; sizes: number[] } {
    let totalBuffers = 0;
    let totalBytes = 0;
    const sizes: number[] = [];

    for (const [size, pool] of this.pools) {
      totalBuffers += pool.length;
      totalBytes += size * pool.length;
      sizes.push(size);
    }

    return { totalBuffers, totalBytes, sizes };
  }

  private roundUpSize(size: number): number {
    // Round up to nearest power of 2, minimum 64 bytes
    if (size <= 64) return 64;
    if (size <= 128) return 128;
    if (size <= 256) return 256;
    if (size <= 512) return 512;
    if (size <= 1024) return 1024;
    if (size <= 2048) return 2048;
    if (size <= 4096) return 4096;
    if (size <= 8192) return 8192;
    if (size <= 16384) return 16384;
    if (size <= 32768) return 32768;
    if (size <= 65536) return 65536;
    return size;
  }
}

// ========================================================================================
// Multi-Segment Message Builder
// ========================================================================================

/**
 * Options for multi-segment message building
 */
export interface MultiSegmentOptions {
  /** Initial segment size */
  initialSegmentSize?: number;
  /** Maximum segment size */
  maxSegmentSize?: number;
  /** Whether to allow multiple segments */
  allowMultipleSegments?: boolean;
}

/**
 * Builder for multi-segment messages
 * Optimizes memory usage for large messages
 */
export class MultiSegmentMessageBuilder {
  private segments: Segment[] = [];
  private options: Required<MultiSegmentOptions>;
  private currentSegment: Segment;
  private totalSize = 0;

  constructor(options?: MultiSegmentOptions) {
    this.options = {
      initialSegmentSize: options?.initialSegmentSize ?? 8192,
      maxSegmentSize: options?.maxSegmentSize ?? 65536,
      allowMultipleSegments: options?.allowMultipleSegments ?? true,
    };

    this.currentSegment = new Segment(this.options.initialSegmentSize);
    this.segments.push(this.currentSegment);
  }

  /**
   * Allocate space in the message
   */
  allocate(size: number): { segment: Segment; offset: number } {
    // Align to 8 bytes
    const alignedSize = (size + 7) & ~7;

    // Try to allocate in current segment
    const offset = this.currentSegment.allocate(alignedSize);
    if (offset >= 0) {
      this.totalSize += alignedSize;
      return { segment: this.currentSegment, offset };
    }

    // Need a new segment
    if (!this.options.allowMultipleSegments) {
      throw new Error('Message too large for single segment');
    }

    // Create new segment
    const newSegmentSize = Math.min(
      Math.max(alignedSize, this.options.initialSegmentSize),
      this.options.maxSegmentSize
    );
    this.currentSegment = new Segment(newSegmentSize);
    this.segments.push(this.currentSegment);

    const newOffset = this.currentSegment.allocate(alignedSize);
    this.totalSize += alignedSize;
    return { segment: this.currentSegment, offset: newOffset };
  }

  /**
   * Get all segments
   */
  getSegments(): readonly Segment[] {
    return this.segments;
  }

  /**
   * Get the total size of all segments
   */
  getTotalSize(): number {
    return this.totalSize;
  }

  /**
   * Get the number of segments
   */
  getSegmentCount(): number {
    return this.segments.length;
  }

  /**
   * Serialize to a single buffer (for transport)
   */
  toBuffer(): ArrayBuffer {
    if (this.segments.length === 1) {
      // Single segment - use asUint8Array to get the used portion
      const segmentData = this.segments[0].asUint8Array();
      return segmentData.buffer.slice(segmentData.byteOffset, segmentData.byteOffset + segmentData.byteLength) as ArrayBuffer;
    }

    // Multi-segment - need to serialize with segment table
    // This is a simplified version - full implementation would include
    // the segment table at the beginning
    const totalSize = this.segments.reduce((sum, seg) => sum + seg.byteLength, 0);
    const result = new ArrayBuffer(totalSize + 8 * this.segments.length); // Space for segment table
    const view = new DataView(result);
    const bytes = new Uint8Array(result);

    // Write segment table
    view.setUint32(0, this.segments.length - 1, true); // Segment count - 1
    view.setUint32(4, 0, true); // Padding for first segment size (in words)

    let offset = 8;
    for (let i = 0; i < this.segments.length; i++) {
      const segment = this.segments[i];
      if (i > 0) {
        view.setUint32(offset, segment.byteLength / 8, true); // Segment size in words
        offset += 4;
      }

      // Copy segment data
      const segmentBuffer = new Uint8Array(segment.byteLength);
      // Copy data from segment's DataView
      const segmentData = segment.dataView;
      for (let i = 0; i < segment.byteLength; i++) {
        segmentBuffer[i] = segmentData.getUint8(i);
      }
      bytes.set(segmentBuffer, offset);
      offset += segment.byteLength;
    }

    return result;
  }
}

// ========================================================================================
// Zero-Copy Utilities
// ========================================================================================

/**
 * View into a buffer without copying
 */
export interface ZeroCopyView {
  buffer: ArrayBuffer;
  byteOffset: number;
  byteLength: number;
}

/**
 * Create a zero-copy view of a buffer
 */
export function createZeroCopyView(
  buffer: ArrayBuffer,
  byteOffset = 0,
  byteLength?: number
): ZeroCopyView {
  return {
    buffer,
    byteOffset,
    byteLength: byteLength ?? buffer.byteLength - byteOffset,
  };
}

/**
 * Check if two buffers are the same underlying memory
 */
export function isSameBuffer(a: ArrayBuffer, b: ArrayBuffer): boolean {
  try {
    // This is a hack to check if two buffers are the same
    // In a real implementation, we'd use a more reliable method
    return a === b;
  } catch {
    return false;
  }
}

/**
 * Copy data between buffers using the fastest available method
 */
export function fastCopy(
  src: ArrayBuffer,
  dst: ArrayBuffer,
  srcOffset = 0,
  dstOffset = 0,
  length?: number
): void {
  const len = length ?? Math.min(src.byteLength - srcOffset, dst.byteLength - dstOffset);
  const srcView = new Uint8Array(src, srcOffset, len);
  const dstView = new Uint8Array(dst, dstOffset, len);
  dstView.set(srcView);
}

// ========================================================================================
// RPC Message Optimization
// ========================================================================================

/**
 * Options for RPC message building
 */
export interface RpcMessageOptions {
  /** Use multi-segment messages */
  useMultiSegment?: boolean;
  /** Initial segment size */
  initialSegmentSize?: number;
  /** Use memory pooling */
  useMemoryPool?: boolean;
  /** Memory pool instance */
  memoryPool?: MemoryPool;
}

/**
 * Optimized RPC message builder
 */
export class OptimizedRpcMessageBuilder {
  private options: Required<RpcMessageOptions>;
  private pool: MemoryPool;

  constructor(options?: RpcMessageOptions) {
    this.options = {
      useMultiSegment: options?.useMultiSegment ?? true,
      initialSegmentSize: options?.initialSegmentSize ?? 8192,
      useMemoryPool: options?.useMemoryPool ?? true,
      memoryPool: options?.memoryPool ?? new MemoryPool(),
    };
    this.pool = this.options.memoryPool;
  }

  /**
   * Build a message with optimizations applied
   */
  buildMessage(content: Uint8Array): ArrayBuffer {
    const totalSize = 8 + content.length; // Header + content

    if (this.options.useMemoryPool) {
      const buffer = this.pool.acquire(totalSize);
      const view = new DataView(buffer);
      const bytes = new Uint8Array(buffer);

      // Write header (simplified)
      view.setUint32(0, 0, true); // Single segment indicator
      view.setUint32(4, content.length / 8, true); // Size in words

      // Copy content
      bytes.set(content, 8);

      return buffer;
    }

    // Standard allocation
    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    view.setUint32(0, 0, true);
    view.setUint32(4, content.length / 8, true);
    bytes.set(content, 8);

    return buffer;
  }

  /**
   * Release a buffer back to the pool
   */
  releaseBuffer(buffer: ArrayBuffer): void {
    if (this.options.useMemoryPool) {
      this.pool.release(buffer);
    }
  }

  /**
   * Get pool statistics
   */
  getPoolStats(): { totalBuffers: number; totalBytes: number; sizes: number[] } {
    return this.pool.getStats();
  }
}

// ========================================================================================
// Global Memory Pool (Singleton)
// ========================================================================================

let globalMemoryPool: MemoryPool | null = null;

/**
 * Get the global memory pool instance
 */
export function getGlobalMemoryPool(): MemoryPool {
  if (!globalMemoryPool) {
    globalMemoryPool = new MemoryPool();
  }
  return globalMemoryPool;
}

/**
 * Configure the global memory pool
 */
export function configureGlobalMemoryPool(options: {
  maxPoolSize?: number;
  maxBufferAgeMs?: number;
}): void {
  globalMemoryPool = new MemoryPool(options);
}
