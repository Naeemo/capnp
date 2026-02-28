/**
 * Cap'n Proto v2 高层 API
 * 兼容现有 API，底层使用官方 C++ 实现
 */

import { initWasm, MessageReader as WasmMessageReader, MessageBuilder as WasmMessageBuilder } from './wasm-v2/index.js';
import type { StructReader as WasmStructReader, StructBuilder as WasmStructBuilder } from './wasm-v2/index.js';

export { initWasm };

/**
 * 高层 MessageReader
 * 保持与 v1 相同的 API
 */
export class MessageReader {
  private wasmReader: WasmMessageReader;

  constructor(buffer: ArrayBuffer | Uint8Array) {
    const uint8Array = buffer instanceof ArrayBuffer 
      ? new Uint8Array(buffer) 
      : buffer;
    this.wasmReader = new WasmMessageReader(uint8Array);
  }

  /**
   * Get the root struct from the message
   */
  getRoot<T>(ReaderClass: new (reader: MessageReader, internal: WasmStructReader) => T): T {
    const internal = this.wasmReader.get_root();
    return new ReaderClass(this, internal);
  }

  /**
   * Get the underlying WASM reader (for advanced use)
   */
  getWasmReader(): WasmMessageReader {
    return this.wasmReader;
  }

  /**
   * Get a segment by index
   */
  getSegment(index: number): Uint8Array | null {
    return this.wasmReader.get_segment(index);
  }

  /**
   * Get the number of segments
   */
  get segmentCount(): number {
    return this.wasmReader.segment_count;
  }
}

/**
 * 高层 MessageBuilder
 * 保持与 v1 相同的 API
 */
export class MessageBuilder {
  private wasmBuilder: WasmMessageBuilder;

  constructor() {
    this.wasmBuilder = new WasmMessageBuilder();
  }

  /**
   * Initialize the root struct
   */
  initRoot<T>(BuilderClass: new (builder: MessageBuilder, internal: WasmStructBuilder) => T): T {
    const internal = this.wasmBuilder.init_root();
    return new BuilderClass(this, internal);
  }

  /**
   * Get the underlying WASM builder (for advanced use)
   */
  getWasmBuilder(): WasmMessageBuilder {
    return this.wasmBuilder;
  }

  /**
   * Serialize the message to an ArrayBuffer
   */
  toArrayBuffer(): ArrayBuffer {
    const arr = this.wasmBuilder.to_array_buffer();
    return arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength) as ArrayBuffer;
  }

  /**
   * Serialize the message to a Uint8Array
   */
  toUint8Array(): Uint8Array {
    return new Uint8Array(this.toArrayBuffer());
  }
}

/**
 * StructReader 基类
 * 使用官方库的底层实现
 */
export abstract class StructReader {
  protected reader: MessageReader;
  protected internal: WasmStructReader;

  constructor(reader: MessageReader, internal: WasmStructReader) {
    this.reader = reader;
    this.internal = internal;
  }

  // Boolean getters
  protected getBool(bitOffset: number): boolean {
    return this.internal.getBool(bitOffset);
  }

  // Integer getters
  protected getInt8(byteOffset: number): number {
    return this.internal.getInt8(byteOffset);
  }

  protected getInt16(byteOffset: number): number {
    return this.internal.getInt16(byteOffset);
  }

  protected getInt32(byteOffset: number): number {
    return this.internal.getInt32(byteOffset);
  }

  protected getInt64(byteOffset: number): bigint {
    return this.internal.getInt64(byteOffset);
  }

  protected getUint8(byteOffset: number): number {
    return this.internal.getUint8(byteOffset);
  }

  protected getUint16(byteOffset: number): number {
    return this.internal.getUint16(byteOffset);
  }

  protected getUint32(byteOffset: number): number {
    return this.internal.getUint32(byteOffset);
  }

  protected getUint64(byteOffset: number): bigint {
    return this.internal.getUint64(byteOffset);
  }

  // Float getters
  protected getFloat32(byteOffset: number): number {
    return this.internal.getFloat32(byteOffset);
  }

  protected getFloat64(byteOffset: number): number {
    return this.internal.getFloat64(byteOffset);
  }

  // Text/Data getters
  protected getText(pointerIndex: number): string {
    return this.internal.getText(pointerIndex) ?? '';
  }

  protected getData(pointerIndex: number): Uint8Array {
    return this.internal.getData(pointerIndex) ?? new Uint8Array();
  }

  // Struct getter
  protected getStruct<T extends StructReader>(
    pointerIndex: number,
    ReaderClass: new (reader: MessageReader, internal: WasmStructReader) => T
  ): T | undefined {
    const internal = this.internal.getStruct(pointerIndex);
    if (!internal) return undefined;
    return new ReaderClass(this.reader, internal);
  }

  // Union getter
  protected getUnionTag(offset: number): number {
    return this.internal.getUnionTag(offset);
  }
}

/**
 * StructBuilder 基类
 * 使用官方库的底层实现
 */
export abstract class StructBuilder {
  protected builder: MessageBuilder;
  protected internal: WasmStructBuilder;

  constructor(builder: MessageBuilder, internal: WasmStructBuilder) {
    this.builder = builder;
    this.internal = internal;
  }

  // Boolean setter
  protected setBool(bitOffset: number, value: boolean): void {
    this.internal.setBool(bitOffset, value);
  }

  // Integer setters
  protected setInt8(byteOffset: number, value: number): void {
    this.internal.setInt8(byteOffset, value);
  }

  protected setInt16(byteOffset: number, value: number): void {
    this.internal.setInt16(byteOffset, value);
  }

  protected setInt32(byteOffset: number, value: number): void {
    this.internal.setInt32(byteOffset, value);
  }

  protected setInt64(byteOffset: number, value: bigint): void {
    this.internal.setInt64(byteOffset, value);
  }

  protected setUint8(byteOffset: number, value: number): void {
    this.internal.setUint8(byteOffset, value);
  }

  protected setUint16(byteOffset: number, value: number): void {
    this.internal.setUint16(byteOffset, value);
  }

  protected setUint32(byteOffset: number, value: number): void {
    this.internal.setUint32(byteOffset, value);
  }

  protected setUint64(byteOffset: number, value: bigint): void {
    this.internal.setUint64(byteOffset, value);
  }

  // Float setters
  protected setFloat32(byteOffset: number, value: number): void {
    this.internal.setFloat32(byteOffset, value);
  }

  protected setFloat64(byteOffset: number, value: number): void {
    this.internal.setFloat64(byteOffset, value);
  }

  // Text/Data setters
  protected setText(pointerIndex: number, value: string): void {
    this.internal.setText(pointerIndex, value);
  }

  protected setData(pointerIndex: number, value: Uint8Array): void {
    this.internal.setData(pointerIndex, value);
  }

  // Struct setter
  protected initStruct<T extends StructBuilder>(
    pointerIndex: number,
    dataWords: number,
    pointerCount: number,
    BuilderClass: new (builder: MessageBuilder, internal: WasmStructBuilder) => T
  ): T {
    const internal = this.internal.initStruct(pointerIndex, dataWords, pointerCount);
    return new BuilderClass(this.builder, internal);
  }

  // Union setter
  protected setUnionTag(offset: number, tag: number): void {
    this.internal.setUnionTag(offset, tag);
  }
}
