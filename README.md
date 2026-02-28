# Cap'n Proto TypeScript

A pure TypeScript implementation of Cap'n Proto, featuring zero-copy deserialization and full interoperability with the official C++ implementation.

[中文文档](./README.zh.md)

## Features

- 🚀 **Zero-Copy Deserialization** - Read data directly from buffers without parsing
- 🔧 **Pure TypeScript** - No WASM or native dependencies, works in any JS environment
- ✅ **Official Compatible** - Tested against official C++ implementation
- 📦 **Schema Code Generation** - Generate TypeScript types from `.capnp` schemas
- ⚡ **High Performance** - 1.4μs serialization, 0.6μs deserialization for simple structs

## Installation

```bash
npm install @capnp-ts/core
```

## Quick Start

### Basic Usage

```typescript
import { MessageBuilder, MessageReader } from '@capnp-ts/core';

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

Generate TypeScript types from your Cap'n Proto schema:

```bash
npx @capnp-ts/codegen schema.capnp -o types.ts
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

- [API Documentation](./docs/API.md)
- [Performance Report](./PERFORMANCE.md)
- [Test Coverage](./TEST_COVERAGE.md)
- [Changelog](./CHANGELOG.md)

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## Credits

Developed by **Naeemo** and **Kimi**.

## License

MIT License - see [LICENSE](./LICENSE) for details.
