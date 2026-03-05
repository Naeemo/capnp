/**
 * 畸形消息测试用例
 * 用于安全测试的各种恶意构造消息
 */

import { PointerTag, encodeFarPointer, encodeStructPointer } from '../../core/pointer.js';

/**
 * 畸形消息类型
 */
export enum MalformedType {
  TOO_MANY_SEGMENTS = 'too_many_segments',
  SEGMENT_SIZE_EXCEEDS_MESSAGE = 'segment_size_exceeds_message',
  NEGATIVE_POINTER_OFFSET = 'negative_pointer_offset',
  CIRCULAR_FAR_POINTER = 'circular_far_pointer',
  DEEP_NESTING = 'deep_nesting',
  ZERO_LENGTH_MESSAGE = 'zero_length_message',
  TRUNCATED_HEADER = 'truncated_header',
  INVALID_FAR_POINTER_SEGMENT = 'invalid_far_pointer_segment',
  HUGE_STRUCT_POINTER = 'huge_struct_pointer',
  OVERLAPPING_POINTERS = 'overlapping_pointers',
  UNALIGNED_SEGMENT_COUNT = 'unaligned_segment_count',
  NEGATIVE_SEGMENT_SIZE = 'negative_segment_size',
}

/**
 * 畸形消息生成器
 * 避免 class 只包含 static 成员，改用 namespace
 */
export namespace MalformedMessageGenerator {
  /**
   * 超大段数（>64）
   * Cap'n Proto 协议规定段数最多为 2^32，但实践中通常限制在较小范围
   */
  export function tooManySegments(segmentCount = 100): ArrayBuffer {
    const buffer = new ArrayBuffer(8 + segmentCount * 4);
    const view = new DataView(buffer);

    // Header: segmentCount - 1 (low 32 bits), firstSegmentSize = 1 (high 32 bits)
    view.setUint32(0, segmentCount - 1, true);
    view.setUint32(4, 1, true);

    // 写入剩余的段大小（都是1）
    for (let i = 1; i < segmentCount; i++) {
      view.setUint32(8 + (i - 1) * 4, 1, true);
    }

    return buffer;
  }

  /**
   * 段大小超过消息总大小
   */
  export function segmentSizeExceedsMessage(): ArrayBuffer {
    const buffer = new ArrayBuffer(16);
    const view = new DataView(buffer);

    // Header: 1 segment, size = 0xFFFFFFFF (远大于实际大小)
    view.setUint32(0, 0, true);
    view.setUint32(4, 0xffffffff, true);

    // 一个假的根指针
    view.setBigUint64(8, 0n, true);

    return buffer;
  }

  /**
   * 负值指针偏移
   * 创建一个指向消息开始之前的指针
   */
  export function negativePointerOffset(): ArrayBuffer {
    const buffer = new ArrayBuffer(24);
    const view = new DataView(buffer);

    // Header: 1 segment, size = 2 words
    view.setUint32(0, 0, true);
    view.setUint32(4, 2, true);

    // Struct pointer with negative offset (-1)
    // Offset field: 0x3FFFFFFF (max negative when interpreted as signed 30-bit)
    const negativeOffset = 0x3fffffff;
    const ptr = (BigInt(negativeOffset) << BigInt(2)) | BigInt(PointerTag.STRUCT);
    view.setBigUint64(8, ptr, true);

    // 一些数据
    view.setUint32(16, 0xdeadbeef, true);

    return buffer;
  }

  /**
   * 循环 Far Pointer
   * 创建一个指向自己的 far pointer
   */
  export function circularFarPointer(): ArrayBuffer {
    const buffer = new ArrayBuffer(48);
    const view = new DataView(buffer);

    // Header: 2 segments
    view.setUint32(0, 1, true); // segmentCount - 1 = 1
    view.setUint32(4, 2, true); // segment 0 size = 2 words
    view.setUint32(8, 2, true); // segment 1 size = 2 words
    // Padding: bytes 12-15

    // Segment 0: Far pointer at offset 16 pointing to itself (segment 0, offset 0)
    const farPtr = encodeFarPointer(0, 0, false);
    view.setBigUint64(16, farPtr, true);

    // Segment 1: at offset 32 (word 4)
    view.setBigUint64(32, 0n, true);
    view.setBigUint64(40, 0n, true);

    return buffer;
  }

  /**
   * 跨段循环 Far Pointer
   * segment 0 -> segment 1 -> segment 0
   */
  export function crossSegmentCircularFarPointer(): ArrayBuffer {
    const buffer = new ArrayBuffer(48);
    const view = new DataView(buffer);

    // Header: 2 segments
    view.setUint32(0, 1, true); // segmentCount - 1 = 1
    view.setUint32(4, 2, true); // segment 0 size = 2 words
    view.setUint32(8, 2, true); // segment 1 size = 2 words
    // Padding: bytes 12-15

    // Segment 0 at offset 16:
    // Far pointer pointing to segment 1, offset 0
    const farPtr0 = encodeFarPointer(1, 0, false);
    view.setBigUint64(16, farPtr0, true);

    // Segment 1 at offset 32:
    // Far pointer pointing back to segment 0, offset 0
    const farPtr1 = encodeFarPointer(0, 0, false);
    view.setBigUint64(32, farPtr1, true);

    return buffer;
  }

  /**
   * Double-far 循环
   */
  export function doubleFarCircular(): ArrayBuffer {
    const buffer = new ArrayBuffer(64);
    const view = new DataView(buffer);

    // Header: 2 segments
    view.setUint32(0, 1, true);
    view.setUint32(4, 3, true); // segment 0 size = 3 words
    view.setUint32(8, 3, true); // segment 1 size = 3 words
    // Padding to 8-byte: bytes 12-15

    // Segment 0 at offset 16:
    // Double-far pointer pointing to segment 1, offset 0
    const doubleFarPtr = encodeFarPointer(1, 0, true);
    view.setBigUint64(16, doubleFarPtr, true);

    // Segment 1 at offset 40:
    // Landing pad for double-far: another far pointer pointing back
    const landingPadPtr = encodeFarPointer(0, 0, false);
    view.setBigUint64(40, landingPadPtr, true);

    // Segment 0 at offset 24:
    // Landing pad target for the inner far pointer
    view.setBigUint64(24, 0n, true);

    return buffer;
  }

  /**
   * 深度嵌套结构（>100层）
   */
  export function deepNesting(depth = 101): ArrayBuffer {
    // 每层的开销：1个指针指向下一层 + 1个结构体
    // 结构体大小：dataWords=0, pointerCount=1
    // 每层需要2个字：1个指针 + 1个landing pad
    const wordsPerLayer = 2;
    const totalWords = 1 + depth * wordsPerLayer; // header word + layers

    const buffer = new ArrayBuffer(8 + totalWords * 8);
    const view = new DataView(buffer);

    // Header
    view.setUint32(0, 0, true);
    view.setUint32(4, totalWords, true);

    // Root struct pointer at word 1
    // Points to the first nested struct at word 2
    const rootPtr = encodeStructPointer(1, 0, 1);
    view.setBigUint64(8, rootPtr, true);

    let currentOffset = 2; // 从 word 2 开始

    for (let i = 0; i < depth; i++) {
      // 当前层的位置
      const structOffset = currentOffset;

      // 如果不是最后一层，写入指向下一个结构体的指针
      if (i < depth - 1) {
        // 指向下一个结构体（偏移1个字）
        const nextPtr = encodeStructPointer(1, 0, 1);
        view.setBigUint64(structOffset * 8 + 8, nextPtr, true);
      }

      currentOffset += wordsPerLayer;
    }

    return buffer;
  }

  /**
   * 零长度消息
   */
  export function zeroLengthMessage(): ArrayBuffer {
    return new ArrayBuffer(0);
  }

  /**
   * 极小消息（小于头部大小）
   */
  export function truncatedHeader(): ArrayBuffer {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setUint32(0, 0, true);
    return buffer;
  }

  /**
   * 无效的 far pointer 段索引
   */
  export function invalidFarPointerSegment(): ArrayBuffer {
    const buffer = new ArrayBuffer(32);
    const view = new DataView(buffer);

    // Header: 1 segment
    view.setUint32(0, 0, true);
    view.setUint32(4, 2, true);

    // Far pointer pointing to non-existent segment 99
    const farPtr = encodeFarPointer(99, 0, false);
    view.setBigUint64(8, farPtr, true);

    // Some data
    view.setBigUint64(16, 0n, true);

    return buffer;
  }

  /**
   * 巨大的 struct pointer（声称有大量数据）
   */
  export function hugeStructPointer(): ArrayBuffer {
    const buffer = new ArrayBuffer(24);
    const view = new DataView(buffer);

    // Header: 1 segment, size = 2 words
    view.setUint32(0, 0, true);
    view.setUint32(4, 2, true);

    // Struct pointer claiming 0xFFFF data words and 0xFFFF pointer count
    // This would require a huge amount of memory
    const ptr =
      (BigInt(0xffff) << BigInt(32)) | (BigInt(0xffff) << BigInt(48)) | BigInt(PointerTag.STRUCT);
    view.setBigUint64(8, ptr, true);

    return buffer;
  }

  /**
   * 重叠的指针（两个指针指向同一位置）
   */
  export function overlappingPointers(): ArrayBuffer {
    const buffer = new ArrayBuffer(48);
    const view = new DataView(buffer);

    // Header: 1 segment
    view.setUint32(0, 0, true);
    view.setUint32(4, 4, true);

    // Root struct: dataWords=0, pointerCount=2
    const rootPtr = encodeStructPointer(1, 0, 2);
    view.setBigUint64(8, rootPtr, true);

    // Pointer section at word 2 and 3
    // Both pointers point to the same location (word 4)
    const sharedPtr = encodeStructPointer(2, 1, 0);
    view.setBigUint64(16, sharedPtr, true); // pointer 0
    view.setBigUint64(24, sharedPtr, true); // pointer 1

    // Target struct at word 4
    view.setInt32(32, 42, true);

    return buffer;
  }

  /**
   * 未对齐的段数（导致头部未对齐到8字节）
   */
  export function unalignedSegmentCount(): ArrayBuffer {
    // Header: 8 + (3-1)*4 = 16 bytes, then padded to 16
    // Segment data: 3 segments * 1 word * 8 bytes = 24 bytes
    const buffer = new ArrayBuffer(40); // 16 + 24
    const view = new DataView(buffer);

    // Header with 3 segments
    // This creates a header with 3 segment sizes (12 bytes) + 4 padding = 16 bytes
    view.setUint32(0, 2, true); // segmentCount - 1 = 2 (3 segments)
    view.setUint32(4, 1, true); // segment 0 size = 1 word
    view.setUint32(8, 1, true); // segment 1 size = 1 word
    view.setUint32(12, 1, true); // segment 2 size = 1 word

    // Padding at bytes 12-15 is implicit (just part of header)

    // Segment data starts at offset 16 (after header)
    // Segment 0 at offset 16
    view.setBigUint64(16, 0n, true);
    // Segment 1 at offset 24
    view.setBigUint64(24, 0n, true);
    // Segment 2 at offset 32
    view.setBigUint64(32, 0n, true);

    return buffer;
  }

  /**
   * 负段大小（最高位被设置）
   */
  export function negativeSegmentSize(): ArrayBuffer {
    const buffer = new ArrayBuffer(16);
    const view = new DataView(buffer);

    // Header with negative segment size (MSB set)
    view.setUint32(0, 0, true);
    view.setInt32(4, -1, true); // -1 as signed, 0xFFFFFFFF as unsigned

    return buffer;
  }

  /**
   * 生成所有类型的畸形消息
   */
  export function generateAll(): Map<MalformedType, ArrayBuffer> {
    return new Map([
      [MalformedType.TOO_MANY_SEGMENTS, MalformedMessageGenerator.tooManySegments()],
      [
        MalformedType.SEGMENT_SIZE_EXCEEDS_MESSAGE,
        MalformedMessageGenerator.segmentSizeExceedsMessage(),
      ],
      [MalformedType.NEGATIVE_POINTER_OFFSET, MalformedMessageGenerator.negativePointerOffset()],
      [MalformedType.CIRCULAR_FAR_POINTER, MalformedMessageGenerator.circularFarPointer()],
      [MalformedType.DEEP_NESTING, MalformedMessageGenerator.deepNesting()],
      [MalformedType.ZERO_LENGTH_MESSAGE, MalformedMessageGenerator.zeroLengthMessage()],
      [MalformedType.TRUNCATED_HEADER, MalformedMessageGenerator.truncatedHeader()],
      [
        MalformedType.INVALID_FAR_POINTER_SEGMENT,
        MalformedMessageGenerator.invalidFarPointerSegment(),
      ],
      [MalformedType.HUGE_STRUCT_POINTER, MalformedMessageGenerator.hugeStructPointer()],
      [MalformedType.OVERLAPPING_POINTERS, MalformedMessageGenerator.overlappingPointers()],
      [MalformedType.UNALIGNED_SEGMENT_COUNT, MalformedMessageGenerator.unalignedSegmentCount()],
      [MalformedType.NEGATIVE_SEGMENT_SIZE, MalformedMessageGenerator.negativeSegmentSize()],
    ]);
  }

  /**
   * 生成特定类型的畸形消息
   */
  export function generate(type: MalformedType, ...args: unknown[]): ArrayBuffer {
    switch (type) {
      case MalformedType.TOO_MANY_SEGMENTS:
        return MalformedMessageGenerator.tooManySegments(args[0] as number);
      case MalformedType.SEGMENT_SIZE_EXCEEDS_MESSAGE:
        return MalformedMessageGenerator.segmentSizeExceedsMessage();
      case MalformedType.NEGATIVE_POINTER_OFFSET:
        return MalformedMessageGenerator.negativePointerOffset();
      case MalformedType.CIRCULAR_FAR_POINTER:
        return MalformedMessageGenerator.circularFarPointer();
      case MalformedType.DEEP_NESTING:
        return MalformedMessageGenerator.deepNesting(args[0] as number);
      case MalformedType.ZERO_LENGTH_MESSAGE:
        return MalformedMessageGenerator.zeroLengthMessage();
      case MalformedType.TRUNCATED_HEADER:
        return MalformedMessageGenerator.truncatedHeader();
      case MalformedType.INVALID_FAR_POINTER_SEGMENT:
        return MalformedMessageGenerator.invalidFarPointerSegment();
      case MalformedType.HUGE_STRUCT_POINTER:
        return MalformedMessageGenerator.hugeStructPointer();
      case MalformedType.OVERLAPPING_POINTERS:
        return MalformedMessageGenerator.overlappingPointers();
      case MalformedType.UNALIGNED_SEGMENT_COUNT:
        return MalformedMessageGenerator.unalignedSegmentCount();
      case MalformedType.NEGATIVE_SEGMENT_SIZE:
        return MalformedMessageGenerator.negativeSegmentSize();
      default:
        throw new Error(`Unknown malformed type: ${type}`);
    }
  }
}

/**
 * 安全消息选项
 */
export interface SecurityOptions {
  maxSegmentCount?: number;
  maxSegmentSize?: number;
  maxNestingDepth?: number;
  maxTotalSize?: number;
  maxPointerOffset?: number;
  allowFarPointers?: boolean;
}

/**
 * 默认安全选项
 */
export const DEFAULT_SECURITY_OPTIONS: Required<SecurityOptions> = {
  maxSegmentCount: 64,
  maxSegmentSize: 64 * 1024 * 1024, // 64MB
  maxNestingDepth: 100,
  maxTotalSize: 512 * 1024 * 1024, // 512MB
  maxPointerOffset: 1024 * 1024 * 1024, // 1GB (in words)
  allowFarPointers: true,
};
