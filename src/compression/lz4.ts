/**
 * LZ4 Compression Module
 *
 * Uses lz4js (pure JavaScript) for cross-platform compatibility
 * - Compression threshold (skip compression for small data)
 * - Error handling with fallback
 */

import { compress as lz4Compress, decompress as lz4Decompress } from 'lz4js';

/**
 * Compression options
 */
export interface CompressionOptions {
  /** Minimum size to compress (default: 1024 bytes) */
  threshold?: number;
  /** Compression acceleration 1-65535 (default: 1, fastest) */
  acceleration?: number;
}

/**
 * Default compression options
 */
export const DEFAULT_COMPRESSION_OPTIONS: Required<CompressionOptions> = {
  threshold: 1024,
  acceleration: 1,
};

/**
 * Compress data using LZ4
 * @param data - Data to compress
 * @param options - Compression options
 * @returns Compressed data, or null if compression failed or not beneficial
 */
export function compress(data: Uint8Array, options: CompressionOptions = {}): Uint8Array | null {
  const opts = { ...DEFAULT_COMPRESSION_OPTIONS, ...options };

  // Skip compression for small data
  if (data.length < opts.threshold) {
    return null;
  }

  try {
    // Convert Uint8Array to Array for lz4js
    const inputArray = Array.from(data);
    
    // Compress using lz4js
    const compressed = lz4Compress(inputArray);
    
    // Only use compressed data if it's actually smaller
    if (compressed.length >= data.length) {
      return null;
    }

    return new Uint8Array(compressed);
  } catch (error) {
    // Compression failed, return null to indicate no compression
    return null;
  }
}

/**
 * Decompress LZ4 compressed data
 * @param data - Compressed data
 * @param originalSize - Original uncompressed size
 * @returns Decompressed data, or null if decompression failed
 */
export function decompress(data: Uint8Array, originalSize: number): Uint8Array | null {
  try {
    // Convert Uint8Array to Array for lz4js
    const inputArray = Array.from(data);
    
    // Decompress using lz4js
    const decompressed = lz4Decompress(inputArray, originalSize);
    
    return new Uint8Array(decompressed);
  } catch (error) {
    // Decompression failed
    return null;
  }
}

/**
 * Check if data is likely LZ4 compressed
 * (LZ4 doesn't have a magic number, so this is a heuristic)
 * @param data - Data to check
 * @returns true if data might be LZ4 compressed
 */
export function isLikelyCompressed(data: Uint8Array): boolean {
  // Heuristic: compressed data is usually smaller and doesn't look like valid Cap'n Proto
  if (data.length < 8) return false;
  
  // Check if it doesn't look like a Cap'n Proto message
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const firstWord = view.getUint32(0, true);
  
  // Cap'n Proto messages typically have reasonable segment counts
  // If the first word looks like a very large number, it's probably compressed
  return firstWord > 0x100000;
}
