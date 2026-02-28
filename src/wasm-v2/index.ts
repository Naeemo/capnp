/**
 * WASM Bridge Module v2
 * 基于官方 capnproto C++ 实现的绑定
 */

// WASM module instance
let wasmModule: WasmModule | null = null;

// Type declarations for Emscripten module
interface WasmModule {
  MessageReader: new (buffer: Uint8Array) => WasmMessageReader;
  MessageBuilder: new () => WasmMessageBuilder;
  StructReader: new (internal: unknown) => WasmStructReader;
  StructBuilder: new (internal: unknown) => WasmStructBuilder;
  ping(): string;
}

// 官方库提供的底层接口
interface WasmMessageReader {
  getRoot(): WasmStructReader;
  getSegmentCount(): number;
  getSegment(index: number): Uint8Array | null;
}

interface WasmMessageBuilder {
  initRoot(): WasmStructBuilder;
  getRoot(): WasmStructBuilder;
  toArrayBuffer(): Uint8Array;
  getSegmentCount(): number;
}

interface WasmStructReader {
  getBool(bitOffset: number): boolean;
  getInt8(byteOffset: number): number;
  getInt16(byteOffset: number): number;
  getInt32(byteOffset: number): number;
  getInt64(byteOffset: number): bigint;
  getUint8(byteOffset: number): number;
  getUint16(byteOffset: number): number;
  getUint32(byteOffset: number): number;
  getUint64(byteOffset: number): bigint;
  getFloat32(byteOffset: number): number;
  getFloat64(byteOffset: number): number;
  getText(pointerIndex: number): string | null;
  getData(pointerIndex: number): Uint8Array | null;
  getStruct(pointerIndex: number): WasmStructReader;
  getUnionTag(offset: number): number;
}

interface WasmStructBuilder {
  setBool(bitOffset: number, value: boolean): void;
  setInt8(byteOffset: number, value: number): void;
  setInt16(byteOffset: number, value: number): void;
  setInt32(byteOffset: number, value: number): void;
  setInt64(byteOffset: number, value: bigint): void;
  setUint8(byteOffset: number, value: number): void;
  setUint16(byteOffset: number, value: number): void;
  setUint32(byteOffset: number, value: number): void;
  setUint64(byteOffset: number, value: bigint): void;
  setFloat32(byteOffset: number, value: number): void;
  setFloat64(byteOffset: number, value: number): void;
  setText(pointerIndex: number, value: string): void;
  setData(pointerIndex: number, value: Uint8Array): void;
  initStruct(pointerIndex: number, dataWords: number, pointerCount: number): WasmStructBuilder;
  setUnionTag(offset: number, tag: number): void;
  asReader(): WasmStructReader;
}

// Module loader type
interface WasmModuleLoader {
  default: () => Promise<WasmModule>;
}

/**
 * Initialize the WASM module
 */
export async function initWasm(): Promise<void> {
  if (wasmModule) return;

  // Dynamic import to avoid bundler issues
  const loader = await import('../../wasm-v2/dist/capnp_ts_v2.js' as string) as WasmModuleLoader;
  wasmModule = await loader.default();
}

/**
 * Get the initialized WASM module
 */
function getWasm(): WasmModule {
  if (!wasmModule) {
    throw new Error('WASM module not initialized. Call initWasm() first.');
  }
  return wasmModule;
}

/**
 * WASM MessageReader wrapper (v2)
 */
export class MessageReader {
  private internal: WasmMessageReader;

  constructor(buffer: Uint8Array) {
    const wasm = getWasm();
    this.internal = new wasm.MessageReader(buffer);
  }

  get_root(): WasmStructReader {
    return this.internal.getRoot();
  }

  get_segment(index: number): Uint8Array | null {
    return this.internal.getSegment(index);
  }

  get segment_count(): number {
    return this.internal.getSegmentCount();
  }
}

/**
 * WASM MessageBuilder wrapper (v2)
 */
export class MessageBuilder {
  private internal: WasmMessageBuilder;

  constructor() {
    const wasm = getWasm();
    this.internal = new wasm.MessageBuilder();
  }

  init_root(): WasmStructBuilder {
    return this.internal.initRoot();
  }

  get_root(): WasmStructBuilder {
    return this.internal.getRoot();
  }

  to_array_buffer(): Uint8Array {
    return this.internal.toArrayBuffer();
  }

  get segment_count(): number {
    return this.internal.getSegmentCount();
  }
}

// Re-export struct types
export type { WasmStructReader as StructReader, WasmStructBuilder as StructBuilder };
