/**
 * Type declarations for WASM module
 */

declare module '../../wasm/dist/capnp_ts_wasm.js' {
  export interface WasmModule {
    MessageReader: new (buffer: Uint8Array) => WasmMessageReader;
    MessageBuilder: new () => WasmMessageBuilder;
    ping(): string;
  }
  
  export interface WasmMessageReader {
    getRootOffset(): number;
    getSegmentCount(): number;
    getSegment(index: number): Uint8Array | null;
    readPointer(segment: number, offset: number): WasmPointerInfo | null;
  }
  
  export interface WasmMessageBuilder {
    initRoot(dataWords: number, pointerCount: number): number;
    getRootOffset(): number;
    allocateStruct(dataWords: number, pointerCount: number): { segment: number; offset: number };
    allocateList(elementSize: number, elementCount: number): { segment: number; offset: number };
    writeStructPointer(segment: number, offset: number, targetOffset: number, dataWords: number, pointerCount: number): void;
    writeListPointer(segment: number, offset: number, targetOffset: number, elementSize: number, elementCount: number): void;
    toArrayBuffer(): Uint8Array;
  }
  
  export interface WasmPointerInfo {
    tag: number;
    offset: number;
    targetSegment: number;
    dataWords: number;
    pointerCount: number;
    elementSize: number;
    elementCount: number;
  }
  
  const module: () => Promise<WasmModule>;
  export default module;
}
