/**
 * Type declarations for lz4js
 * Pure JavaScript LZ4 implementation
 */

declare module 'lz4js' {
  /**
   * Compress data using LZ4 algorithm
   * @param input - Input data as Array of bytes
   * @returns Compressed data as Array of bytes
   */
  export function compress(input: number[]): number[];

  /**
   * Decompress LZ4 compressed data
   * @param input - Compressed data as Array of bytes
   * @param maxSize - Maximum decompressed size (original uncompressed size)
   * @returns Decompressed data as Array of bytes
   */
  export function decompress(input: number[], maxSize: number): number[];
}
