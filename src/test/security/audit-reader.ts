/**
 * 安全审计读取器
 * 检测 Cap'n Proto 消息中的安全问题
 */

import { MessageReader } from '../../core/message-reader.js';
import { decodePointer, PointerTag, type StructPointer, type ListPointer } from '../../core/pointer.js';
import type { Segment } from '../../core/segment.js';
import { DEFAULT_SECURITY_OPTIONS, type SecurityOptions } from './malformed-messages.js';

/**
 * 安全问题严重程度
 */
export enum Severity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

/**
 * 安全问题类型
 */
export enum SecurityIssueType {
  TOO_MANY_SEGMENTS = 'too_many_segments',
  SEGMENT_TOO_LARGE = 'segment_too_large',
  MESSAGE_TOO_LARGE = 'message_too_large',
  DEEP_NESTING = 'deep_nesting',
  CIRCULAR_POINTER = 'circular_pointer',
  NEGATIVE_OFFSET = 'negative_offset',
  OFFSET_OUT_OF_BOUNDS = 'offset_out_of_bounds',
  INVALID_FAR_POINTER = 'invalid_far_pointer',
  INVALID_POINTER_TAG = 'invalid_pointer_tag',
  NULL_POINTER_DEREFERENCE = 'null_pointer_dereference',
  OVERLAPPING_STRUCTS = 'overlapping_structs',
  SUSPICIOUS_DATA_PATTERN = 'suspicious_data_pattern',
}

/**
 * 安全问题报告
 */
export interface SecurityIssue {
  type: SecurityIssueType;
  severity: Severity;
  message: string;
  location?: {
    segmentIndex: number;
    wordOffset: number;
  };
  details?: Record<string, unknown>;
}

/**
 * 审计结果
 */
export interface AuditResult {
  valid: boolean;
  issues: SecurityIssue[];
  stats: {
    segmentCount: number;
    totalWords: number;
    maxNestingDepth: number;
    pointerCount: number;
  };
}

/**
 * 安全审计读取器
 * 在解析消息之前检测潜在的安全问题
 */
export class AuditReader {
  private options: Required<SecurityOptions>;
  private issues: SecurityIssue[] = [];
  private visitedPointers = new Set<string>();
  private maxNestingDepth = 0;
  private pointerCount = 0;

  constructor(options: SecurityOptions = {}) {
    this.options = { ...DEFAULT_SECURITY_OPTIONS, ...options };
  }

  /**
   * 审计消息
   */
  audit(buffer: ArrayBuffer | Uint8Array): AuditResult {
    this.issues = [];
    this.visitedPointers.clear();
    this.maxNestingDepth = 0;
    this.pointerCount = 0;

    const uint8Array = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;

    // 检查基本大小
    if (uint8Array.byteLength === 0) {
      return {
        valid: true,
        issues: [],
        stats: { segmentCount: 0, totalWords: 0, maxNestingDepth: 0, pointerCount: 0 },
      };
    }

    // 检查总大小
    if (uint8Array.byteLength > this.options.maxTotalSize) {
      this.addIssue(
        SecurityIssueType.MESSAGE_TOO_LARGE,
        Severity.CRITICAL,
        `Message size ${uint8Array.byteLength} exceeds maximum ${this.options.maxTotalSize}`,
        undefined,
        { size: uint8Array.byteLength, maxSize: this.options.maxTotalSize }
      );
    }

    // 检查最小头部大小
    if (uint8Array.byteLength < 8) {
      this.addIssue(
        SecurityIssueType.INVALID_POINTER_TAG,
        Severity.ERROR,
        `Message too small for header: ${uint8Array.byteLength} bytes`,
        undefined,
        { size: uint8Array.byteLength }
      );
      return this.buildResult(false);
    }

    // 解析头部
    const view = new DataView(uint8Array.buffer, uint8Array.byteOffset, uint8Array.byteLength);
    const segmentCountMinusOne = view.getUint32(0, true);
    const firstSegmentSize = view.getUint32(4, true);
    const segmentCount = segmentCountMinusOne + 1;

    // 检查段数
    if (segmentCount > this.options.maxSegmentCount) {
      this.addIssue(
        SecurityIssueType.TOO_MANY_SEGMENTS,
        Severity.CRITICAL,
        `Message has ${segmentCount} segments, exceeds maximum ${this.options.maxSegmentCount}`,
        undefined,
        { segmentCount, maxSegmentCount: this.options.maxSegmentCount }
      );
    }

    // 检查段大小
    if (firstSegmentSize > this.options.maxSegmentSize / 8) {
      this.addIssue(
        SecurityIssueType.SEGMENT_TOO_LARGE,
        Severity.CRITICAL,
        `First segment size ${firstSegmentSize} words exceeds maximum`,
        undefined,
        { size: firstSegmentSize, maxSize: this.options.maxSegmentSize / 8 }
      );
    }

    // 读取所有段大小
    const segmentSizes: number[] = [firstSegmentSize];
    let offset = 8;

    for (let i = 1; i < segmentCount; i++) {
      if (offset + 4 > uint8Array.byteLength) {
        this.addIssue(
          SecurityIssueType.INVALID_POINTER_TAG,
          Severity.ERROR,
          `Truncated segment size table at segment ${i}`,
          undefined,
          { segmentIndex: i }
        );
        return this.buildResult(false);
      }
      const size = view.getUint32(offset, true);
      segmentSizes.push(size);
      offset += 4;

      if (size > this.options.maxSegmentSize / 8) {
        this.addIssue(
          SecurityIssueType.SEGMENT_TOO_LARGE,
          Severity.CRITICAL,
          `Segment ${i} size ${size} words exceeds maximum`,
          undefined,
          { segmentIndex: i, size, maxSize: this.options.maxSegmentSize / 8 }
        );
      }
    }

    // 对齐到8字节
    offset = (offset + 7) & ~7;

    // 检查段数据是否完整
    let totalWords = 0;
    for (let i = 0; i < segmentCount; i++) {
      const size = segmentSizes[i];
      totalWords += size;
      const endOffset = offset + size * 8;

      if (endOffset > uint8Array.byteLength) {
        this.addIssue(
          SecurityIssueType.OFFSET_OUT_OF_BOUNDS,
          Severity.ERROR,
          `Segment ${i} extends beyond message boundary`,
          undefined,
          {
            segmentIndex: i,
            segmentEnd: endOffset,
            messageSize: uint8Array.byteLength,
          }
        );
        return this.buildResult(false);
      }
    }

    // 创建段数组用于进一步分析
    const segments: { dataView: DataView; wordCount: number }[] = [];
    for (let i = 0; i < segmentCount; i++) {
      const size = segmentSizes[i];
      if (offset + size * 8 <= uint8Array.byteLength) {
        segments.push({
          dataView: new DataView(uint8Array.buffer, uint8Array.byteOffset + offset, size * 8),
          wordCount: size,
        });
        offset += size * 8;
      }
    }

    // 分析根指针
    if (segments.length > 0) {
      this.analyzePointer(segments, 0, 0, 0);
    }

    return this.buildResult(this.issues.filter((i) => i.severity === Severity.ERROR || i.severity === Severity.CRITICAL).length === 0);
  }

  /**
   * 分析指针
   */
  private analyzePointer(
    segments: { dataView: DataView; wordCount: number }[],
    segmentIndex: number,
    wordOffset: number,
    depth: number
  ): void {
    if (depth > this.maxNestingDepth) {
      this.maxNestingDepth = depth;
    }

    if (depth > this.options.maxNestingDepth) {
      this.addIssue(
        SecurityIssueType.DEEP_NESTING,
        Severity.ERROR,
        `Nesting depth ${depth} exceeds maximum ${this.options.maxNestingDepth}`,
        { segmentIndex, wordOffset },
        { depth, maxDepth: this.options.maxNestingDepth }
      );
      return;
    }

    const pointerKey = `${segmentIndex}:${wordOffset}`;
    if (this.visitedPointers.has(pointerKey)) {
      this.addIssue(
        SecurityIssueType.CIRCULAR_POINTER,
        Severity.ERROR,
        `Circular pointer detected at segment ${segmentIndex}, offset ${wordOffset}`,
        { segmentIndex, wordOffset }
      );
      return;
    }
    this.visitedPointers.add(pointerKey);
    this.pointerCount++;

    const segment = segments[segmentIndex];
    if (!segment) {
      this.addIssue(
        SecurityIssueType.INVALID_FAR_POINTER,
        Severity.ERROR,
        `Pointer references non-existent segment ${segmentIndex}`,
        { segmentIndex, wordOffset }
      );
      return;
    }

    if (wordOffset < 0 || wordOffset >= segment.wordCount) {
      this.addIssue(
        SecurityIssueType.OFFSET_OUT_OF_BOUNDS,
        Severity.ERROR,
        `Pointer offset ${wordOffset} out of bounds [0, ${segment.wordCount})`,
        { segmentIndex, wordOffset },
        { offset: wordOffset, wordCount: segment.wordCount }
      );
      return;
    }

    const ptrValue = segment.dataView.getBigUint64(wordOffset * 8, true);

    if (ptrValue === 0n) {
      // Null pointer
      return;
    }

    const ptr = decodePointer(ptrValue);

    // 检查负偏移
    if (ptr.tag === PointerTag.STRUCT || ptr.tag === PointerTag.LIST) {
      const signedOffset =
        ptr.offset >= 0x20000000 ? ptr.offset - 0x40000000 : ptr.offset;

      if (signedOffset < 0) {
        this.addIssue(
          SecurityIssueType.NEGATIVE_OFFSET,
          Severity.WARNING,
          `Negative pointer offset: ${signedOffset}`,
          { segmentIndex, wordOffset },
          { offset: signedOffset, rawOffset: ptr.offset }
        );
      }

      if (Math.abs(signedOffset) > this.options.maxPointerOffset) {
        this.addIssue(
          SecurityIssueType.OFFSET_OUT_OF_BOUNDS,
          Severity.ERROR,
          `Pointer offset ${signedOffset} exceeds maximum ${this.options.maxPointerOffset}`,
          { segmentIndex, wordOffset },
          { offset: signedOffset, maxOffset: this.options.maxPointerOffset }
        );
      }
    }

    switch (ptr.tag) {
      case PointerTag.STRUCT: {
        const structPtr = ptr as StructPointer;
        const targetOffset = wordOffset + 1 + structPtr.offset;

        // 检查目标是否在段内
        if (targetOffset < 0 || targetOffset + structPtr.dataWords + structPtr.pointerCount > segment.wordCount) {
          this.addIssue(
            SecurityIssueType.OFFSET_OUT_OF_BOUNDS,
            Severity.ERROR,
            `Struct target at offset ${targetOffset} out of bounds`,
            { segmentIndex, wordOffset },
            {
              targetOffset,
              dataWords: structPtr.dataWords,
              pointerCount: structPtr.pointerCount,
              wordCount: segment.wordCount,
            }
          );
          return;
        }

        // 递归分析指针段
        const pointerSectionStart = targetOffset + structPtr.dataWords;
        for (let i = 0; i < structPtr.pointerCount; i++) {
          this.analyzePointer(segments, segmentIndex, pointerSectionStart + i, depth + 1);
        }
        break;
      }

      case PointerTag.LIST: {
        const listPtr = ptr as ListPointer;
        // 基本检查
        break;
      }

      case PointerTag.FAR: {
        if (!this.options.allowFarPointers) {
          this.addIssue(
            SecurityIssueType.INVALID_FAR_POINTER,
            Severity.WARNING,
            'Far pointers are not allowed',
            { segmentIndex, wordOffset }
          );
          return;
        }

        // 检查 far pointer 目标段
        const targetSegment = (Number(ptrValue >> BigInt(32)) & 0xffffffff);
        if (targetSegment >= segments.length) {
          this.addIssue(
            SecurityIssueType.INVALID_FAR_POINTER,
            Severity.ERROR,
            `Far pointer references non-existent segment ${targetSegment}`,
            { segmentIndex, wordOffset },
            { targetSegment, segmentCount: segments.length }
          );
          return;
        }

        // 检查 double-far
        const isDoubleFar = (Number(ptrValue >> BigInt(2)) & 1) === 1;
        const targetOffset = Number((ptrValue >> BigInt(3)) & BigInt(0x1fffffff));
        
        // 递归分析 landing pad（单 far 和 double far 都需要）
        this.analyzePointer(segments, targetSegment, targetOffset, depth + 1);
        break;
      }

      case PointerTag.OTHER:
        this.addIssue(
          SecurityIssueType.INVALID_POINTER_TAG,
          Severity.WARNING,
          'Unknown pointer tag (OTHER)',
          { segmentIndex, wordOffset },
          { pointerValue: ptrValue.toString(16) }
        );
        break;
    }
  }

  /**
   * 添加问题
   */
  private addIssue(
    type: SecurityIssueType,
    severity: Severity,
    message: string,
    location?: { segmentIndex: number; wordOffset: number },
    details?: Record<string, unknown>
  ): void {
    this.issues.push({
      type,
      severity,
      message,
      location,
      details,
    });
  }

  /**
   * 构建结果
   */
  private buildResult(valid: boolean): AuditResult {
    return {
      valid,
      issues: [...this.issues],
      stats: {
        segmentCount: this.visitedPointers.size > 0 ? 1 : 0,
        totalWords: 0, // 会在调用者中计算
        maxNestingDepth: this.maxNestingDepth,
        pointerCount: this.pointerCount,
      },
    };
  }

  /**
   * 快速检查消息是否可能有效
   */
  static isProbablyValid(buffer: ArrayBuffer | Uint8Array, options?: SecurityOptions): boolean {
    const auditor = new AuditReader(options);
    const result = auditor.audit(buffer);
    return result.valid;
  }
}
