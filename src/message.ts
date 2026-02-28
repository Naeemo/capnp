import { MessageReader as WasmMessageReader, MessageBuilder as WasmMessageBuilder } from './wasm/index.js';

/**
 * High-level message reader for Cap'n Proto
 * Wraps the WASM implementation with TypeScript-friendly API
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
  getRoot<T>(ReaderClass: new (reader: MessageReader, offset: number) => T): T {
    const offset = this.wasmReader.get_root_offset();
    return new ReaderClass(this, offset);
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
 * High-level message builder for Cap'n Proto
 */
export class MessageBuilder {
  private wasmBuilder: WasmMessageBuilder;

  constructor() {
    this.wasmBuilder = new WasmMessageBuilder();
  }

  /**
   * Initialize the root struct
   */
  initRoot<T>(BuilderClass: new (builder: MessageBuilder, offset: number) => T): T {
    const offset = this.wasmBuilder.init_root(0, 0); // Will be set by generated code
    return new BuilderClass(this, offset);
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
