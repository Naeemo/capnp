# Cap'n Proto TypeScript

Pure TypeScript implementation of Cap'n Proto, featuring zero-copy deserialization and full interoperability with the official C++ implementation.

## Features

- 🚀 **Zero-Copy Deserialization** - Read data directly from buffers without parsing
- 🔧 **Pure TypeScript** - No WASM or native dependencies
- ✅ **Official Compatible** - Tested against official C++ implementation
- 📦 **Schema Code Generation** - Generate TypeScript types from `.capnp` schemas
- ⚡ **High Performance** - 1.4μs serialization, 0.6μs deserialization

## Installation

```bash
npm install @naeemo/capnp
```

## Quick Start

### Code Generation

Generate TypeScript types from your Cap'n Proto schema:

```bash
npx @naeemo/capnp gen schema.capnp -o types.ts
```

### Basic Usage

```typescript
import { MessageBuilder, MessageReader } from '@naeemo/capnp';
import { PersonBuilder, PersonReader } from './types';

// Build a message
const builder = new MessageBuilder();
const person = PersonBuilder.create(builder);
person.setName('John');
person.setAge(30);
const buffer = builder.toArrayBuffer();

// Read a message
const reader = new MessageReader(buffer);
const p = new PersonReader(reader.getRoot(2, 1));
console.log(p.name); // "John"
```

## Documentation

- [Quick Start Guide](./quickstart)
- [Changelog](./changelog)

## License

MIT License © 2024-2026 Naeemo
