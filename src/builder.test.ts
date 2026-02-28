import { describe, it, expect, beforeAll } from 'vitest';
import { initWasm } from './wasm/index.js';
import { MessageReader, MessageBuilder } from './message.js';
import { StructReader, StructBuilder } from './struct.js';

describe('MessageBuilder', () => {
  beforeAll(async () => {
    await initWasm();
  });

  it('should create a message with int32 field', () => {
    // Create a simple test struct builder
    class TestStructBuilder extends StructBuilder {
      constructor(builder: MessageBuilder, offset: number) {
        super(builder, offset, 1, 0); // 1 data word, 0 pointers
      }

      setValue(value: number): void {
        this._setInt32(0, value);
      }
    }

    // Build a message
    const builder = new MessageBuilder();
    const struct = builder.initRoot(TestStructBuilder);
    struct.setValue(42);

    // Serialize and verify
    const buffer = builder.toArrayBuffer();
    expect(buffer).toBeDefined();
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it('should create a message with multiple fields', () => {
    class PersonBuilder extends StructBuilder {
      constructor(builder: MessageBuilder, offset: number) {
        super(builder, offset, 2, 1); // 2 data words, 1 pointer
      }

      setAge(age: number): void {
        this._setUint16(0, age);
      }

      setScore(score: number): void {
        this._setFloat32(4, score);
      }
    }

    const builder = new MessageBuilder();
    const person = builder.initRoot(PersonBuilder);
    person.setAge(25);
    person.setScore(95.5);

    const buffer = builder.toArrayBuffer();
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it('should create a message with int64 field', () => {
    class TestStructBuilder extends StructBuilder {
      constructor(builder: MessageBuilder, offset: number) {
        super(builder, offset, 2, 0); // 2 data words for int64
      }

      setId(id: bigint): void {
        this._setInt64(0, id);
      }
    }

    const builder = new MessageBuilder();
    const struct = builder.initRoot(TestStructBuilder);
    struct.setId(9007199254740993n); // Larger than max safe integer

    const buffer = builder.toArrayBuffer();
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it('should create a message with boolean field', () => {
    class TestStructBuilder extends StructBuilder {
      constructor(builder: MessageBuilder, offset: number) {
        super(builder, offset, 1, 0);
      }

      setActive(value: boolean): void {
        this._setBool(0, value);
      }

      setVerified(value: boolean): void {
        this._setBool(1, value);
      }
    }

    const builder = new MessageBuilder();
    const struct = builder.initRoot(TestStructBuilder);
    struct.setActive(true);
    struct.setVerified(false);

    const buffer = builder.toArrayBuffer();
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it('should create a message with float64 field', () => {
    class TestStructBuilder extends StructBuilder {
      constructor(builder: MessageBuilder, offset: number) {
        super(builder, offset, 2, 0); // 2 data words for float64
      }

      setValue(value: number): void {
        this._setFloat64(0, value);
      }
    }

    const builder = new MessageBuilder();
    const struct = builder.initRoot(TestStructBuilder);
    struct.setValue(3.141592653589793);

    const buffer = builder.toArrayBuffer();
    expect(buffer.byteLength).toBeGreaterThan(0);
  });
});
