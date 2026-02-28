/**
 * WASM Bridge Module
 * Handles loading and initialization of the C++/Emscripten WASM module
 */

// WASM module instance
let wasmModule: WasmModule | null = null;

// Type declarations for Emscripten module
interface WasmModule {
  MessageReader: new (buffer: Uint8Array) => WasmMessageReader;
  MessageBuilder: new () => WasmMessageBuilder;
  ping(): string;
}

interface WasmMessageReader {
  getRootOffset(): number;
  getSegmentCount(): number;
  getSegment(index: number): Uint8Array | null;
  readPointer(segment: number, offset: number): WasmPointerInfo | null;
}

interface WasmMessageBuilder {
  initRoot(dataWords: number, pointerCount: number): number;
  getRootOffset(): number;
  allocateStruct(dataWords: number, pointerCount: number): { segment: number; offset: number };
  allocateList(elementSize: number, elementCount: number): { segment: number; offset: number };
  writeStructPointer(segment: number, offset: number, targetOffset: number, dataWords: number, pointerCount: number): void;
  writeListPointer(segment: number, offset: number, targetOffset: number, elementSize: number, elementCount: number): void;
  writeWord(segment: number, offset: number, low: number, high: number): void;
  toArrayBuffer(): Uint8Array;
}

interface WasmPointerInfo {
  tag: number;
  offset: number;
  targetSegment: number;
  dataWords: number;
  pointerCount: number;
  elementSize: number;
  elementCount: number;
}

// Module loader type
interface WasmModuleLoader {
  default: () => Promise<WasmModule>;
}

// Deno global
declare const Deno: { version: { deno: string } } | undefined;

/**
 * Initialize the WASM module
 */
export async function initWasm(): Promise<void> {
  if (wasmModule) return;

  // Dynamic import to avoid bundler issues
  const loader = await import('../../wasm/dist/capnp_ts_wasm.js' as string) as WasmModuleLoader;
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
 * WASM MessageReader wrapper
 */
export class MessageReader {
  private internal: WasmMessageReader;

  constructor(buffer: Uint8Array) {
    const wasm = getWasm();
    this.internal = new wasm.MessageReader(buffer);
  }

  get_root_offset(): number {
    return this.internal.getRootOffset();
  }

  get_segment(index: number): Uint8Array | null {
    return this.internal.getSegment(index);
  }

  get segment_count(): number {
    return this.internal.getSegmentCount();
  }

  read_pointer(segment: number, offset: number): PointerInfo | null {
    const result = this.internal.readPointer(segment, offset);
    if (!result) return null;
    return {
      tag: result.tag,
      offset: result.offset,
      target_segment: result.targetSegment,
      data_words: result.dataWords,
      pointer_count: result.pointerCount,
      element_size: result.elementSize,
      element_count: result.elementCount,
    };
  }
}

/**
 * WASM MessageBuilder wrapper
 */
export class MessageBuilder {
  private internal: WasmMessageBuilder;

  constructor() {
    const wasm = getWasm();
    this.internal = new wasm.MessageBuilder();
  }

  init_root(dataWords: number, pointerCount: number): number {
    return this.internal.initRoot(dataWords, pointerCount);
  }

  get root_offset(): number {
    return this.internal.getRootOffset();
  }

  allocate_struct(dataWords: number, pointerCount: number): { segment: number; offset: number } {
    return this.internal.allocateStruct(dataWords, pointerCount);
  }

  allocate_list(elementSize: number, elementCount: number): { segment: number; offset: number } {
    return this.internal.allocateList(elementSize, elementCount);
  }

  write_struct_pointer(
    segment: number,
    offset: number,
    targetOffset: number,
    dataWords: number,
    pointerCount: number
  ): void {
    this.internal.writeStructPointer(segment, offset, targetOffset, dataWords, pointerCount);
  }

  write_list_pointer(
    segment: number,
    offset: number,
    targetOffset: number,
    elementSize: number,
    elementCount: number
  ): void {
    this.internal.writeListPointer(segment, offset, targetOffset, elementSize, elementCount);
  }

  write_word(segment: number, offset: number, value: number | bigint): void {
    // Split 64-bit value into high/low 32-bit parts
    let low: number;
    let high: number;
    
    if (typeof value === 'bigint') {
      low = Number(value & BigInt(0xFFFFFFFF));
      high = Number(value >> BigInt(32));
    } else {
      // For 32-bit values, high is 0
      low = value >>> 0; // Convert to unsigned 32-bit
      high = 0;
    }
    
    this.internal.writeWord(segment, offset, low, high);
  }

  to_array_buffer(): Uint8Array {
    return this.internal.toArrayBuffer();
  }
}

/**
 * Pointer info from WASM
 */
export interface PointerInfo {
  tag: number;
  offset: number;
  target_segment: number;
  data_words: number;
  pointer_count: number;
  element_size: number;
  element_count: number;
}

// Re-export enums
export const PointerTag = {
  STRUCT: 0,
  LIST: 1,
  FAR: 2,
  OTHER: 3,
} as const;

export const ElementSize = {
  VOID: 0,
  BIT: 1,
  BYTE: 2,
  TWO_BYTES: 3,
  FOUR_BYTES: 4,
  EIGHT_BYTES: 5,
  POINTER: 6,
  COMPOSITE: 7,
} as const;
