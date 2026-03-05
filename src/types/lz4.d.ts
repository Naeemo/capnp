/**
 * Type declarations for lz4 npm package
 */

declare module 'lz4' {
  /**
   * Encode (compress) data using LZ4
   * @param data - Buffer to compress
   * @param options - Compression options
   * @returns Compressed buffer
   */
  export function encode(data: Buffer, options?: {
    blockChecksum?: boolean;
    blockMaxSize?: number;
  }): Buffer;

  /**
   * Decode (decompress) data using LZ4
   * @param data - Compressed buffer
   * @param options - Decompression options
   * @returns Decompressed buffer
   */
  export function decode(data: Buffer, options?: {
    blockChecksum?: boolean;
  }): Buffer;
}
