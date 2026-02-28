# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-02-28

### Added
- Pure TypeScript Cap'n Proto implementation
- Zero-copy deserialization with MessageReader
- MessageBuilder for constructing messages
- Full support for all primitive types (Int8/16/32/64, UInt8/16/32/64, Float32/64, Bool, Void)
- Text and Data (binary) support
- List<T> support with typed arrays
- Struct nesting and composition
- Schema parser (parser-v2) supporting struct, enum, List
- Code generator (generator-v2) producing TypeScript Reader/Builder classes
- CLI command `capnp gen` for code generation
- 160+ tests with 100% pass rate
- Interoperability tests with official C++ implementation
- Performance benchmarks

### CLI Usage
```bash
npx @naeemo/capnp gen schema.capnp -o types.ts
```

### Generated Code Example
```typescript
export interface Person {
  id: bigint;
  name: string;
}

export class PersonReader {
  get id(): bigint;
  get name(): string;
}

export class PersonBuilder {
  static create(message: MessageBuilder): PersonBuilder;
  setId(value: bigint): void;
  setName(value: string): void;
}
```

[0.1.0]: https://github.com/Naeemo/capnp/releases/tag/v0.1.0
