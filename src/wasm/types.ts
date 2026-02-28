/**
 * Type declarations for WASM module
 */

export interface MessageReader {
  get_root_offset(): number;
  get_segment(index: number): Uint8Array | undefined;
  segment_count: number;
  read_pointer(segment: number, offset: number): PointerInfo | undefined;
}

export interface MessageBuilder {
  init_root(): number;
  to_array_buffer(): ArrayBuffer;
}

export interface PointerInfo {
  pointer_type: number;
  target_segment: number;
  target_offset: number;
  size_d: number;
  size_p: number;
  element_count: number;
}
