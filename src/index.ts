/**
 * Cap'n Proto TypeScript - Pure TS Implementation
 */

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
