/**
 * Cap'n Proto 传输层能力协商协议
 * 用于协商双方支持的压缩算法
 */

import { MessageBuilder, StructBuilder } from '../core/message-builder.js';
import { MessageReader, StructReader } from '../core/message-reader.js';
import { ElementSize } from '../core/pointer.js';

/**
 * 压缩算法枚举
 * 优先级由协商函数决定，LZ4 优先于 NONE
 */
export enum CompressionAlgorithm {
  /** 无压缩 */
  NONE = 0,
  /** LZ4 压缩 */
  LZ4 = 1,
}

/**
 * 算法优先级映射
 * 数值越小优先级越高（更优先被选择）
 */
const ALGORITHM_PRIORITY: Record<CompressionAlgorithm, number> = {
  [CompressionAlgorithm.LZ4]: 0, // LZ4 优先级最高（优先选择）
  [CompressionAlgorithm.NONE]: 1, // NONE 作为后备
};

/**
 * 传输能力配置
 */
export interface TransportCapabilities {
  /** 支持的压缩算法列表（按优先级排序） */
  compressionAlgorithms: CompressionAlgorithm[];
  /** 最大消息大小（字节） */
  maxMessageSize?: number;
  /** 协议版本 */
  version?: number;
}

/**
 * 协商结果
 */
export interface NegotiationResult {
  /** 选定的压缩算法 */
  selectedAlgorithm: CompressionAlgorithm;
  /** 协商是否成功 */
  success: boolean;
  /** 错误信息（协商失败时） */
  error?: string;
}

/**
 * 编码能力信息为 Cap'n Proto 格式
 *
 * 结构定义（Cap'n Proto schema 风格）:
 * struct TransportCapabilities {
 *   version @0 :UInt16;
 *   maxMessageSize @1 :UInt32;
 *   compressionAlgorithms @2 :List(UInt8);
 * }
 *
 * @param capabilities 传输能力配置
 * @returns Uint8Array 编码后的数据
 */
export function encodeCapabilities(capabilities: TransportCapabilities): Uint8Array {
  const builder = new MessageBuilder();
  // 数据段：2个字段(version + maxMessageSize) = 2 words
  // 指针段：1个字段(compressionAlgorithms) = 1 pointer
  const root = builder.initRoot(2, 1);

  // 设置 version (UInt16 @ offset 0)
  root.setUint16(0, capabilities.version ?? 1);

  // 设置 maxMessageSize (UInt32 @ offset 4, 跳过 version 的 2 bytes)
  root.setUint32(4, capabilities.maxMessageSize ?? 64 * 1024 * 1024);

  // 设置 compressionAlgorithms 列表 (pointer index 0)
  const algoList = root.initList<number>(
    0,
    ElementSize.BYTE,
    capabilities.compressionAlgorithms.length
  );
  for (let i = 0; i < capabilities.compressionAlgorithms.length; i++) {
    algoList.setPrimitive(i, capabilities.compressionAlgorithms[i]);
  }

  return new Uint8Array(builder.toArrayBuffer());
}

/**
 * 从 Cap'n Proto 格式解码能力信息
 *
 * @param data 编码后的数据
 * @returns TransportCapabilities 解码后的能力配置
 */
export function decodeCapabilities(data: Uint8Array | ArrayBuffer): TransportCapabilities {
  const uint8Array = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  const reader = new MessageReader(uint8Array);
  const root = reader.getRoot(2, 1);

  // 读取 version (UInt16 @ offset 0)
  const version = root.getUint16(0);

  // 读取 maxMessageSize (UInt32 @ offset 4)
  const maxMessageSize = root.getUint32(4);

  // 读取 compressionAlgorithms 列表 (pointer index 0)
  const algoList = root.getList<number>(0, ElementSize.BYTE);
  const algorithms: CompressionAlgorithm[] = [];

  if (algoList) {
    for (let i = 0; i < algoList.length; i++) {
      const value = algoList.getPrimitive(i);
      algorithms.push(value as CompressionAlgorithm);
    }
  }

  return {
    compressionAlgorithms: algorithms,
    maxMessageSize: maxMessageSize || undefined,
    version: version || undefined,
  };
}

/**
 * 协商双方支持的压缩算法
 *
 * 协商规则：
 * 1. 优先选择双方都支持的、数值最小的算法（数值越小优先级越高）
 * 2. 如果没有共同支持的算法，返回 NONE
 * 3. 如果任一方未提供算法列表，返回 NONE
 *
 * @param localCapabilities 本地能力
 * @param remoteCapabilities 对端能力
 * @returns NegotiationResult 协商结果
 */
export function negotiateCompression(
  localCapabilities: TransportCapabilities,
  remoteCapabilities: TransportCapabilities
): NegotiationResult {
  // 检查算法列表有效性
  if (
    !localCapabilities.compressionAlgorithms ||
    localCapabilities.compressionAlgorithms.length === 0
  ) {
    return {
      selectedAlgorithm: CompressionAlgorithm.NONE,
      success: true,
      error: undefined,
    };
  }

  if (
    !remoteCapabilities.compressionAlgorithms ||
    remoteCapabilities.compressionAlgorithms.length === 0
  ) {
    return {
      selectedAlgorithm: CompressionAlgorithm.NONE,
      success: true,
      error: undefined,
    };
  }

  // 转换为 Set 便于查找
  const localAlgorithms = new Set(localCapabilities.compressionAlgorithms);
  const remoteAlgorithms = new Set(remoteCapabilities.compressionAlgorithms);

  // 找出双方都支持的算法
  const commonAlgorithms: CompressionAlgorithm[] = [];
  for (const algo of localAlgorithms) {
    if (remoteAlgorithms.has(algo)) {
      commonAlgorithms.push(algo);
    }
  }

  // 按优先级排序（优先级数值越小越优先）
  commonAlgorithms.sort((a, b) => {
    const priorityA = ALGORITHM_PRIORITY[a] ?? Number.MAX_SAFE_INTEGER;
    const priorityB = ALGORITHM_PRIORITY[b] ?? Number.MAX_SAFE_INTEGER;
    return priorityA - priorityB;
  });

  if (commonAlgorithms.length === 0) {
    // 没有共同支持的算法，使用 NONE
    return {
      selectedAlgorithm: CompressionAlgorithm.NONE,
      success: true,
      error: undefined,
    };
  }

  // 返回优先级最高的共同算法
  return {
    selectedAlgorithm: commonAlgorithms[0],
    success: true,
    error: undefined,
  };
}

/**
 * 创建默认能力配置
 * 默认支持 LZ4 压缩，优先使用 LZ4
 *
 * @returns TransportCapabilities 默认能力配置
 */
export function createDefaultCapabilities(): TransportCapabilities {
  return {
    compressionAlgorithms: [CompressionAlgorithm.LZ4, CompressionAlgorithm.NONE],
    maxMessageSize: 64 * 1024 * 1024, // 64MB
    version: 1,
  };
}

/**
 * 创建仅支持无压缩的能力配置
 *
 * @returns TransportCapabilities 仅支持 NONE 的配置
 */
export function createNoCompressionCapabilities(): TransportCapabilities {
  return {
    compressionAlgorithms: [CompressionAlgorithm.NONE],
    maxMessageSize: 64 * 1024 * 1024,
    version: 1,
  };
}

/**
 * 创建仅支持 LZ4 压缩的能力配置
 *
 * @returns TransportCapabilities 仅支持 LZ4 的配置
 */
export function createLZ4OnlyCapabilities(): TransportCapabilities {
  return {
    compressionAlgorithms: [CompressionAlgorithm.LZ4],
    maxMessageSize: 64 * 1024 * 1024,
    version: 1,
  };
}

/**
 * 验证能力配置是否有效
 *
 * @param capabilities 能力配置
 * @returns boolean 是否有效
 */
export function validateCapabilities(capabilities: TransportCapabilities): boolean {
  // 检查算法列表
  if (!Array.isArray(capabilities.compressionAlgorithms)) {
    return false;
  }

  if (capabilities.compressionAlgorithms.length === 0) {
    return false;
  }

  // 检查每个算法值是否有效
  for (const algo of capabilities.compressionAlgorithms) {
    if (!Object.values(CompressionAlgorithm).includes(algo)) {
      return false;
    }
  }

  // 检查 maxMessageSize
  if (capabilities.maxMessageSize !== undefined) {
    if (capabilities.maxMessageSize <= 0) {
      return false;
    }
  }

  // 检查 version
  if (capabilities.version !== undefined) {
    if (capabilities.version < 1) {
      return false;
    }
  }

  return true;
}
