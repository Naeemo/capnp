/**
 * Cap'n Proto List 实现
 * 纯 TypeScript
 */

import { type MessageBuilder, StructBuilder } from './message-builder.js';
import { type MessageReader, StructReader } from './message-reader.js';
import { ElementSize, type ListPointer, PointerTag, decodePointer } from './pointer.js';
import { type Segment, WORD_SIZE } from './segment.js';

/**
 * ListReader - 读取列表
 */
export class ListReader<T> {
  private segment: Segment;
  private startOffset: number; // 字偏移

  constructor(
    private message: MessageReader,
    segmentIndex: number,
    private elementSize: ElementSize,
    private elementCount: number,
    private structSize: { dataWords: number; pointerCount: number } | undefined,
    wordOffset: number
  ) {
    this.segment = message.getSegment(segmentIndex)!;
    this.startOffset = wordOffset;
  }

  /**
   * 列表长度
   */
  get length(): number {
    return this.elementCount;
  }

  /**
   * 获取元素（基础类型）
   */
  getPrimitive(index: number): number | bigint {
    if (index < 0 || index >= this.elementCount) {
      throw new RangeError('Index out of bounds');
    }

    switch (this.elementSize) {
      case ElementSize.BIT: {
        const byteOffset = Math.floor(index / 8);
        const bitInByte = index % 8;
        const byte = this.segment.dataView.getUint8(this.startOffset * WORD_SIZE + byteOffset);
        return (byte & (1 << bitInByte)) !== 0 ? 1 : 0;
      }

      case ElementSize.BYTE:
        return this.segment.dataView.getUint8(this.startOffset * WORD_SIZE + index);

      case ElementSize.TWO_BYTES:
        return this.segment.dataView.getUint16(this.startOffset * WORD_SIZE + index * 2, true);

      case ElementSize.FOUR_BYTES:
        return this.segment.dataView.getUint32(this.startOffset * WORD_SIZE + index * 4, true);

      case ElementSize.EIGHT_BYTES: {
        const offset = this.startOffset * WORD_SIZE + index * 8;
        const low = BigInt(this.segment.dataView.getUint32(offset, true));
        const high = BigInt(this.segment.dataView.getUint32(offset + 4, true));
        return (high << BigInt(32)) | low;
      }

      default:
        throw new Error(`Unsupported element size: ${this.elementSize}`);
    }
  }

  /**
   * 获取结构元素
   */
  getStruct(index: number): StructReader {
    if (!this.structSize) {
      throw new Error('Not a struct list');
    }

    const { dataWords, pointerCount } = this.structSize;
    const size = dataWords + pointerCount;
    const offset = this.startOffset + index * size;

    return new StructReader(this.message, 0, offset, dataWords, pointerCount);
  }

  /**
   * 迭代器
   */
  *[Symbol.iterator](): Iterator<T> {
    for (let i = 0; i < this.elementCount; i++) {
      yield this.getPrimitive(i) as T;
    }
  }
}

/**
 * ListBuilder - 构建列表
 */
export class ListBuilder<_T> {
  private segment: Segment;
  private startOffset: number;

  constructor(
    private message: MessageBuilder,
    private elementSize: ElementSize,
    private elementCount: number,
    private structSize: { dataWords: number; pointerCount: number } | undefined,
    wordOffset: number
  ) {
    this.segment = message.getSegment();
    this.startOffset = wordOffset;
  }

  /**
   * 列表长度
   */
  get length(): number {
    return this.elementCount;
  }

  /**
   * 设置基础类型元素
   */
  setPrimitive(index: number, value: number | bigint): void {
    if (index < 0 || index >= this.elementCount) {
      throw new RangeError('Index out of bounds');
    }

    switch (this.elementSize) {
      case ElementSize.BIT: {
        const byteOffset = Math.floor(index / 8);
        const bitInByte = index % 8;
        const offset = this.startOffset * WORD_SIZE + byteOffset;
        const current = this.segment.dataView.getUint8(offset);
        const newValue = value ? current | (1 << bitInByte) : current & ~(1 << bitInByte);
        this.segment.dataView.setUint8(offset, newValue);
        break;
      }

      case ElementSize.BYTE:
        this.segment.dataView.setUint8(this.startOffset * WORD_SIZE + index, Number(value));
        break;

      case ElementSize.TWO_BYTES:
        this.segment.dataView.setUint16(
          this.startOffset * WORD_SIZE + index * 2,
          Number(value),
          true
        );
        break;

      case ElementSize.FOUR_BYTES:
        this.segment.dataView.setUint32(
          this.startOffset * WORD_SIZE + index * 4,
          Number(value),
          true
        );
        break;

      case ElementSize.EIGHT_BYTES: {
        const offset = this.startOffset * WORD_SIZE + index * 8;
        const bigValue = value as bigint;
        this.segment.dataView.setUint32(offset, Number(bigValue & BigInt(0xffffffff)), true);
        this.segment.dataView.setUint32(offset + 4, Number(bigValue >> BigInt(32)), true);
        break;
      }

      default:
        throw new Error(`Unsupported element size: ${this.elementSize}`);
    }
  }

  /**
   * 获取结构元素（用于修改）
   */
  getStruct(index: number): StructBuilder {
    if (!this.structSize) {
      throw new Error('Not a struct list');
    }

    const { dataWords, pointerCount } = this.structSize;
    const size = dataWords + pointerCount;
    const offset = this.startOffset + index * size;

    return new StructBuilder(this.message, 0, offset, dataWords, pointerCount);
  }
}
