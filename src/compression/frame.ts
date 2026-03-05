/**
 * LZ4 Frame Format Module
 *
 * Frame format: Magic(4) + Flags(1) + Length(4) + Payload
 * - Magic: 0x4C5A3401 (LZ4\0\x01)
 * - Flags: compression options and metadata
 * - Length: uncompressed data length (4 bytes, little-endian)
 * - Payload: compressed or uncompressed data
 */

/**
 * Frame format constants
 */
export const LZ4_FRAME_MAGIC = 0x4c5a3401; // 'LZ4\0\x01'
export const LZ4_FRAME_HEADER_SIZE = 9; // 4 (Magic) + 1 (Flags) + 4 (Length)

/**
 * Frame flags
 */
export enum FrameFlags {
  /** Data is compressed */
  COMPRESSED = 0x01,
  /** Reserved for future use */
  RESERVED_1 = 0x02,
  /** Reserved for future use */
  RESERVED_2 = 0x04,
  /** Reserved for future use */
  RESERVED_3 = 0x08,
  /** Reserved for future use */
  RESERVED_4 = 0x10,
  /** Reserved for future use */
  RESERVED_5 = 0x20,
  /** Reserved for future use */
  RESERVED_6 = 0x40,
  /** Reserved for future use */
  RESERVED_7 = 0x80,
}

/**
 * Frame header structure
 */
export interface FrameHeader {
  magic: number;
  flags: number;
  length: number;
}

/**
 * Check if data has LZ4 frame magic header
 */
export function hasFrameMagic(data: Uint8Array): boolean {
  if (data.length < 4) return false;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const magic = view.getUint32(0, true); // little-endian
  return magic === LZ4_FRAME_MAGIC;
}

/**
 * Parse frame header from data
 * @returns FrameHeader if valid, null otherwise
 */
export function parseFrameHeader(data: Uint8Array): FrameHeader | null {
  if (data.length < LZ4_FRAME_HEADER_SIZE) {
    return null;
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const magic = view.getUint32(0, true); // little-endian

  if (magic !== LZ4_FRAME_MAGIC) {
    return null;
  }

  const flags = view.getUint8(4);
  const length = view.getUint32(5, true); // little-endian

  return { magic, flags, length };
}

/**
 * Create frame header bytes
 */
export function createFrameHeader(flags: number, uncompressedLength: number): Uint8Array {
  const header = new Uint8Array(LZ4_FRAME_HEADER_SIZE);
  const view = new DataView(header.buffer);

  view.setUint32(0, LZ4_FRAME_MAGIC, true); // little-endian
  view.setUint8(4, flags);
  view.setUint32(5, uncompressedLength, true); // little-endian

  return header;
}

/**
 * Check if data is a valid LZ4 frame
 */
export function isValidFrame(data: Uint8Array): boolean {
  const header = parseFrameHeader(data);
  if (!header) return false;

  // Check minimum payload size
  const payloadSize = data.length - LZ4_FRAME_HEADER_SIZE;
  return payloadSize >= 0;
}

/**
 * Frame compression result
 */
export interface FrameResult {
  /** The framed data */
  data: Uint8Array;
  /** Whether the data was compressed */
  compressed: boolean;
  /** Original uncompressed size */
  originalSize: number;
}

/**
 * Compress data and wrap in LZ4 frame format
 * @param data - Data to compress
 * @param compressFn - Compression function (should return compressed data or null if compression failed/not beneficial)
 * @returns Framed data (compressed or uncompressed depending on compressFn result)
 */
export function compressFrame(
  data: Uint8Array,
  compressFn: (data: Uint8Array) => Uint8Array | null
): FrameResult {
  const originalSize = data.length;

  // Try compression
  const compressed = compressFn(data);

  if (compressed !== null && compressed.length < originalSize) {
    // Use compressed data
    const header = createFrameHeader(FrameFlags.COMPRESSED, originalSize);
    const result = new Uint8Array(LZ4_FRAME_HEADER_SIZE + compressed.length);
    result.set(header);
    result.set(compressed, LZ4_FRAME_HEADER_SIZE);

    return {
      data: result,
      compressed: true,
      originalSize,
    };
  }

  // Store uncompressed (compression not beneficial or failed)
  const header = createFrameHeader(0, originalSize);
  const result = new Uint8Array(LZ4_FRAME_HEADER_SIZE + originalSize);
  result.set(header);
  result.set(data, LZ4_FRAME_HEADER_SIZE);

  return {
    data: result,
    compressed: false,
    originalSize,
  };
}

/**
 * Decompress framed data
 * @param data - Framed data (with or without frame header)
 * @param decompressFn - Decompression function for compressed payloads
 * @returns Decompressed data, or null if invalid
 */
export function decompressFrame(
  data: Uint8Array,
  decompressFn: (compressed: Uint8Array, uncompressedSize: number) => Uint8Array | null
): Uint8Array | null {
  // Check if this is a framed message
  const header = parseFrameHeader(data);

  if (!header) {
    // Not a framed message - return as-is (non-compressed message)
    return data;
  }

  const payloadOffset = LZ4_FRAME_HEADER_SIZE;
  const payloadLength = data.length - payloadOffset;

  if (payloadLength < 0) {
    return null; // Invalid frame
  }

  const payload = data.subarray(payloadOffset);

  // Check compression flag
  if (header.flags & FrameFlags.COMPRESSED) {
    // Data is compressed - decompress it
    const result = decompressFn(payload, header.length);
    return result;
  }

  // Data is not compressed - return payload as-is
  return payload;
}

/**
 * Get frame info without decompressing
 */
export function getFrameInfo(data: Uint8Array): {
  isFrame: boolean;
  compressed: boolean;
  originalSize: number;
  payloadSize: number;
} | null {
  const header = parseFrameHeader(data);

  if (!header) {
    return null;
  }

  return {
    isFrame: true,
    compressed: !!(header.flags & FrameFlags.COMPRESSED),
    originalSize: header.length,
    payloadSize: data.length - LZ4_FRAME_HEADER_SIZE,
  };
}
