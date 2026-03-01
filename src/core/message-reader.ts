/**
 * Cap'n Proto MessageReader
 * 纯 TypeScript 实现
 */

import { ListReader } from './list.js';
import {
  ElementSize,
  type FarPointer,
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

    if (ptr.tag === PointerTag.STRUCT) {
      const structPtr = ptr as StructPointer;
      const dataOffset = 1 + structPtr.offset; // 跳过指针本身
      return new StructReader(this, 0, dataOffset, structPtr.dataWords, structPtr.pointerCount);
    }

    if (ptr.tag === PointerTag.FAR) {
      // Far pointer: 指向另一个 segment 中的 landing pad
      const farPtr = ptr as FarPointer;
      const targetSegment = this.getSegment(farPtr.targetSegment);
      if (!targetSegment) {
        throw new Error(`Far pointer references non-existent segment ${farPtr.targetSegment}`);
      }

      if (farPtr.doubleFar) {
        // Double-far: landing pad 本身也是一个 far 指针
        // landing pad 位置: targetOffset 指向的位置
        const landingPadPtr = decodePointer(targetSegment.getWord(farPtr.targetOffset));
        if (landingPadPtr.tag !== PointerTag.FAR) {
          throw new Error('Double-far landing pad is not a far pointer');
        }
        const innerFarPtr = landingPadPtr as FarPointer;
        const finalSegment = this.getSegment(innerFarPtr.targetSegment);
        if (!finalSegment) {
          throw new Error(
            `Double-far references non-existent segment ${innerFarPtr.targetSegment}`
          );
        }
        // 实际的 struct 指针在 innerFarPtr.targetOffset
        const structPtr = decodePointer(
          finalSegment.getWord(innerFarPtr.targetOffset)
        ) as StructPointer;
        const dataOffset = innerFarPtr.targetOffset + 1 + structPtr.offset;
        return new StructReader(
          this,
          innerFarPtr.targetSegment,
          dataOffset,
          structPtr.dataWords,
          structPtr.pointerCount
        );
      }
      // Single-far: landing pad 是实际的 struct 指针
      const structPtr = decodePointer(targetSegment.getWord(farPtr.targetOffset)) as StructPointer;
      const dataOffset = farPtr.targetOffset + 1 + structPtr.offset;
      return new StructReader(
        this,
        farPtr.targetSegment,
        dataOffset,
        structPtr.dataWords,
        structPtr.pointerCount
      );
    }

    throw new Error(`Root pointer is not a struct or far pointer: ${ptr.tag}`);
  }

  /**
   * 获取段
   */
  getSegment(index: number): Segment | undefined {
    return this.segments[index];
  }

  /**
   * 解析指针，处理 far pointer 间接寻址
   * 返回 { segmentIndex, wordOffset, pointer }，其中 pointer 是实际的 struct/list 指针
   */
  resolvePointer(
    segmentIndex: number,
    wordOffset: number
  ): { segmentIndex: number; wordOffset: number; pointer: StructPointer | ListPointer } | null {
    const segment = this.getSegment(segmentIndex);
    if (!segment) return null;

    const ptrValue = segment.getWord(wordOffset);
    if (ptrValue === 0n) return null;

    const ptr = decodePointer(ptrValue);

    if (ptr.tag === PointerTag.STRUCT || ptr.tag === PointerTag.LIST) {
      // 直接指针，计算目标偏移
      const targetOffset = wordOffset + 1 + ptr.offset;
      return {
        segmentIndex,
        wordOffset: targetOffset,
        pointer: ptr as StructPointer | ListPointer,
      };
    }

    if (ptr.tag === PointerTag.FAR) {
      const farPtr = ptr as FarPointer;
      const targetSegment = this.getSegment(farPtr.targetSegment);
      if (!targetSegment) return null;

      if (farPtr.doubleFar) {
        // Double-far: landing pad 指向另一个 far 指针
        const landingPadPtr = decodePointer(targetSegment.getWord(farPtr.targetOffset));
        if (landingPadPtr.tag !== PointerTag.FAR) return null;
        const innerFarPtr = landingPadPtr as FarPointer;
        const finalSegment = this.getSegment(innerFarPtr.targetSegment);
        if (!finalSegment) return null;
        const finalPtr = decodePointer(finalSegment.getWord(innerFarPtr.targetOffset));
        if (finalPtr.tag !== PointerTag.STRUCT && finalPtr.tag !== PointerTag.LIST) return null;
        const targetOffset = innerFarPtr.targetOffset + 1 + finalPtr.offset;
        return {
          segmentIndex: innerFarPtr.targetSegment,
          wordOffset: targetOffset,
          pointer: finalPtr as StructPointer | ListPointer,
        };
      }
      // Single-far: landing pad 是实际的指针
      const landingPadPtr = decodePointer(targetSegment.getWord(farPtr.targetOffset));
      if (landingPadPtr.tag !== PointerTag.STRUCT && landingPadPtr.tag !== PointerTag.LIST)
        return null;
      const targetOffset = farPtr.targetOffset + 1 + landingPadPtr.offset;
      return {
        segmentIndex: farPtr.targetSegment,
        wordOffset: targetOffset,
        pointer: landingPadPtr as StructPointer | ListPointer,
      };
    }

    return null;
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
    const resolved = this.message.resolvePointer(this.segmentIndex, ptrOffset);

    if (!resolved) return '';

    const { segmentIndex, wordOffset, pointer } = resolved;
    if (pointer.tag !== PointerTag.LIST) return '';

    const listPtr = pointer as ListPointer;
    const segment = this.message.getSegment(segmentIndex)!;

    // Text is stored as List(UInt8) with NUL terminator
    // elementCount includes the NUL terminator
    const byteLength = listPtr.elementCount > 0 ? listPtr.elementCount - 1 : 0;
    if (byteLength === 0) return '';

    // 读取文本字节
    const bytes = new Uint8Array(segment.dataView.buffer, wordOffset * WORD_SIZE, byteLength);
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
    const resolved = this.message.resolvePointer(this.segmentIndex, ptrOffset);

    if (!resolved) return undefined;

    const { segmentIndex, wordOffset, pointer } = resolved;
    if (pointer.tag !== PointerTag.STRUCT) return undefined;

    const structPtr = pointer as StructPointer;

    return new StructReader(
      this.message,
      segmentIndex,
      wordOffset,
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
    const resolved = this.message.resolvePointer(this.segmentIndex, ptrOffset);

    if (!resolved) return undefined;

    const { segmentIndex, wordOffset, pointer } = resolved;
    if (pointer.tag !== PointerTag.LIST) return undefined;

    const listPtr = pointer as ListPointer;
    let targetOffset = wordOffset;
    let elementCount = listPtr.elementCount;
    let actualStructSize = structSize;
    const segment = this.message.getSegment(segmentIndex)!;

    // For INLINE_COMPOSITE lists, read the tag word
    if (listPtr.elementSize === ElementSize.COMPOSITE) {
      const tagWord = segment.getWord(targetOffset);
      // Tag word: elementCount (32 bits) | dataWords (16 bits) | pointerCount (16 bits)
      elementCount = Number(tagWord & BigInt(0xffffffff));
      const dataWords = Number((tagWord >> BigInt(32)) & BigInt(0xffff));
      const pointerCount = Number((tagWord >> BigInt(48)) & BigInt(0xffff));
      actualStructSize = { dataWords, pointerCount };
      targetOffset += 1; // Skip tag word
    }

    return new ListReader<T>(
      this.message,
      segmentIndex,
      listPtr.elementSize,
      elementCount,
      actualStructSize,
      targetOffset
    );
  }
}
