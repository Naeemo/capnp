/**
 * LZ4 Compression Module
 *
 * Wrapper around the lz4 npm package with:
 * - Compression threshold (skip compression for small data)
 * - Error handling with fallback
 */

import * as lz4 from 'lz4';

/**
 * Compression options
 */
export interface CompressionOptions {
  /** Minimum size to compress (default: 1024 bytes) */
  threshold?: number;
  /** Use high compression mode (default: false) */
  highCompression?: boolean;
  /** Compression level 1-16 (default: 0) */
  level?: number;
}

/**
 * Default compression options
 */
export const DEFAULT_COMPRESSION_OPTIONS: Required<CompressionOptions> = {
  threshold: 1024,
  highCompression: false,
  level: 0,
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
    // Convert Uint8Array to Buffer for lz4 package
    const inputBuffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);

    // Build encoder options
    const encoderOptions = {
      blockChecksum: false,
      highCompression: opts.highCompression,
      compressionLevel: opts.level,
    };

    // Compress using lz4
    const compressed = lz4.encode(inputBuffer, encoderOptions);

    // Check if compression is beneficial
    if (compressed.length >= data.length) {
      return null; // Compression didn't help
    }

    // Convert back to Uint8Array
    return new Uint8Array(compressed.buffer, compressed.byteOffset, compressed.byteLength);
  } catch (_error) {
    // Compression failed - return null to indicate failure
    return null;
  }
}

/**
 * Uncompress data using LZ4
 * @param data - Compressed data
 * @param uncompressedSize - Expected uncompressed size (optional for stream format)
 * @returns Uncompressed data, or null if decompression failed
 */
export function uncompress(data: Uint8Array, uncompressedSize?: number): Uint8Array | null {
  try {
    // Convert Uint8Array to Buffer for lz4 package
    const inputBuffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);

    // Decompress using lz4
    const result = lz4.decode(inputBuffer);

    // Verify result length if uncompressedSize is provided
    if (uncompressedSize !== undefined && result.length !== uncompressedSize) {
      return null;
    }

    // Convert back to Uint8Array
    return new Uint8Array(result.buffer, result.byteOffset, result.byteLength);
  } catch (_error) {
    // Decompression failed
    return null;
  }
}

/**
 * Compress data with automatic fallback
 * @param data - Data to compress
 * @param options - Compression options
 * @returns Object with compressed data and metadata
 */
export function compressWithFallback(
  data: Uint8Array,
  options: CompressionOptions = {}
): {
  data: Uint8Array;
  compressed: boolean;
  originalSize: number;
} {
  const originalSize = data.length;
  const compressed = compress(data, options);

  if (compressed !== null) {
    return {
      data: compressed,
      compressed: true,
      originalSize,
    };
  }

  // Return original data if compression failed or not beneficial
  return {
    data,
    compressed: false,
    originalSize,
  };
}

/**
 * Uncompress data with automatic fallback
 * If decompression fails, returns original data
 * @param data - Potentially compressed data
 * @returns Uncompressed data or original data if decompression failed
 */
export function uncompressWithFallback(data: Uint8Array): Uint8Array {
  const result = uncompress(data);
  return result !== null ? result : data;
}
