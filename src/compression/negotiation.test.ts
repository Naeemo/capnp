/**
 * 能力协商协议测试
 * 测试协商流程、编解码和边界情况
 */

import { describe, expect, it } from 'vitest';
import {
  CompressionAlgorithm,
  type TransportCapabilities,
  createDefaultCapabilities,
  createLZ4OnlyCapabilities,
  createNoCompressionCapabilities,
  decodeCapabilities,
  encodeCapabilities,
  negotiateCompression,
  validateCapabilities,
} from './negotiation.js';

describe('Negotiation - Basic Negotiation', () => {
  it('should select LZ4 when both support LZ4', () => {
    const local: TransportCapabilities = {
      compressionAlgorithms: [CompressionAlgorithm.LZ4, CompressionAlgorithm.NONE],
    };
    const remote: TransportCapabilities = {
      compressionAlgorithms: [CompressionAlgorithm.LZ4, CompressionAlgorithm.NONE],
    };

    const result = negotiateCompression(local, remote);

    expect(result.success).toBe(true);
    expect(result.selectedAlgorithm).toBe(CompressionAlgorithm.LZ4);
    expect(result.error).toBeUndefined();
  });

  it('should select NONE when one side only supports NONE', () => {
    const local: TransportCapabilities = {
      compressionAlgorithms: [CompressionAlgorithm.LZ4, CompressionAlgorithm.NONE],
    };
    const remote: TransportCapabilities = {
      compressionAlgorithms: [CompressionAlgorithm.NONE],
    };

    const result = negotiateCompression(local, remote);

    expect(result.success).toBe(true);
    expect(result.selectedAlgorithm).toBe(CompressionAlgorithm.NONE);
  });

  it('should select NONE when remote does not support any compression', () => {
    const local: TransportCapabilities = {
      compressionAlgorithms: [CompressionAlgorithm.LZ4, CompressionAlgorithm.NONE],
    };
    const remote: TransportCapabilities = {
      compressionAlgorithms: [CompressionAlgorithm.NONE],
    };

    const result = negotiateCompression(local, remote);

    expect(result.success).toBe(true);
    expect(result.selectedAlgorithm).toBe(CompressionAlgorithm.NONE);
  });

  it('should handle both sides only supporting NONE', () => {
    const local: TransportCapabilities = {
      compressionAlgorithms: [CompressionAlgorithm.NONE],
    };
    const remote: TransportCapabilities = {
      compressionAlgorithms: [CompressionAlgorithm.NONE],
    };

    const result = negotiateCompression(local, remote);

    expect(result.success).toBe(true);
    expect(result.selectedAlgorithm).toBe(CompressionAlgorithm.NONE);
  });

  it('should handle empty algorithms list (defaults to NONE)', () => {
    const local: TransportCapabilities = {
      compressionAlgorithms: [],
    };
    const remote: TransportCapabilities = {
      compressionAlgorithms: [CompressionAlgorithm.LZ4],
    };

    const result = negotiateCompression(local, remote);

    expect(result.success).toBe(true);
    expect(result.selectedAlgorithm).toBe(CompressionAlgorithm.NONE);
  });

  it('should select NONE when no common algorithms', () => {
    // 创建一种未来可能出现的算法
    const FUTURE_ALGO = 99 as CompressionAlgorithm;
    const local: TransportCapabilities = {
      compressionAlgorithms: [CompressionAlgorithm.LZ4, CompressionAlgorithm.NONE],
    };
    const remote: TransportCapabilities = {
      compressionAlgorithms: [FUTURE_ALGO],
    };

    const result = negotiateCompression(local, remote);

    expect(result.success).toBe(true);
    expect(result.selectedAlgorithm).toBe(CompressionAlgorithm.NONE);
  });
});

describe('Negotiation - Priority Selection', () => {
  it('should prioritize LZ4 over NONE when both supported', () => {
    const local: TransportCapabilities = {
      compressionAlgorithms: [CompressionAlgorithm.NONE, CompressionAlgorithm.LZ4],
    };
    const remote: TransportCapabilities = {
      compressionAlgorithms: [CompressionAlgorithm.NONE, CompressionAlgorithm.LZ4],
    };

    const result = negotiateCompression(local, remote);

    // LZ4 has higher priority (0) than NONE (1)
    expect(result.success).toBe(true);
    expect(result.selectedAlgorithm).toBe(CompressionAlgorithm.LZ4);
  });

  it('should select the highest priority common algorithm', () => {
    // 本地优先级：NONE > LZ4
    const local: TransportCapabilities = {
      compressionAlgorithms: [CompressionAlgorithm.NONE, CompressionAlgorithm.LZ4],
    };
    // 远程优先级：NONE > LZ4
    const remote: TransportCapabilities = {
      compressionAlgorithms: [CompressionAlgorithm.NONE, CompressionAlgorithm.LZ4],
    };

    const result = negotiateCompression(local, remote);

    // Both support both, LZ4 has higher priority
    expect(result.success).toBe(true);
    expect(result.selectedAlgorithm).toBe(CompressionAlgorithm.LZ4);
  });

  it('should use priority when multiple algorithms are supported', () => {
    const local: TransportCapabilities = {
      compressionAlgorithms: [CompressionAlgorithm.LZ4, CompressionAlgorithm.NONE],
    };
    const remote: TransportCapabilities = {
      compressionAlgorithms: [CompressionAlgorithm.LZ4, CompressionAlgorithm.NONE],
    };

    const result = negotiateCompression(local, remote);

    // Both support LZ4 and NONE, LZ4 is preferred (better compression)
    expect(result.success).toBe(true);
    expect(result.selectedAlgorithm).toBe(CompressionAlgorithm.LZ4);
  });
});

describe('Negotiation - Encoding/Decoding', () => {
  it('should encode and decode capabilities correctly', () => {
    const original: TransportCapabilities = {
      compressionAlgorithms: [CompressionAlgorithm.LZ4, CompressionAlgorithm.NONE],
      maxMessageSize: 32 * 1024 * 1024, // 32MB
      version: 2,
    };

    const encoded = encodeCapabilities(original);
    const decoded = decodeCapabilities(encoded);

    expect(decoded.compressionAlgorithms).toEqual(original.compressionAlgorithms);
    expect(decoded.maxMessageSize).toBe(original.maxMessageSize);
    expect(decoded.version).toBe(original.version);
  });

  it('should handle empty algorithm list encoding/decoding', () => {
    const original: TransportCapabilities = {
      compressionAlgorithms: [],
      maxMessageSize: 16 * 1024 * 1024,
      version: 1,
    };

    const encoded = encodeCapabilities(original);
    const decoded = decodeCapabilities(encoded);

    expect(decoded.compressionAlgorithms).toEqual([]);
    expect(decoded.maxMessageSize).toBe(original.maxMessageSize);
    expect(decoded.version).toBe(original.version);
  });

  it('should handle single algorithm encoding/decoding', () => {
    const original: TransportCapabilities = {
      compressionAlgorithms: [CompressionAlgorithm.LZ4],
    };

    const encoded = encodeCapabilities(original);
    const decoded = decodeCapabilities(encoded);

    expect(decoded.compressionAlgorithms).toEqual([CompressionAlgorithm.LZ4]);
    expect(decoded.maxMessageSize).toBe(64 * 1024 * 1024); // default
    expect(decoded.version).toBe(1); // default
  });

  it('should handle ArrayBuffer input to decodeCapabilities', () => {
    const original: TransportCapabilities = {
      compressionAlgorithms: [CompressionAlgorithm.NONE],
    };

    const encoded = encodeCapabilities(original);
    const arrayBuffer = new Uint8Array(encoded).buffer;
    const decoded = decodeCapabilities(arrayBuffer);

    expect(decoded.compressionAlgorithms).toEqual([CompressionAlgorithm.NONE]);
  });

  it('should maintain algorithm order after encoding/decoding', () => {
    const original: TransportCapabilities = {
      compressionAlgorithms: [CompressionAlgorithm.LZ4, CompressionAlgorithm.NONE],
    };

    const encoded = encodeCapabilities(original);
    const decoded = decodeCapabilities(encoded);

    expect(decoded.compressionAlgorithms).toEqual([
      CompressionAlgorithm.LZ4,
      CompressionAlgorithm.NONE,
    ]);
  });
});

describe('Negotiation - Default Capabilities', () => {
  it('should create default capabilities with LZ4 support', () => {
    const caps = createDefaultCapabilities();

    expect(caps.compressionAlgorithms).toContain(CompressionAlgorithm.LZ4);
    expect(caps.compressionAlgorithms).toContain(CompressionAlgorithm.NONE);
    expect(caps.maxMessageSize).toBe(64 * 1024 * 1024);
    expect(caps.version).toBe(1);
  });

  it('should create no-compression capabilities', () => {
    const caps = createNoCompressionCapabilities();

    expect(caps.compressionAlgorithms).toEqual([CompressionAlgorithm.NONE]);
    expect(caps.maxMessageSize).toBe(64 * 1024 * 1024);
    expect(caps.version).toBe(1);
  });

  it('should create LZ4-only capabilities', () => {
    const caps = createLZ4OnlyCapabilities();

    expect(caps.compressionAlgorithms).toEqual([CompressionAlgorithm.LZ4]);
    expect(caps.maxMessageSize).toBe(64 * 1024 * 1024);
    expect(caps.version).toBe(1);
  });
});

describe('Negotiation - Validation', () => {
  it('should validate correct capabilities', () => {
    const caps: TransportCapabilities = {
      compressionAlgorithms: [CompressionAlgorithm.LZ4, CompressionAlgorithm.NONE],
      maxMessageSize: 1024 * 1024,
      version: 1,
    };

    expect(validateCapabilities(caps)).toBe(true);
  });

  it('should reject empty algorithm list', () => {
    const caps: TransportCapabilities = {
      compressionAlgorithms: [],
    };

    expect(validateCapabilities(caps)).toBe(false);
  });

  it('should reject invalid maxMessageSize', () => {
    const caps: TransportCapabilities = {
      compressionAlgorithms: [CompressionAlgorithm.LZ4],
      maxMessageSize: 0,
    };

    expect(validateCapabilities(caps)).toBe(false);

    const caps2: TransportCapabilities = {
      compressionAlgorithms: [CompressionAlgorithm.LZ4],
      maxMessageSize: -1,
    };

    expect(validateCapabilities(caps2)).toBe(false);
  });

  it('should reject invalid version', () => {
    const caps: TransportCapabilities = {
      compressionAlgorithms: [CompressionAlgorithm.LZ4],
      version: 0,
    };

    expect(validateCapabilities(caps)).toBe(false);
  });

  it('should validate without optional fields', () => {
    const caps: TransportCapabilities = {
      compressionAlgorithms: [CompressionAlgorithm.LZ4],
    };

    expect(validateCapabilities(caps)).toBe(true);
  });
});

describe('Negotiation - End-to-End', () => {
  it('should complete full negotiation flow', () => {
    // 模拟完整的协商流程
    const localCaps = createDefaultCapabilities();
    const remoteCaps = createLZ4OnlyCapabilities();

    // 编码并传输
    const localEncoded = encodeCapabilities(localCaps);
    const remoteEncoded = encodeCapabilities(remoteCaps);

    // 双方解码
    const localDecoded = decodeCapabilities(remoteEncoded);
    const remoteDecoded = decodeCapabilities(localEncoded);

    // 协商
    const localResult = negotiateCompression(localCaps, localDecoded);
    const remoteResult = negotiateCompression(remoteCaps, remoteDecoded);

    // 双方应该达成一致的算法
    expect(localResult.success).toBe(true);
    expect(remoteResult.success).toBe(true);
    expect(localResult.selectedAlgorithm).toBe(remoteResult.selectedAlgorithm);
    expect(localResult.selectedAlgorithm).toBe(CompressionAlgorithm.LZ4);
  });

  it('should handle negotiation with default capabilities', () => {
    const local = createDefaultCapabilities();
    const remote = createDefaultCapabilities();

    const result = negotiateCompression(local, remote);

    expect(result.success).toBe(true);
    // Both support LZ4 and NONE, LZ4 has higher priority
    expect(result.selectedAlgorithm).toBe(CompressionAlgorithm.LZ4);
  });

  it('should handle asymmetric capabilities', () => {
    const local = createLZ4OnlyCapabilities();
    const remote = createNoCompressionCapabilities();

    const result = negotiateCompression(local, remote);

    expect(result.success).toBe(true);
    expect(result.selectedAlgorithm).toBe(CompressionAlgorithm.NONE);
  });
});

describe('Negotiation - Edge Cases', () => {
  it('should handle very large maxMessageSize', () => {
    const caps: TransportCapabilities = {
      compressionAlgorithms: [CompressionAlgorithm.LZ4],
      maxMessageSize: 0xffffffff, // max uint32
    };

    const encoded = encodeCapabilities(caps);
    const decoded = decodeCapabilities(encoded);

    expect(decoded.maxMessageSize).toBe(0xffffffff);
  });

  it('should handle many algorithms', () => {
    const caps: TransportCapabilities = {
      compressionAlgorithms: [
        CompressionAlgorithm.NONE,
        CompressionAlgorithm.LZ4,
        CompressionAlgorithm.NONE,
        CompressionAlgorithm.LZ4,
      ],
    };

    const encoded = encodeCapabilities(caps);
    const decoded = decodeCapabilities(encoded);

    expect(decoded.compressionAlgorithms).toHaveLength(4);
  });

  it('should handle identical capabilities', () => {
    const caps = createDefaultCapabilities();

    const result = negotiateCompression(caps, caps);

    expect(result.success).toBe(true);
    // LZ4 has higher priority than NONE
    expect(result.selectedAlgorithm).toBe(CompressionAlgorithm.LZ4);
  });

  it('should handle reverse algorithm order', () => {
    const local: TransportCapabilities = {
      compressionAlgorithms: [CompressionAlgorithm.NONE, CompressionAlgorithm.LZ4],
    };
    const remote: TransportCapabilities = {
      compressionAlgorithms: [CompressionAlgorithm.LZ4, CompressionAlgorithm.NONE],
    };

    const result = negotiateCompression(local, remote);

    expect(result.success).toBe(true);
    // LZ4 has higher priority than NONE, regardless of order in array
    expect(result.selectedAlgorithm).toBe(CompressionAlgorithm.LZ4);
  });
});
