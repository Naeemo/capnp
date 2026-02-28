/**
 * Cap'n Proto MessageReader
 * 纯 TypeScript 实现
 */

import { ListReader } from './list.js';
import {
  type ElementSize,
  type ListPointer,
  PointerTag,
  type StructPointer,
  decodePointer,
} from './pointer.js';
import { Segment, WORD_SIZE } from './segment.js';

export class MessageReader {
  private segments: Segment[];

  constructor(buffer: ArrayBuffer | Uint8Array) {
    const uint8Array = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;

    // 初始化空段数组（用于无效消息）
    this.segments = [];

    // 检查最小大小（至少需要8字节的头部）
    if (uint8Array.byteLength < 8) {
      // 消息太小，视为空消息
      return;
    }

    // 解析消息头
    // 第一个字：段数量-1（低32位）和第一段大小（高32位）
    const view = new DataView(uint8Array.buffer, uint8Array.byteOffset, uint8Array.byteLength);
    const firstWordLow = view.getUint32(0, true);
    const firstWordHigh = view.getUint32(4, true);

    const segmentCount = (firstWordLow & 0xffffffff) + 1;
    const firstSegmentSize = firstWordHigh;

    let offset = 8;
    const segmentSizes: number[] = [firstSegmentSize];

    // 读取剩余段大小
    for (let i = 1; i < segmentCount; i++) {
      if (offset + 4 > uint8Array.byteLength) {
        // 消息过早结束，视为空消息
        this.segments = [];
        return;
      }
      segmentSizes.push(view.getUint32(offset, true));
      offset += 4;
    }

    // 对齐到 8 字节
    offset = (offset + 7) & ~7;

    // 检查是否有足够的空间容纳段表
    if (offset > uint8Array.byteLength) {
      this.segments = [];
      return;
    }

    // 创建段
    this.segments = [];
    for (const size of segmentSizes) {
      if (offset + size * WORD_SIZE > uint8Array.byteLength) {
        // 段数据不足，截断或视为空消息
        // 官方实现：返回已读取的部分
        break;
      }
      const segmentBuffer = uint8Array.slice(offset, offset + size * WORD_SIZE);
      this.segments.push(Segment.fromBuffer(segmentBuffer.buffer));
      offset += size * WORD_SIZE;
    }
  }

  /**
   * 获取根结构
   */
  getRoot(_dataWords: number, _pointerCount: number): StructReader {
    // root 指针在位置 0，解析它找到实际数据位置
    const segment = this.segments[0];
    const ptr = decodePointer(segment.getWord(0));

    if (ptr.tag !== PointerTag.STRUCT) {
      throw new Error('Root pointer is not a struct');
    }

    const structPtr = ptr as StructPointer;
    const dataOffset = 1 + structPtr.offset; // 跳过指针本身

    return new StructReader(this, 0, dataOffset, structPtr.dataWords, structPtr.pointerCount);
  }

  /**
   * 获取段
   */
  getSegment(index: number): Segment | undefined {
    return this.segments[index];
  }

  /**
   * 段数量
   */
  get segmentCount(): number {
    return this.segments.length;
  }
}

/**
 * 结构读取器
 */
export class StructReader {
  constructor(
    private message: MessageReader,
    private segmentIndex: number,
    private wordOffset: number,
    private dataWords: number,
    private pointerCount: number
  ) {}

  /**
   * 获取 bool 字段
   */
  getBool(bitOffset: number): boolean {
    const byteOffset = Math.floor(bitOffset / 8);
    const bitInByte = bitOffset % 8;
    const segment = this.message.getSegment(this.segmentIndex)!;
    const byte = segment.dataView.getUint8(this.wordOffset * WORD_SIZE + byteOffset);
    return (byte & (1 << bitInByte)) !== 0;
  }

  /**
   * 获取 int8 字段
   */
  getInt8(byteOffset: number): number {
    const segment = this.message.getSegment(this.segmentIndex)!;
    return segment.dataView.getInt8(this.wordOffset * WORD_SIZE + byteOffset);
  }

  /**
   * 获取 int16 字段
   */
  getInt16(byteOffset: number): number {
    const segment = this.message.getSegment(this.segmentIndex)!;
    return segment.dataView.getInt16(this.wordOffset * WORD_SIZE + byteOffset, true);
  }

  /**
   * 获取 int32 字段
   */
  getInt32(byteOffset: number): number {
    const segment = this.message.getSegment(this.segmentIndex)!;
    return segment.dataView.getInt32(this.wordOffset * WORD_SIZE + byteOffset, true);
  }

  /**
   * 获取 int64 字段
   */
  getInt64(byteOffset: number): bigint {
    const segment = this.message.getSegment(this.segmentIndex)!;
    const offset = this.wordOffset * WORD_SIZE + byteOffset;
    const low = BigInt(segment.dataView.getUint32(offset, true));
    const high = BigInt(segment.dataView.getInt32(offset + 4, true));
    return (high << BigInt(32)) | low;
  }

  /**
   * 获取 uint8 字段
   */
  getUint8(byteOffset: number): number {
    const segment = this.message.getSegment(this.segmentIndex)!;
    return segment.dataView.getUint8(this.wordOffset * WORD_SIZE + byteOffset);
  }

  /**
   * 获取 uint16 字段
   */
  getUint16(byteOffset: number): number {
    const segment = this.message.getSegment(this.segmentIndex)!;
    return segment.dataView.getUint16(this.wordOffset * WORD_SIZE + byteOffset, true);
  }

  /**
   * 获取 uint32 字段
   */
  getUint32(byteOffset: number): number {
    const segment = this.message.getSegment(this.segmentIndex)!;
    return segment.dataView.getUint32(this.wordOffset * WORD_SIZE + byteOffset, true);
  }

  /**
   * 获取 uint64 字段
   */
  getUint64(byteOffset: number): bigint {
    const segment = this.message.getSegment(this.segmentIndex)!;
    const offset = this.wordOffset * WORD_SIZE + byteOffset;
    const low = BigInt(segment.dataView.getUint32(offset, true));
    const high = BigInt(segment.dataView.getUint32(offset + 4, true));
    return (high << BigInt(32)) | low;
  }

  /**
   * 获取 float32 字段
   */
  getFloat32(byteOffset: number): number {
    const segment = this.message.getSegment(this.segmentIndex)!;
    return segment.dataView.getFloat32(this.wordOffset * WORD_SIZE + byteOffset, true);
  }

  /**
   * 获取 float64 字段
   */
  getFloat64(byteOffset: number): number {
    const segment = this.message.getSegment(this.segmentIndex)!;
    return segment.dataView.getFloat64(this.wordOffset * WORD_SIZE + byteOffset, true);
  }

  /**
   * 获取文本字段
   */
  getText(pointerIndex: number): string {
    const ptrOffset = this.wordOffset + this.dataWords + pointerIndex;
    const segment = this.message.getSegment(this.segmentIndex)!;
    const ptrValue = segment.getWord(ptrOffset);

    // Check for null pointer (all zeros)
    if (ptrValue === 0n) return '';

    const ptr = decodePointer(ptrValue);
    if (ptr.tag !== PointerTag.LIST) return '';

    const listPtr = ptr as ListPointer;
    const targetOffset = ptrOffset + 1 + listPtr.offset;

    // 读取文本字节
    const bytes = new Uint8Array(
      segment.dataView.buffer,
      targetOffset * WORD_SIZE,
      listPtr.elementCount - 1
    );
    return new TextDecoder().decode(bytes);
  }

  /**
   * 获取嵌套结构
   */
  getStruct(
    pointerIndex: number,
    _dataWords: number,
    _pointerCount: number
  ): StructReader | undefined {
    const ptrOffset = this.wordOffset + this.dataWords + pointerIndex;
    const segment = this.message.getSegment(this.segmentIndex)!;
    const ptrValue = segment.getWord(ptrOffset);

    // Check for null pointer (all zeros)
    if (ptrValue === 0n) return undefined;

    const ptr = decodePointer(ptrValue);
    if (ptr.tag !== PointerTag.STRUCT) return undefined;

    const structPtr = ptr as StructPointer;
    const targetOffset = ptrOffset + 1 + structPtr.offset;

    return new StructReader(
      this.message,
      this.segmentIndex,
      targetOffset,
      structPtr.dataWords,
      structPtr.pointerCount
    );
  }

  /**
   * 获取列表
   */
  getList<T>(
    pointerIndex: number,
    _elementSize: ElementSize,
    structSize?: { dataWords: number; pointerCount: number }
  ): ListReader<T> | undefined {
    const ptrOffset = this.wordOffset + this.dataWords + pointerIndex;
    const segment = this.message.getSegment(this.segmentIndex)!;
    const ptrValue = segment.getWord(ptrOffset);

    // Check for null pointer (all zeros)
    if (ptrValue === 0n) return undefined;

    const ptr = decodePointer(ptrValue);
    if (ptr.tag !== PointerTag.LIST) return undefined;

    const listPtr = ptr as ListPointer;
    const targetOffset = ptrOffset + 1 + listPtr.offset;

    return new ListReader<T>(
      this.message,
      this.segmentIndex,
      listPtr.elementSize,
      listPtr.elementCount,
      structSize,
      targetOffset
    );
  }
}
