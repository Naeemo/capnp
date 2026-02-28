/**
 * Cap'n Proto 指针编解码
 * 纯 TypeScript 实现
 */

export enum PointerTag {
  STRUCT = 0,
  LIST = 1,
  FAR = 2,
  OTHER = 3,
}

export enum ElementSize {
  VOID = 0,
  BIT = 1,
  BYTE = 2,
  TWO_BYTES = 3,
  FOUR_BYTES = 4,
  EIGHT_BYTES = 5,
  POINTER = 6,
  COMPOSITE = 7,
}

export interface StructPointer {
  tag: PointerTag.STRUCT;
  offset: number; // 字偏移（有符号）
  dataWords: number; // 数据段字数
  pointerCount: number; // 指针段字数
}

export interface ListPointer {
  tag: PointerTag.LIST;
  offset: number;
  elementSize: ElementSize;
  elementCount: number;
}

export interface FarPointer {
  tag: PointerTag.FAR;
  doubleFar: boolean;
  targetSegment: number;
  targetOffset: number;
}

export type Pointer = StructPointer | ListPointer | FarPointer | { tag: PointerTag.OTHER };

/**
 * 解码指针（64位）
 */
export function decodePointer(ptr: bigint): Pointer {
  const tag = Number(ptr & BigInt(3)) as PointerTag;

  switch (tag) {
    case PointerTag.STRUCT: {
      const offset = Number(ptr >> BigInt(2)) & 0x3fffffff;
      const signedOffset = offset >= 0x20000000 ? offset - 0x40000000 : offset;
      const dataWords = Number((ptr >> BigInt(32)) & BigInt(0xffff));
      const pointerCount = Number((ptr >> BigInt(48)) & BigInt(0xffff));
      return { tag, offset: signedOffset, dataWords, pointerCount };
    }

    case PointerTag.LIST: {
      const offset = Number(ptr >> BigInt(2)) & 0x3fffffff;
      const signedOffset = offset >= 0x20000000 ? offset - 0x40000000 : offset;
      const elementSize = Number((ptr >> BigInt(32)) & BigInt(7)) as ElementSize;
      const elementCount = Number((ptr >> BigInt(35)) & BigInt(0x1fffffff));
      return { tag, offset: signedOffset, elementSize, elementCount };
    }

    case PointerTag.FAR: {
      const doubleFar = Boolean((ptr >> BigInt(2)) & BigInt(1));
      const targetOffset = Number((ptr >> BigInt(3)) & BigInt(0x1fffffff));
      const targetSegment = Number((ptr >> BigInt(32)) & BigInt(0xffffffff));
      return { tag, doubleFar, targetSegment, targetOffset };
    }

    default:
      return { tag: PointerTag.OTHER };
  }
}

/**
 * 编码 Struct 指针
 */
export function encodeStructPointer(
  offset: number,
  dataWords: number,
  pointerCount: number
): bigint {
  const offsetBits = BigInt(offset < 0 ? offset + 0x40000000 : offset) & BigInt(0x3fffffff);
  return (
    (offsetBits << BigInt(2)) |
    (BigInt(dataWords) << BigInt(32)) |
    (BigInt(pointerCount) << BigInt(48))
  );
}

/**
 * 编码 List 指针
 */
export function encodeListPointer(
  offset: number,
  elementSize: ElementSize,
  elementCount: number
): bigint {
  const offsetBits = BigInt(offset < 0 ? offset + 0x40000000 : offset) & BigInt(0x3fffffff);
  return (
    (offsetBits << BigInt(2)) |
    BigInt(1) | // LIST tag
    (BigInt(elementSize) << BigInt(32)) |
    (BigInt(elementCount) << BigInt(35))
  );
}

/**
 * 编码 Far 指针
 */
export function encodeFarPointer(segment: number, offset: number, doubleFar = false): bigint {
  const offsetBits = BigInt(offset) & BigInt(0x1fffffff);
  const segmentBits = BigInt(segment) & BigInt(0xffffffff);

  return (
    (segmentBits << BigInt(32)) |
    (offsetBits << BigInt(3)) |
    (doubleFar ? BigInt(1) << BigInt(2) : BigInt(0)) |
    BigInt(2)
  ); // FAR tag
}
