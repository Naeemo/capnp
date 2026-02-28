import type { MessageReader, MessageBuilder } from './message.js';

/**
 * Base class for reading Cap'n Proto structs
 * Provides zero-copy access to structured data
 */
export abstract class StructReader {
  protected reader: MessageReader;
  protected offset: number;
  protected dataWords: number;
  protected pointerCount: number;

  constructor(
    reader: MessageReader,
    offset: number,
    dataWords: number,
    pointerCount: number
  ) {
    this.reader = reader;
    this.offset = offset;
    this.dataWords = dataWords;
    this.pointerCount = pointerCount;
  }

  // Boolean getters
  protected getBool(bitOffset: number): boolean {
    const byteOffset = Math.floor(bitOffset / 8);
    const bitInByte = bitOffset % 8;
    const segment = this.reader.getSegment(0);
    if (!segment) return false;
    return (segment[this.offset + byteOffset]! & (1 << bitInByte)) !== 0;
  }

  // Integer getters
  protected getInt8(byteOffset: number): number {
    const segment = this.reader.getSegment(0);
    if (!segment) return 0;
    const view = new DataView(segment.buffer, segment.byteOffset + this.offset + byteOffset, 1);
    return view.getInt8(0);
  }

  protected getInt16(byteOffset: number): number {
    const segment = this.reader.getSegment(0);
    if (!segment) return 0;
    const view = new DataView(segment.buffer, segment.byteOffset + this.offset + byteOffset, 2);
    return view.getInt16(0, true);
  }

  protected getInt32(byteOffset: number): number {
    const segment = this.reader.getSegment(0);
    if (!segment) return 0;
    const view = new DataView(segment.buffer, segment.byteOffset + this.offset + byteOffset, 4);
    return view.getInt32(0, true);
  }

  protected getInt64(byteOffset: number): bigint {
    const segment = this.reader.getSegment(0);
    if (!segment) return 0n;
    const view = new DataView(segment.buffer, segment.byteOffset + this.offset + byteOffset, 8);
    return view.getBigInt64(0, true);
  }

  protected getUint8(byteOffset: number): number {
    const segment = this.reader.getSegment(0);
    if (!segment) return 0;
    return segment[this.offset + byteOffset] ?? 0;
  }

  protected getUint16(byteOffset: number): number {
    const segment = this.reader.getSegment(0);
    if (!segment) return 0;
    const view = new DataView(segment.buffer, segment.byteOffset + this.offset + byteOffset, 2);
    return view.getUint16(0, true);
  }

  protected getUint32(byteOffset: number): number {
    const segment = this.reader.getSegment(0);
    if (!segment) return 0;
    const view = new DataView(segment.buffer, segment.byteOffset + this.offset + byteOffset, 4);
    return view.getUint32(0, true);
  }

  protected getUint64(byteOffset: number): bigint {
    const segment = this.reader.getSegment(0);
    if (!segment) return 0n;
    const view = new DataView(segment.buffer, segment.byteOffset + this.offset + byteOffset, 8);
    return view.getBigUint64(0, true);
  }

  // Float getters
  protected getFloat32(byteOffset: number): number {
    const segment = this.reader.getSegment(0);
    if (!segment) return 0;
    const view = new DataView(segment.buffer, segment.byteOffset + this.offset + byteOffset, 4);
    return view.getFloat32(0, true);
  }

  protected getFloat64(byteOffset: number): number {
    const segment = this.reader.getSegment(0);
    if (!segment) return 0;
    const view = new DataView(segment.buffer, segment.byteOffset + this.offset + byteOffset, 8);
    return view.getFloat64(0, true);
  }

  // Text/Data getters
  protected getText(pointerIndex: number): string {
    const ptr = this.readPointer(pointerIndex);
    if (!ptr) return '';
    // Decode UTF-8 text from the pointed location
    const segment = this.reader.getSegment(ptr.segment);
    if (!segment) return '';
    const bytes = segment.subarray(ptr.offset, ptr.offset + ptr.size);
    return new TextDecoder().decode(bytes);
  }

  protected getData(pointerIndex: number): Uint8Array {
    const ptr = this.readPointer(pointerIndex);
    if (!ptr) return new Uint8Array();
    const segment = this.reader.getSegment(ptr.segment);
    if (!segment) return new Uint8Array();
    return segment.subarray(ptr.offset, ptr.offset + ptr.size);
  }

  // List getter
  protected getList<T>(pointerIndex: number, elementType: unknown): List<T> {
    const ptr = this.readPointer(pointerIndex);
    if (!ptr) return new List<T>();
    return new List<T>(this.reader, ptr.segment, ptr.offset, ptr.size, elementType);
  }

  // Struct getter
  protected getStruct<T extends StructReader>(
    pointerIndex: number,
    ReaderClass: new (reader: MessageReader, offset: number) => T
  ): T | undefined {
    const ptr = this.readPointer(pointerIndex);
    if (!ptr) return undefined;
    return new ReaderClass(this.reader, ptr.offset);
  }

  // Enum getter
  protected getEnum(pointerIndex: number, enumType: unknown): number {
    return this.getUint16(pointerIndex * 2);
  }

  private readPointer(pointerIndex: number): { segment: number; offset: number; size: number } | undefined {
    const wasmReader = this.reader.getWasmReader();
    const info = wasmReader.read_pointer(0, this.offset + this.dataWords * 8 + pointerIndex * 8);
    if (!info) return undefined;
    return {
      segment: info.target_segment,
      offset: info.offset,
      size: info.element_count,
    };
  }
}

/**
 * Base class for building Cap'n Proto structs
 */
export abstract class StructBuilder {
  protected builder: MessageBuilder;
  protected offset: number;
  protected dataWords: number;
  protected pointerCount: number;

  constructor(
    builder: MessageBuilder,
    offset: number,
    dataWords: number,
    pointerCount: number
  ) {
    this.builder = builder;
    this.offset = offset;
    this.dataWords = dataWords;
    this.pointerCount = pointerCount;
  }

  // Protected setter methods
  protected _setBool(bitOffset: number, value: boolean): void {
    const byteOffset = Math.floor(bitOffset / 8);
    const bitInByte = bitOffset % 8;
    const wasmBuilder = this.builder.getWasmBuilder();
    // Read current byte, modify bit, write back
    // This requires read capability - for now, assume we can write directly
    // In practice, we need to track dirty bytes or read-modify-write
    const currentByte = this._readByte(byteOffset);
    const newByte = value 
      ? (currentByte | (1 << bitInByte))
      : (currentByte & ~(1 << bitInByte));
    this._writeByte(byteOffset, newByte);
  }

  protected _setInt8(byteOffset: number, value: number): void {
    const wasmBuilder = this.builder.getWasmBuilder();
    const view = new DataView(new ArrayBuffer(1));
    view.setInt8(0, value);
    const wordValue = view.getUint8(0);
    wasmBuilder.write_word(0, this.offset + byteOffset, wordValue);
  }

  protected _setInt16(byteOffset: number, value: number): void {
    const wasmBuilder = this.builder.getWasmBuilder();
    const view = new DataView(new ArrayBuffer(2));
    view.setInt16(0, value, true);
    const wordValue = view.getUint16(0, true);
    wasmBuilder.write_word(0, this.offset + byteOffset, wordValue);
  }

  protected _setInt32(byteOffset: number, value: number): void {
    const wasmBuilder = this.builder.getWasmBuilder();
    const view = new DataView(new ArrayBuffer(4));
    view.setInt32(0, value, true);
    const wordValue = view.getUint32(0, true);
    wasmBuilder.write_word(0, this.offset + byteOffset, wordValue);
  }

  protected _setInt64(byteOffset: number, value: bigint): void {
    const wasmBuilder = this.builder.getWasmBuilder();
    const view = new DataView(new ArrayBuffer(8));
    view.setBigInt64(0, value, true);
    const wordValue = view.getBigUint64(0, true);
    wasmBuilder.write_word(0, this.offset + byteOffset, wordValue);
  }

  protected _setUint8(byteOffset: number, value: number): void {
    const wasmBuilder = this.builder.getWasmBuilder();
    wasmBuilder.write_word(0, this.offset + byteOffset, value & 0xFF);
  }

  protected _setUint16(byteOffset: number, value: number): void {
    const wasmBuilder = this.builder.getWasmBuilder();
    wasmBuilder.write_word(0, this.offset + byteOffset, value & 0xFFFF);
  }

  protected _setUint32(byteOffset: number, value: number): void {
    const wasmBuilder = this.builder.getWasmBuilder();
    // For 32-bit values, we write to the lower 32 bits
    const lowWord = value >>> 0;
    wasmBuilder.write_word(0, this.offset + byteOffset, lowWord);
  }

  protected _setUint64(byteOffset: number, value: bigint): void {
    const wasmBuilder = this.builder.getWasmBuilder();
    wasmBuilder.write_word(0, this.offset + byteOffset, value);
  }

  protected _setFloat32(byteOffset: number, value: number): void {
    const wasmBuilder = this.builder.getWasmBuilder();
    const view = new DataView(new ArrayBuffer(4));
    view.setFloat32(0, value, true);
    const wordValue = view.getUint32(0, true);
    wasmBuilder.write_word(0, this.offset + byteOffset, wordValue);
  }

  protected _setFloat64(byteOffset: number, value: number): void {
    const wasmBuilder = this.builder.getWasmBuilder();
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, value, true);
    const wordValue = view.getBigUint64(0, true);
    wasmBuilder.write_word(0, this.offset + byteOffset, wordValue);
  }

  protected _setText(pointerIndex: number, value: string): void {
    const wasmBuilder = this.builder.getWasmBuilder();
    const bytes = new TextEncoder().encode(value);
    // Allocate space for the text (including null terminator)
    const alloc = wasmBuilder.allocate_list(1, bytes.length + 1);
    // Write the text bytes
    for (let i = 0; i < bytes.length; i++) {
      wasmBuilder.write_word(alloc.segment, alloc.offset + i, bytes[i]!);
    }
    // Write null terminator
    wasmBuilder.write_word(alloc.segment, alloc.offset + bytes.length, 0);
    // Write the pointer
    wasmBuilder.write_list_pointer(0, this.offset + this.dataWords * 8 + pointerIndex * 8, 
                                 alloc.offset, 2, bytes.length + 1); // ElementSize 2 = BYTE
  }

  protected _setData(pointerIndex: number, value: Uint8Array): void {
    const wasmBuilder = this.builder.getWasmBuilder();
    // Allocate space for the data
    const alloc = wasmBuilder.allocate_list(1, value.length);
    // Write the data bytes
    for (let i = 0; i < value.length; i++) {
      wasmBuilder.write_word(alloc.segment, alloc.offset + i, value[i]!);
    }
    // Write the pointer
    wasmBuilder.write_list_pointer(0, this.offset + this.dataWords * 8 + pointerIndex * 8,
                                 alloc.offset, 2, value.length); // ElementSize 2 = BYTE
  }

  // Helper methods for read-modify-write operations
  private _readByte(byteOffset: number): number {
    // This is a placeholder - in practice, we'd need to read from WASM memory
    // For now, return 0 (assumes byte was zero-initialized)
    return 0;
  }

  private _writeByte(byteOffset: number, value: number): void {
    const wasmBuilder = this.builder.getWasmBuilder();
    wasmBuilder.write_word(0, this.offset + byteOffset, value & 0xFF);
  }
}

/**
 * List accessor for Cap'n Proto lists
 */
export class List<T> {
  private reader: MessageReader;
  private segment: number;
  private offset: number;
  private size: number;
  private elementType: unknown;

  constructor(
    reader?: MessageReader,
    segment?: number,
    offset?: number,
    size?: number,
    elementType?: unknown
  ) {
    this.reader = reader!;
    this.segment = segment ?? 0;
    this.offset = offset ?? 0;
    this.size = size ?? 0;
    this.elementType = elementType;
  }

  /**
   * Get the length of the list
   */
  get length(): number {
    return this.size;
  }

  /**
   * Get an element at the given index
   */
  get(index: number): T | undefined {
    if (index < 0 || index >= this.size) return undefined;
    // Implementation depends on element type
    return undefined as T;
  }

  /**
   * Iterate over all elements
   */
  *[Symbol.iterator](): Iterator<T> {
    for (let i = 0; i < this.size; i++) {
      yield this.get(i)!;
    }
  }
}

/**
 * Text (string) type for Cap'n Proto
 */
export class Text {
  private value: string;

  constructor(value: string = '') {
    this.value = value;
  }

  toString(): string {
    return this.value;
  }

  toUint8Array(): Uint8Array {
    return new TextEncoder().encode(this.value);
  }

  static fromUint8Array(bytes: Uint8Array): Text {
    return new Text(new TextDecoder().decode(bytes));
  }
}

/**
 * Data (bytes) type for Cap'n Proto
 */
export class Data {
  private value: Uint8Array;

  constructor(value: Uint8Array = new Uint8Array()) {
    this.value = value;
  }

  get bytes(): Uint8Array {
    return this.value;
  }

  get length(): number {
    return this.value.length;
  }
}
