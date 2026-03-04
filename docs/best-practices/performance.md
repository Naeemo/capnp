# Performance Optimization Guide

@naeemo/capnp is designed for high performance, but there are still optimization techniques to make your application faster.

## Core Principles

Cap'n Proto's core advantage is **zero-copy**. The optimization goal is to maximize this:

1. **Avoid unnecessary copies** - Work directly with Cap'n Proto buffers
2. **Reuse MessageBuilder** - Reduce memory allocation
3. **Use appropriate transport** - Choose optimal transport for your scenario
4. **Batch processing** - Reduce RPC round trips

## Serialization Optimization

### 1. Reuse MessageBuilder

```typescript
import { MessageBuilder } from '@naeemo/capnp';

// ❌ Create new builder each time
function bad(items: Item[]) {
  for (const item of items) {
    const builder = new MessageBuilder();  // Allocates each time
    serializeItem(builder, item);
    send(builder.toArrayBuffer());
  }
}

// ✅ Reuse builder
const builderPool: MessageBuilder[] = [];

function good(items: Item[]) {
  for (const item of items) {
    const builder = builderPool.pop() ?? new MessageBuilder();
    serializeItem(builder, item);
    send(builder.toArrayBuffer());
    builder.reset();  // Reset instead of discarding
    builderPool.push(builder);
  }
}
```

### 2. Use MemoryPool

```typescript
import { getGlobalMemoryPool } from '@naeemo/capnp';

// Configure global memory pool
const pool = getGlobalMemoryPool();
pool.configure({
  initialCapacity: 100,      // Initial 100 buffers
  maxCapacity: 1000,         // Max 1000 retained
  bufferSize: 64 * 1024,     // Each 64KB
});

// Subsequent MessageBuilders automatically use pooled memory
const builder = new MessageBuilder();
```

### 3. Work Directly with Binary Data

```typescript
// ❌ Convert to string then process
const text = reader.getData().toString();  // Copies
const result = process(text);

// ✅ Work directly on buffer
const data = reader.getData();  // Uint8Array, zero-copy
const result = processBinary(data);
```

### 4. Batch Process Lists

```typescript
// ❌ Add elements one by one
const list = builder.initItems(count);
for (let i = 0; i < items.length; i++) {
  list.get(i).setName(items[i].name);
}

// ✅ Pre-allocate and batch copy (if possible)
const list = builder.initItems(count);
// Use TypedArray batch operations
const names = new TextEncoder().encode(allNames);
// ...
```

## RPC Optimization

### 1. Promise Pipelining

```typescript
// ❌ 3 network round trips
const foo = await getFoo();
const bar = await foo.getBar();
const result = await bar.compute();

// ✅ 1 network round trip
const result = await getFoo().getBar().compute();
```

### 2. Batch RPC Calls

```typescript
// ❌ Multiple round trips
for (const id of ids) {
  const item = await db.getItem({ id });  // Each round trip
  results.push(item);
}

// ✅ Single round trip (if server supports)
const results = await db.getItems({ ids });  // Batch API
```

### 3. Choose Appropriate Transport

```typescript
// Node.js ↔ C++
import { EzRpcTransport } from '@naeemo/capnp';
const transport = await EzRpcTransport.connect(host, port);
// Minimal overhead, raw TCP

// Browser ↔ Server
import { WebSocketTransport } from '@naeemo/capnp';
const transport = await WebSocketTransport.connect(url);
// WebSocket has small frame overhead
```

### 4. Connection Reuse

```typescript
// ❌ Create new connection each time
async function callMethod(data) {
  const conn = await createConnection();  // Expensive
  return await conn.call(data);
}

// ✅ Reuse connections
class ConnectionPool {
  private connections: RpcConnection[] = [];
  
  async getConnection() {
    return this.connections.find(c => c.isIdle()) 
      ?? await this.createConnection();
  }
}
```

## Memory Optimization

### 1. Avoid Large Messages

```typescript
// ❌ Single large message
const hugeMessage = buildHugeMessage();  // 100MB
send(hugeMessage);

// ✅ Chunked transfer
const stream = createStream();
for (const chunk of chunks) {
  await stream.send(chunk);  // 1MB each
}
```

### 2. Release References Promptly

```typescript
function processLargeFile(data: Uint8Array) {
  const reader = new MessageReader(data);
  
  // Process data...
  const result = process(reader);
  
  // ✅ Release promptly to allow GC
  reader.release?.();
  
  return result;
}
```

### 3. Use Struct Lists Instead of Pointer Lists

```typescript
// schema.capnp
# ❌ Pointer list, each element allocated separately
struct Item { value @0 :UInt64; }
struct Container { items @0 :List(Item); }

# ✅ Inline list, contiguous memory
struct Container { 
  values @0 :List(UInt64); 
}
```

## Performance Measurement

### Use Built-in Benchmark

```typescript
import { benchmark } from '@naeemo/capnp/bench';

const result = benchmark({
  name: 'serialization',
  iterations: 10000,
  fn: () => {
    const builder = new MessageBuilder();
    const person = builder.initRoot(PersonBuilder);
    person.setName('Alice');
    person.setAge(30);
    return builder.toArrayBuffer();
  },
});

console.log(`${result.opsPerSecond.toFixed(0)} ops/sec`);
console.log(`${(result.bytesPerSecond / 1024 / 1024).toFixed(2)} MB/sec`);
```

### Memory Profiling

```typescript
// Node.js
const v8 = require('v8');

function measureMemory() {
  const before = v8.getHeapStatistics();
  
  // Your code
  processLargeBatch();
  
  const after = v8.getHeapStatistics();
  console.log(`Heap used: ${(after.used_heap_size - before.used_heap_size) / 1024} KB`);
}
```

## Common Pitfalls

### 1. Creating Builders in Hot Paths

```typescript
// ❌ Creating builder in high-frequency calls
function handleRequest(data) {
  const builder = new MessageBuilder();  // Allocates each time
  // ...
}

// ✅ Use object pool
const pool = new MessageBuilderPool();

function handleRequest(data) {
  const builder = pool.acquire();
  try {
    // ...
  } finally {
    pool.release(builder);
  }
}
```

### 2. Unnecessary Field Copying

```typescript
// ❌ Copy all fields
const copy = {
  id: reader.getId(),
  name: reader.getName(),
  // ... dozens of fields
};

// ✅ Pass reader directly, read on demand
processReader(reader);  // Only read needed fields
```

### 3. Ignoring List Pre-allocation

```typescript
// ❌ Dynamic resizing
const list = [];
for (const item of items) {
  list.push(item);  // Multiple resizes
}

// ✅ Pre-allocate capacity
const list = new Array(items.length);
for (let i = 0; i < items.length; i++) {
  list[i] = items[i];
}
```

## Performance Benchmarks

Reference performance data (on typical laptop):

| Operation | Performance |
|-----------|-------------|
| Serialization | ~1M ops/sec |
| Deserialization | ~2M ops/sec (zero-copy) |
| RPC Call (local) | ~100K calls/sec |
| RPC Call (remote) | Limited by network latency |
| Stream throughput | ~1 GB/sec |

## Reference

- [Performance Test Code](../../src/bench/benchmark.ts)
- [Memory Pool Configuration](../api/performance.md)
- [V8 Performance Guide](https://v8.dev/docs/profile)
