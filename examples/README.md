# Examples

## Basic Usage

```typescript
import { MessageReader, MessageBuilder } from '@capnp-ts/core';
import { initWasm } from '@capnp-ts/core/wasm';

// Initialize WASM module
await initWasm();

// Create a message
const builder = new MessageBuilder();
const rootOffset = builder.initRoot(2, 1); // 2 data words, 1 pointer
const buffer = builder.toArrayBuffer();

// Read a message
const reader = new MessageReader(buffer);
const ptr = reader.readPointer(0, 0);
console.log(ptr); // { tag: 0, offset: ..., dataWords: 2, pointerCount: 1 }
```

## Running Examples

```bash
# Build first
pnpm run build

# Run example
ts-node examples/basic.ts
```
