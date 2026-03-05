/**
 * Compression Module
 * 
 * Provides LZ4 compression/decompression with frame format support.
 * Supports both Buffer-based API (for Node.js proxy) and Uint8Array-based API (for general use).
 * 
 * Frame format: Magic(4) + Flags(1) + Length(4) + Payload
 * - Magic: 0x4C5A3401
 * - Flags: compression options
 * - Length: uncompressed data length
 * - Payload: compressed or uncompressed data
 */

// =============================================================================
// Re-exports from frame.ts (Uint8Array-based API)
// =============================================================================
export {
    LZ4_FRAME_MAGIC,
    LZ4_FRAME_HEADER_SIZE,
    FrameFlags,
    type FrameHeader,
    type FrameResult,
    hasFrameMagic,
    parseFrameHeader,
    createFrameHeader,
    isValidFrame,
    compressFrame,
    decompressFrame,
    getFrameInfo,
} from './frame.js';

// Import for use in this module
import { hasFrameMagic, FrameFlags } from './frame.js';

// =============================================================================
// Re-exports from lz4.ts (Uint8Array-based compression)
// =============================================================================
export {
    DEFAULT_COMPRESSION_OPTIONS,
    type CompressionOptions,
    compress,
    uncompress,
    compressWithFallback,
    uncompressWithFallback,
} from './lz4.js';

// =============================================================================
// Convenience functions that combine frame format + LZ4
// =============================================================================
import { compressFrame, decompressFrame, type FrameResult } from './frame.js';
import { compress, uncompress, type CompressionOptions } from './lz4.js';

/**
 * Compress data with LZ4 and frame it
 * @param data - Data to compress
 * @param options - Compression options
 * @returns Framed result with metadata
 */
export function compressAndFrame(
    data: Uint8Array,
    options: CompressionOptions = {}
): FrameResult {
    return compressFrame(data, (d) => compress(d, options));
}

/**
 * Deframe and decompress data
 * @param data - Framed data (or raw data without frame)
 * @returns Decompressed data, or original data if not a valid frame or decompression failed
 */
export function deframeAndDecompress(data: Uint8Array): Uint8Array {
    return decompressFrame(data, uncompress) ?? data;
}

// =============================================================================
// Proxy-specific types and utilities (Buffer-compatible)
// =============================================================================

/**
 * Proxy-side compression configuration
 * Used in WebSocketProxy to configure independent compression for each side
 */
export interface CompressionConfig {
    /** Enable compression */
    enabled: boolean;
    /** Compression algorithm (currently only 'lz4') */
    algorithm?: 'lz4';
    /** Minimum message size to compress (default: 1024) */
    threshold?: number;
    /** Compression level 1-16 (default: 0) */
    level?: number;
    /** Use high compression mode (default: false) */
    highCompression?: boolean;
}

/**
 * Compression statistics for tracking compression metrics
 */
export interface CompressionStats {
    messagesCompressed: number;
    messagesDecompressed: number;
    bytesOriginal: number;
    bytesCompressed: number;
    compressionRatio: number;
    savingsPercent: number;
}

/**
 * Create default compression config
 */
export function createCompressionConfig(
    config?: Partial<CompressionConfig>
): CompressionConfig {
    return {
        enabled: false,
        algorithm: 'lz4',
        threshold: 1024,
        level: 0,
        highCompression: false,
        ...config,
    };
}

/**
 * Create empty compression stats
 */
export function createCompressionStats(): CompressionStats {
    return {
        messagesCompressed: 0,
        messagesDecompressed: 0,
        bytesOriginal: 0,
        bytesCompressed: 0,
        compressionRatio: 1.0,
        savingsPercent: 0,
    };
}

/**
 * Check if data is a compression frame (has LZ4 magic)
 * Works with both Buffer and Uint8Array
 */
export function isCompressionFrame(data: Uint8Array | Buffer): boolean {
    return hasFrameMagic(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
}

/**
 * Try to decompress, return original if not compressed or decompression fails
 * Works with both Buffer and Uint8Array
 */
export function tryDecompress(data: Uint8Array | Buffer): Uint8Array {
    const uint8Data = data instanceof Buffer 
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : data;
    const result = uncompress(uint8Data);
    return result ?? uint8Data;
}

/**
 * Compression flags enum (re-export for compatibility)
 * @deprecated Use FrameFlags instead
 */
export { FrameFlags as CompressionFlags };

/**
 * Default compression configuration
 */
export const DEFAULT_COMPRESSION_CONFIG: CompressionConfig = createCompressionConfig();
