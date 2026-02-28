/**
 * Cap'n Proto Union 支持
 * 纯 TypeScript 实现
 */

import { StructReader, MessageReader } from './message-reader.js';
import { StructBuilder, MessageBuilder } from './message-builder.js';
import { ElementSize } from './pointer.js';

/**
 * UnionReader - 读取 Union 的 tag 和 variant
 */
export class UnionReader {
  constructor(
    private struct: StructReader,
    private tagOffset: number,  // tag 的字节偏移
    private variants: Map<number, string>  // tag 值 -> variant 名称
  ) {}

  /**
   * 获取当前激活的 variant tag
   */
  getTag(): number {
    return this.struct.getUint16(this.tagOffset);
  }

  /**
   * 获取当前激活的 variant 名称
   */
  getVariantName(): string | undefined {
    return this.variants.get(this.getTag());
  }

  /**
   * 检查是否是某个 variant
   */
  is(variantTag: number): boolean {
    return this.getTag() === variantTag;
  }
}

/**
 * UnionBuilder - 设置 Union 的 tag 和 variant
 */
export class UnionBuilder {
  constructor(
    private struct: StructBuilder,
    private tagOffset: number
  ) {}

  /**
   * 获取当前 tag
   */
  getTag(): number {
    return this.struct.getUint16(this.tagOffset);
  }

  /**
   * 设置 tag
   */
  setTag(tag: number): void {
    this.struct.setUint16(this.tagOffset, tag);
  }

  /**
   * 初始化某个 variant（自动设置 tag）
   */
  initVariant(tag: number, initFn: () => void): void {
    this.setTag(tag);
    initFn();
  }
}

/**
 * 创建 UnionReader 的工厂函数
 */
export function createUnionReader(
  struct: StructReader,
  tagOffset: number,
  variants: Record<number, string>
): UnionReader {
  return new UnionReader(struct, tagOffset, new Map(Object.entries(variants).map(([k, v]) => [Number(k), v])));
}

/**
 * 创建 UnionBuilder 的工厂函数
 */
export function createUnionBuilder(
  struct: StructBuilder,
  tagOffset: number
): UnionBuilder {
  return new UnionBuilder(struct, tagOffset);
}
