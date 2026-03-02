# Cap'n Proto TypeScript

[![npm version](https://img.shields.io/npm/v/@naeemo/capnp.svg)](https://www.npmjs.com/package/@naeemo/capnp)
[![Documentation](https://img.shields.io/badge/docs-website-blue.svg)](https://naeemo.github.io/capnp/)

A pure TypeScript implementation of Cap'n Proto, featuring zero-copy deserialization and full interoperability with the official C++ implementation.

[📖 Documentation](https://naeemo.github.io/capnp/) | [中文文档](./README.zh.md)

## Features

- 🚀 **Zero-Copy Deserialization** - Read data directly from buffers without parsing
- 🔧 **Pure TypeScript** - No WASM or native dependencies, works in any JS environment
- ✅ **Official Compatible** - Tested against official C++ implementation
- 📦 **Schema Code Generation** - Generate TypeScript types from `.capnp` schemas
- ⚡ **High Performance** - 1.4μs serialization, 0.6μs deserialization for simple structs

## Installation

```bash
npm install @naeemo/capnp
```

## Quick Start

### Basic Usage

```typescript
import { MessageBuilder, MessageReader } from '@naeemo/capnp';

// Build a message
const builder = new MessageBuilder();
const root = builder.initRoot(2, 1); // 2 data words, 1 pointer
root.setInt32(0, 42);
root.setText(0, 'Hello, Cap\'n Proto!');
const buffer = builder.toArrayBuffer();

// Read a message
const reader = new MessageReader(buffer);
const data = reader.getRoot(2, 1);
console.log(data.getInt32(0)); // 42
console.log(data.getText(0));  // "Hello, Cap'n Proto!"
```

### Code Generation

Generate TypeScript types from your Cap'n Proto schema using the V3 CLI (requires `capnp` tool installed):

```bash
# Generate single file
npx capnp-ts-codegen schema.capnp -o types.ts

# Generate multiple files to directory
npx capnp-ts-codegen schema.capnp -d ./generated

# With custom runtime import path
npx capnp-ts-codegen schema.capnp -o types.ts -r ../my-runtime
```

Generated code includes:
- TypeScript interfaces
- Reader classes (getters)
- Builder classes (setters + factory method)

Example:
```typescript
// Generated from schema
export interface Person {
  id: bigint;
  name: string;
}

export class PersonReader {
  get id(): bigint { ... }
  get name(): string { ... }
}

export class PersonBuilder {
  static create(message: MessageBuilder): PersonBuilder { ... }
  setId(value: bigint): void { ... }
  setName(value: string): void { ... }
}
```

## Performance

| Operation | Latency | Throughput |
|-----------|---------|------------|
| Simple struct serialize | 1.4 μs | 684K ops/sec |
| Simple struct deserialize | 0.6 μs | 1.66M ops/sec |
| Nested struct serialize | 4.1 μs | 243K ops/sec |
| List (100 items) serialize | 6.8 μs | 147K ops/sec |

See [PERFORMANCE.md](./PERFORMANCE.md) for detailed benchmarks.

## Documentation

- [📖 Documentation Website](https://naeemo.github.io/capnp/)
- [API Documentation](./docs/API.md)
- [Performance Report](./PERFORMANCE.md)
- [Test Coverage](./TEST_COVERAGE.md)
- [Changelog](./CHANGELOG.md)

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## Credits

Developed by **Naeemo** and [Moonshot AI](https://github.com/MoonshotAI).

## License

MIT License - see [LICENSE](./LICENSE) for details.
