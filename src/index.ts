/**
 * Cap'n Proto TypeScript - Pure TS Implementation
 */

// Debug Configuration
export {
  enableDebug,
  disableDebug,
  isDebugEnabled,
  type DebugOptions,
} from './debug/config.js';

// Core
export { MessageReader, StructReader } from './core/message-reader.js';
export { MessageBuilder, StructBuilder } from './core/message-builder.js';
export { ListReader, ListBuilder } from './core/list.js';
export { UnionReader, UnionBuilder, createUnionReader, createUnionBuilder } from './core/union.js';
export { Segment, WORD_SIZE } from './core/segment.js';
export {
  decodePointer,
  encodeStructPointer,
  encodeListPointer,
  encodeFarPointer,
  PointerTag,
  ElementSize,
} from './core/pointer.js';

// Types
export type {
  Pointer,
  StructPointer,
  ListPointer,
  FarPointer,
} from './core/pointer.js';

// RPC (Phase 1: Level 0)
export * from './rpc/index.js';
