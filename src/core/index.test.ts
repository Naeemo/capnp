import { describe, expect, it } from 'vitest';
import {
  ElementSize,
  MessageBuilder,
  MessageReader,
  createUnionBuilder,
  createUnionReader,
} from '../index.js';

describe('Pure TS Implementation', () => {
  it('should build and read a simple struct', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(2, 1);
    root.setInt32(0, 42);
    root.setFloat64(8, Math.PI);
    root.setText(0, "Hello Cap'n Proto");

    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer);
    const readRoot = reader.getRoot(2, 1);

    expect(readRoot.getInt32(0)).toBe(42);
    expect(readRoot.getFloat64(8)).toBeCloseTo(Math.PI, 5);
    expect(readRoot.getText(0)).toBe("Hello Cap'n Proto");
  });

  it('should handle uint64', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(2, 0);
    root.setUint64(0, 9007199254740993n);

    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer);
    expect(reader.getRoot(2, 0).getUint64(0)).toBe(9007199254740993n);
  });

  it('should handle nested structs', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(1, 1);
    root.setInt32(0, 100);
    root.initStruct(0, 1, 0).setInt32(0, 200);

    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer);
    const readRoot = reader.getRoot(1, 1);

    expect(readRoot.getInt32(0)).toBe(100);
    expect(readRoot.getStruct(0, 1, 0)?.getInt32(0)).toBe(200);
  });

  it('should handle boolean fields', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(1, 0);
    root.setBool(0, true);
    root.setBool(1, false);
    root.setBool(7, true);

    const buffer = builder.toArrayBuffer();
    const readRoot = new MessageReader(buffer).getRoot(1, 0);

    expect(readRoot.getBool(0)).toBe(true);
    expect(readRoot.getBool(1)).toBe(false);
    expect(readRoot.getBool(7)).toBe(true);
  });

  it('should handle primitive lists', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(0, 1);
    const list = root.initList<number>(0, ElementSize.FOUR_BYTES, 5);
    list.setPrimitive(0, 10);
    list.setPrimitive(4, 50);

    const buffer = builder.toArrayBuffer();
    const readList = new MessageReader(buffer)
      .getRoot(0, 1)
      .getList<number>(0, ElementSize.FOUR_BYTES)!;

    expect(readList.length).toBe(5);
    expect(readList.getPrimitive(0)).toBe(10);
    expect(readList.getPrimitive(4)).toBe(50);
  });

  it('should handle union fields', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(2, 0);
    const union = createUnionBuilder(root, 0);
    union.setTag(0);
    root.setInt32(4, 100);

    const buffer = builder.toArrayBuffer();
    const readRoot = new MessageReader(buffer).getRoot(2, 0);
    const readUnion = createUnionReader(readRoot, 0, { 0: 'A', 1: 'B' });

    expect(readUnion.getTag()).toBe(0);
    expect(readUnion.getVariantName()).toBe('A');
    expect(readUnion.is(0)).toBe(true);
    expect(readRoot.getInt32(4)).toBe(100);
  });
});
