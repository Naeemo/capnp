import { describe, expect, it } from 'vitest';
import { createUnionBuilder, createUnionReader } from '../core/union.js';
import { ElementSize, MessageBuilder, MessageReader } from '../index.js';

describe('Union Support', () => {
  it('should handle simple union', () => {
    // Schema:
    // struct Test {
    //   union {
    //     intValue @0 :Int32;
    //     textValue @1 :Text;
    //   }
    // }
    // Layout: tag at byte 0, data starts at byte 8

    const builder = new MessageBuilder();
    const root = builder.initRoot(2, 1); // 2 data words, 1 pointer

    // Set int variant
    const unionBuilder = createUnionBuilder(root, 0);
    unionBuilder.setTag(0);
    root.setInt32(8, 42);

    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer);
    const readRoot = reader.getRoot(2, 1);

    const unionReader = createUnionReader(readRoot, 0, { 0: 'intValue', 1: 'textValue' });
    expect(unionReader.getTag()).toBe(0);
    expect(unionReader.getVariantName()).toBe('intValue');
    expect(unionReader.is(0)).toBe(true);
    expect(readRoot.getInt32(8)).toBe(42);
  });

  it('should handle union with text variant', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(2, 1);

    // Set text variant
    const unionBuilder = createUnionBuilder(root, 0);
    unionBuilder.setTag(1);
    root.setText(0, 'hello');

    const buffer = builder.toArrayBuffer();
    const reader = new MessageReader(buffer);
    const readRoot = reader.getRoot(2, 1);

    const unionReader = createUnionReader(readRoot, 0, { 0: 'intValue', 1: 'textValue' });
    expect(unionReader.getTag()).toBe(1);
    expect(unionReader.getVariantName()).toBe('textValue');
    expect(readRoot.getText(0)).toBe('hello');
  });
});
