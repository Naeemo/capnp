/**
 * Cap'n Proto MessageBuilder
 * 纯 TypeScript 实现
 */

import { Segment, WORD_SIZE } from './segment.js';
import { encodeStructPointer, encodeListPointer, PointerTag, ElementSize } from './pointer.js';
import { ListBuilder } from './list.js';

export class MessageBuilder {
  private segment: Segment;
  private rootSet: boolean = false;

  constructor() {
    // 预留消息头空间（假设单段）
    this.segment = new Segment(1024);
    // 预留 8 字节给段大小
    this.segment.allocate(1);
  }

  /**
   * 初始化根结构
   */
  initRoot(dataWords: number, pointerCount: number): StructBuilder {
    if (this.rootSet) {
      throw new Error('Root already initialized');
    }
    
    // 分配根结构空间
    const size = dataWords + pointerCount;
    const structOffset = this.segment.allocate(size);
    
    // 在位置 0 写入根指针
    const rootPtr = encodeStructPointer(structOffset - 1, dataWords, pointerCount);
    this.segment.setWord(0, rootPtr);
    
    this.rootSet = true;
    
    return new StructBuilder(this, 0, structOffset, dataWords, pointerCount);
  }

  /**
   * 序列化为 ArrayBuffer
   */
  toArrayBuffer(): ArrayBuffer {
    const segmentData = this.segment.asUint8Array();
    const wordCount = this.segment.wordCount;

    // 构建消息头
    // 第一个字：段数量-1（低32位）和第一段大小（高32位）
    const header = new ArrayBuffer(8);
    const headerView = new DataView(header);
    headerView.setUint32(0, 0, true);           // 段数量-1 = 0（单段）
    headerView.setUint32(4, wordCount, true);   // 第一段大小

    // 合并头和数据
    const result = new Uint8Array(8 + segmentData.byteLength);
    result.set(new Uint8Array(header), 0);
    result.set(segmentData, 8);

    return result.buffer;
  }

  /**
   * 获取段（内部使用）
   */
  getSegment(): Segment {
    return this.segment;
  }
}

/**
 * 结构构建器
 */
export class StructBuilder {
  constructor(
    private message: MessageBuilder,
    private segmentIndex: number,
    private wordOffset: number,
    private dataWords: number,
    private pointerCount: number
  ) {}

  /**
   * 设置 bool 字段
   */
  setBool(bitOffset: number, value: boolean): void {
    const byteOffset = Math.floor(bitOffset / 8);
    const bitInByte = bitOffset % 8;
    const segment = this.message.getSegment();
    const view = segment.dataView;
    const offset = this.wordOffset * WORD_SIZE + byteOffset;
    
    const current = view.getUint8(offset);
    const newValue = value 
      ? (current | (1 << bitInByte))
      : (current & ~(1 << bitInByte));
    view.setUint8(offset, newValue);
  }

  /**
   * 设置 int8 字段
   */
  setInt8(byteOffset: number, value: number): void {
    const segment = this.message.getSegment();
    segment.dataView.setInt8(this.wordOffset * WORD_SIZE + byteOffset, value);
  }

  /**
   * 设置 int16 字段
   */
  setInt16(byteOffset: number, value: number): void {
    const segment = this.message.getSegment();
    segment.dataView.setInt16(this.wordOffset * WORD_SIZE + byteOffset, value, true);
  }

  /**
   * 设置 int32 字段
   */
  setInt32(byteOffset: number, value: number): void {
    const segment = this.message.getSegment();
    segment.dataView.setInt32(this.wordOffset * WORD_SIZE + byteOffset, value, true);
  }

  /**
   * 设置 int64 字段
   */
  setInt64(byteOffset: number, value: bigint): void {
    const segment = this.message.getSegment();
    const offset = this.wordOffset * WORD_SIZE + byteOffset;
    segment.dataView.setUint32(offset, Number(value & BigInt(0xFFFFFFFF)), true);
    segment.dataView.setInt32(offset + 4, Number(value >> BigInt(32)), true);
  }

  /**
   * 设置 uint8 字段
   */
  setUint8(byteOffset: number, value: number): void {
    const segment = this.message.getSegment();
    segment.dataView.setUint8(this.wordOffset * WORD_SIZE + byteOffset, value);
  }

  /**
   * 设置 uint16 字段
   */
  setUint16(byteOffset: number, value: number): void {
    const segment = this.message.getSegment();
    segment.dataView.setUint16(this.wordOffset * WORD_SIZE + byteOffset, value, true);
  }

  /**
   * 设置 uint32 字段
   */
  setUint32(byteOffset: number, value: number): void {
    const segment = this.message.getSegment();
    segment.dataView.setUint32(this.wordOffset * WORD_SIZE + byteOffset, value, true);
  }

  /**
   * 设置 uint64 字段
   */
  setUint64(byteOffset: number, value: bigint): void {
    const segment = this.message.getSegment();
    const offset = this.wordOffset * WORD_SIZE + byteOffset;
    segment.dataView.setUint32(offset, Number(value & BigInt(0xFFFFFFFF)), true);
    segment.dataView.setUint32(offset + 4, Number(value >> BigInt(32)), true);
  }

  /**
   * 设置 float32 字段
   */
  setFloat32(byteOffset: number, value: number): void {
    const segment = this.message.getSegment();
    segment.dataView.setFloat32(this.wordOffset * WORD_SIZE + byteOffset, value, true);
  }

  /**
   * 设置 float64 字段
   */
  setFloat64(byteOffset: number, value: number): void {
    const segment = this.message.getSegment();
    segment.dataView.setFloat64(this.wordOffset * WORD_SIZE + byteOffset, value, true);
  }

  /**
   * 获取 uint16 字段（用于 UnionBuilder 读取 tag）
   */
  getUint16(byteOffset: number): number {
    const segment = this.message.getSegment();
    return segment.dataView.getUint16(this.wordOffset * WORD_SIZE + byteOffset, true);
  }

  /**
   * 设置文本字段
   */
  setText(pointerIndex: number, value: string): void {
    const ptrOffset = this.wordOffset + this.dataWords + pointerIndex;
    const segment = this.message.getSegment();
    
    // 编码文本
    const bytes = new TextEncoder().encode(value + '\0');
    const wordCount = Math.ceil(bytes.length / WORD_SIZE);
    const listOffset = segment.allocate(wordCount);
    
    // 写入文本数据
    new Uint8Array(segment.dataView.buffer, listOffset * WORD_SIZE, bytes.length).set(bytes);
    
    // 写入指针
    const ptr = encodeListPointer(listOffset - ptrOffset - 1, ElementSize.BYTE, bytes.length);
    segment.setWord(ptrOffset, ptr);
  }

  /**
   * 初始化嵌套结构
   */
  initStruct(pointerIndex: number, dataWords: number, pointerCount: number): StructBuilder {
    const ptrOffset = this.wordOffset + this.dataWords + pointerIndex;
    const segment = this.message.getSegment();
    
    // 分配结构空间
    const size = dataWords + pointerCount;
    const structOffset = segment.allocate(size);
    
    // 写入指针
    const ptr = encodeStructPointer(structOffset - ptrOffset - 1, dataWords, pointerCount);
    segment.setWord(ptrOffset, ptr);
    
    return new StructBuilder(this.message, 0, structOffset, dataWords, pointerCount);
  }

  /**
   * 初始化列表
   */
  initList<T>(pointerIndex: number, elementSize: ElementSize, elementCount: number, structSize?: { dataWords: number; pointerCount: number }): ListBuilder<T> {
    const ptrOffset = this.wordOffset + this.dataWords + pointerIndex;
    const segment = this.message.getSegment();
    
    // 计算列表大小
    let elementWords = 1;
    if (elementSize === ElementSize.BYTE) elementWords = 1;
    else if (elementSize === ElementSize.TWO_BYTES) elementWords = 1;
    else if (elementSize === ElementSize.FOUR_BYTES) elementWords = 1;
    else if (elementSize === ElementSize.EIGHT_BYTES) elementWords = 1;
    else if (elementSize === ElementSize.COMPOSITE && structSize) {
      elementWords = structSize.dataWords + structSize.pointerCount;
    }
    
    const totalWords = elementWords * elementCount;
    const listOffset = segment.allocate(totalWords);
    
    // 写入指针
    const ptr = encodeListPointer(listOffset - ptrOffset - 1, elementSize, elementCount);
    segment.setWord(ptrOffset, ptr);
    
    return new ListBuilder<T>(this.message, elementSize, elementCount, structSize, listOffset);
  }
}
