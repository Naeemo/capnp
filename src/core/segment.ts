/**
 * Cap'n Proto Segment 管理
 * 纯 TypeScript 实现
 */

export const WORD_SIZE = 8;

export class Segment {
  private buffer: ArrayBuffer;
  private view: DataView;
  private _size: number; // 当前已使用字节数

  constructor(initialCapacity = 1024) {
    this.buffer = new ArrayBuffer(initialCapacity);
    this.view = new DataView(this.buffer);
    this._size = 0;
  }

  /**
   * 从现有 buffer 创建（用于读取）
   */
  static fromBuffer(buffer: ArrayBuffer): Segment {
    const seg = new Segment(0);
    seg.buffer = buffer;
    seg.view = new DataView(buffer);
    seg._size = buffer.byteLength;
    return seg;
  }

  /**
   * 确保容量足够
   */
  private ensureCapacity(minBytes: number): void {
    if (this.buffer.byteLength >= minBytes) return;

    // 双倍扩展
    let newCapacity = this.buffer.byteLength * 2;
    while (newCapacity < minBytes) {
      newCapacity *= 2;
    }

    const newBuffer = new ArrayBuffer(newCapacity);
    new Uint8Array(newBuffer).set(new Uint8Array(this.buffer, 0, this._size));
    this.buffer = newBuffer;
    this.view = new DataView(newBuffer);
  }

  /**
   * 分配空间，返回字偏移
   */
  allocate(words: number): number {
    const bytes = words * WORD_SIZE;
    const offset = this._size;
    this.ensureCapacity(offset + bytes);
    this._size = offset + bytes;
    return offset / WORD_SIZE;
  }

  /**
   * 获取字（64位）
   */
  getWord(wordOffset: number): bigint {
    const byteOffset = wordOffset * WORD_SIZE;
    const low = BigInt(this.view.getUint32(byteOffset, true));
    const high = BigInt(this.view.getUint32(byteOffset + 4, true));
    return (high << BigInt(32)) | low;
  }

  /**
   * 设置字（64位）
   */
  setWord(wordOffset: number, value: bigint): void {
    const byteOffset = wordOffset * WORD_SIZE;
    this.view.setUint32(byteOffset, Number(value & BigInt(0xffffffff)), true);
    this.view.setUint32(byteOffset + 4, Number(value >> BigInt(32)), true);
  }

  /**
   * 获取原始 buffer（只读到 _size）
   */
  asUint8Array(): Uint8Array {
    return new Uint8Array(this.buffer, 0, this._size);
  }

  /**
   * 获取字数量
   */
  get wordCount(): number {
    return this._size / WORD_SIZE;
  }

  /**
   * 获取字节数量
   */
  get byteLength(): number {
    return this._size;
  }

  /**
   * 获取 DataView
   */
  get dataView(): DataView {
    return this.view;
  }
}
