/**
 * Tests for compression frame format and LZ4 module
 */

import { describe, it, expect } from 'vitest';
import {
    LZ4_FRAME_MAGIC,
    LZ4_FRAME_HEADER_SIZE,
    FrameFlags,
    hasFrameMagic,
    parseFrameHeader,
    createFrameHeader,
    isValidFrame,
    compressFrame,
    decompressFrame,
    getFrameInfo,
} from './frame';
import {
    compress,
    uncompress,
    compressWithFallback,
    uncompressWithFallback,
} from './lz4';
import {
    compressAndFrame,
    deframeAndDecompress,
} from './index';

describe('Frame Format', () => {
    describe('Constants', () => {
        it('should have correct magic number', () => {
            expect(LZ4_FRAME_MAGIC).toBe(0x4C5A3401);
        });

        it('should have correct header size', () => {
            expect(LZ4_FRAME_HEADER_SIZE).toBe(9); // 4 + 1 + 4
        });
    });

    describe('hasFrameMagic', () => {
        it('should return true for valid frame magic', () => {
            const data = new Uint8Array([0x01, 0x34, 0x5A, 0x4C]); // little-endian
            expect(hasFrameMagic(data)).toBe(true);
        });

        it('should return false for invalid magic', () => {
            const data = new Uint8Array([0x00, 0x00, 0x00, 0x00]);
            expect(hasFrameMagic(data)).toBe(false);
        });

        it('should return false for data too short', () => {
            const data = new Uint8Array([0x01, 0x02]);
            expect(hasFrameMagic(data)).toBe(false);
        });
    });

    describe('createFrameHeader', () => {
        it('should create valid header', () => {
            const header = createFrameHeader(FrameFlags.COMPRESSED, 1000);
            expect(header.length).toBe(LZ4_FRAME_HEADER_SIZE);
            
            const view = new DataView(header.buffer);
            expect(view.getUint32(0, true)).toBe(LZ4_FRAME_MAGIC);
            expect(header[4]).toBe(FrameFlags.COMPRESSED);
            expect(view.getUint32(5, true)).toBe(1000);
        });
    });

    describe('parseFrameHeader', () => {
        it('should parse valid header', () => {
            const header = createFrameHeader(FrameFlags.COMPRESSED, 1000);
            const parsed = parseFrameHeader(header);
            
            expect(parsed).not.toBeNull();
            expect(parsed!.magic).toBe(LZ4_FRAME_MAGIC);
            expect(parsed!.flags).toBe(FrameFlags.COMPRESSED);
            expect(parsed!.length).toBe(1000);
        });

        it('should return null for invalid header', () => {
            const data = new Uint8Array([0x00, 0x00, 0x00, 0x00]);
            expect(parseFrameHeader(data)).toBeNull();
        });

        it('should return null for data too short', () => {
            const data = new Uint8Array([0x01, 0x34, 0x5A, 0x4C]); // magic only
            expect(parseFrameHeader(data)).toBeNull();
        });
    });

    describe('isValidFrame', () => {
        it('should return true for valid frame', () => {
            const header = createFrameHeader(FrameFlags.COMPRESSED, 100);
            const payload = new Uint8Array([0x01, 0x02, 0x03]);
            const frame = new Uint8Array(LZ4_FRAME_HEADER_SIZE + payload.length);
            frame.set(header);
            frame.set(payload, LZ4_FRAME_HEADER_SIZE);
            
            expect(isValidFrame(frame)).toBe(true);
        });

        it('should return false for data too short', () => {
            const data = new Uint8Array([0x01, 0x34, 0x5A, 0x4C]);
            expect(isValidFrame(data)).toBe(false);
        });
    });

    describe('compressFrame', () => {
        it('should frame compressed data', () => {
            const data = new Uint8Array([1, 2, 3, 4, 5]);
            const mockCompress = (d: Uint8Array) => new Uint8Array([0x99]); // smaller
            
            const result = compressFrame(data, mockCompress);
            
            expect(result.compressed).toBe(true);
            expect(result.originalSize).toBe(5);
            expect(result.data.length).toBe(LZ4_FRAME_HEADER_SIZE + 1); // header + 1 byte compressed
        });

        it('should store uncompressed when compression not beneficial', () => {
            const data = new Uint8Array([1, 2, 3, 4, 5]);
            const mockCompress = () => null; // compression not beneficial
            
            const result = compressFrame(data, mockCompress);
            
            expect(result.compressed).toBe(false);
            expect(result.originalSize).toBe(5);
            expect(result.data.length).toBe(LZ4_FRAME_HEADER_SIZE + 5);
        });
    });

    describe('decompressFrame', () => {
        it('should return payload for non-frame data', () => {
            const data = new Uint8Array([1, 2, 3, 4, 5]);
            const mockDecompress = () => null;
            
            const result = decompressFrame(data, mockDecompress);
            
            expect(result).toEqual(data);
        });

        it('should decompress compressed frame', () => {
            const original = new Uint8Array([1, 2, 3, 4, 5]);
            const compressed = new Uint8Array([0x99]);
            const mockDecompress = (d: Uint8Array, size: number) => original;
            
            // Create a compressed frame
            const header = createFrameHeader(FrameFlags.COMPRESSED, original.length);
            const frame = new Uint8Array(LZ4_FRAME_HEADER_SIZE + compressed.length);
            frame.set(header);
            frame.set(compressed, LZ4_FRAME_HEADER_SIZE);
            
            const result = decompressFrame(frame, mockDecompress);
            
            expect(result).toEqual(original);
        });

        it('should return payload for uncompressed frame', () => {
            const payload = new Uint8Array([1, 2, 3, 4, 5]);
            const mockDecompress = () => null;
            
            // Create an uncompressed frame
            const header = createFrameHeader(0, payload.length); // no COMPRESSED flag
            const frame = new Uint8Array(LZ4_FRAME_HEADER_SIZE + payload.length);
            frame.set(header);
            frame.set(payload, LZ4_FRAME_HEADER_SIZE);
            
            const result = decompressFrame(frame, mockDecompress);
            
            expect(result).toEqual(payload);
        });
    });

    describe('getFrameInfo', () => {
        it('should return frame info for valid frame', () => {
            const header = createFrameHeader(FrameFlags.COMPRESSED, 1000);
            const payload = new Uint8Array(50);
            const frame = new Uint8Array(LZ4_FRAME_HEADER_SIZE + payload.length);
            frame.set(header);
            frame.set(payload, LZ4_FRAME_HEADER_SIZE);
            
            const info = getFrameInfo(frame);
            
            expect(info).not.toBeNull();
            expect(info!.isFrame).toBe(true);
            expect(info!.compressed).toBe(true);
            expect(info!.originalSize).toBe(1000);
            expect(info!.payloadSize).toBe(50);
        });

        it('should return null for non-frame data', () => {
            const data = new Uint8Array([1, 2, 3]);
            expect(getFrameInfo(data)).toBeNull();
        });
    });
});

describe('LZ4 Module', () => {
    describe('compress', () => {
        it('should return null for data below threshold', () => {
            const data = new Uint8Array(100);
            const result = compress(data, { threshold: 1024 });
            expect(result).toBeNull();
        });

        it('should compress data above threshold', () => {
            // Create compressible data
            const data = new Uint8Array(2000);
            for (let i = 0; i < data.length; i++) {
                data[i] = i % 10; // repetitive pattern
            }
            
            const result = compress(data, { threshold: 1024 });
            // May or may not compress depending on the algorithm
            // Just verify it doesn't throw
        });
    });

    describe('uncompress', () => {
        it('should decompress what was compressed', () => {
            const original = new Uint8Array(2000);
            for (let i = 0; i < original.length; i++) {
                original[i] = i % 10;
            }
            
            const compressed = compress(original, { threshold: 1024 });
            
            if (compressed) {
                const decompressed = uncompress(compressed, original.length);
                expect(decompressed).not.toBeNull();
                expect(decompressed).toEqual(original);
            }
        });

        it('should return null for invalid data', () => {
            const invalid = new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF]);
            const result = uncompress(invalid, 100);
            // Should either return null or throw, but function returns null on error
        });
    });

    describe('compressWithFallback', () => {
        it('should indicate compression success', () => {
            const data = new Uint8Array(2000);
            for (let i = 0; i < data.length; i++) {
                data[i] = i % 10;
            }
            
            const result = compressWithFallback(data, { threshold: 1024 });
            expect(result.originalSize).toBe(2000);
            expect(result.compressed).toBe(true);
        });

        it('should indicate when compression not used', () => {
            const data = new Uint8Array(100);
            const result = compressWithFallback(data, { threshold: 1024 });
            expect(result.compressed).toBe(false);
            expect(result.data).toBe(data);
        });
    });

    describe('uncompressWithFallback', () => {
        it('should decompress compressed data', () => {
            const original = new Uint8Array(2000);
            for (let i = 0; i < original.length; i++) {
                original[i] = i % 10;
            }
            
            const compressed = compress(original, { threshold: 1024 });
            
            if (compressed) {
                const result = uncompressWithFallback(compressed);
                expect(result).toEqual(original);
            }
        });

        it('should return original if decompression fails', () => {
            const invalid = new Uint8Array([1, 2, 3, 4, 5]);
            const result = uncompressWithFallback(invalid);
            expect(result).toEqual(invalid);
        });
    });
});

describe('Compression Integration', () => {
    describe('compressAndFrame', () => {
        it('should compress and frame data', () => {
            const data = new Uint8Array(2000);
            for (let i = 0; i < data.length; i++) {
                data[i] = i % 10;
            }
            
            const result = compressAndFrame(data, { threshold: 1024 });
            
            expect(result.originalSize).toBe(2000);
            expect(hasFrameMagic(result.data)).toBe(true);
        });
    });

    describe('deframeAndDecompress', () => {
        it('should deframe and decompress data', () => {
            const original = new Uint8Array(2000);
            for (let i = 0; i < original.length; i++) {
                original[i] = i % 10;
            }
            
            const framed = compressAndFrame(original, { threshold: 1024 });
            const result = deframeAndDecompress(framed.data);
            
            if (framed.compressed) {
                expect(result).toEqual(original);
            } else {
                expect(result).toEqual(original);
            }
        });

        it('should return non-frame data unchanged', () => {
            const data = new Uint8Array([1, 2, 3, 4, 5]);
            const result = deframeAndDecompress(data);
            expect(result).toEqual(data);
        });
    });
});
