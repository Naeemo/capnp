# 性能优化指南

@naeemo/capnp 本身就是高性能设计，但仍有一些优化技巧可以让你的应用更快。

## 核心原则

Cap'n Proto 的核心优势是**零拷贝**。优化目标是最大化这个优势：

1. **避免不必要的拷贝** - 直接操作 Cap'n Proto buffer
2. **复用 MessageBuilder** - 减少内存分配
3. **使用合适的传输** - 根据场景选择最优传输方式
4. **批量处理** - 减少 RPC 往返

## 序列化优化

### 1. 复用 MessageBuilder

```typescript
import { MessageBuilder } from '@naeemo/capnp';

// ❌ 每次新建 builder
function bad(items: Item[]) {
  for (const item of items) {
    const builder = new MessageBuilder();  // 每次分配
    serializeItem(builder, item);
    send(builder.toArrayBuffer());
  }
}

// ✅ 复用 builder
const builderPool: MessageBuilder[] = [];

function good(items: Item[]) {
  for (const item of items) {
    const builder = builderPool.pop() ?? new MessageBuilder();
    serializeItem(builder, item);
    send(builder.toArrayBuffer());
    builder.reset();  // 重置而不是丢弃
    builderPool.push(builder);
  }
}
```

### 2. 使用 MemoryPool

```typescript
import { getGlobalMemoryPool } from '@naeemo/capnp';

// 配置全局内存池
const pool = getGlobalMemoryPool();
pool.configure({
  initialCapacity: 100,      // 初始 100 个 buffer
  maxCapacity: 1000,         // 最多保留 1000 个
  bufferSize: 64 * 1024,     // 每个 64KB
});

// 后续 MessageBuilder 会自动使用池化内存
const builder = new MessageBuilder();
```

### 3. 直接操作二进制数据

```typescript
// ❌ 转换为字符串再处理
const text = reader.getData().toString();  // 拷贝
const result = process(text);

// ✅ 直接在 buffer 上操作
const data = reader.getData();  // Uint8Array，零拷贝
const result = processBinary(data);
```

### 4. 批量处理列表

```typescript
// ❌ 逐个添加元素
const list = builder.initItems(count);
for (let i = 0; i < items.length; i++) {
  list.get(i).setName(items[i].name);
}

// ✅ 预分配，批量复制（如果可能）
const list = builder.initItems(count);
// 使用 TypedArray 批量操作
const names = new TextEncoder().encode(allNames);
// ...
```

## RPC 优化

### 1. Promise Pipelining

```typescript
// ❌ 3 次网络往返
const foo = await getFoo();
const bar = await foo.getBar();
const result = await bar.compute();

// ✅ 1 次网络往返
const result = await getFoo().getBar().compute();
```

### 2. 批量 RPC 调用

```typescript
// ❌ 多次往返
for (const id of ids) {
  const item = await db.getItem({ id });  // 每次往返
  results.push(item);
}

// ✅ 单次往返（如果服务器支持）
const results = await db.getItems({ ids });  // 批量接口
```

### 3. 选择合适的传输

```typescript
// Node.js ↔ C++
import { EzRpcTransport } from '@naeemo/capnp';
const transport = await EzRpcTransport.connect(host, port);
// 最小开销，原始 TCP

// 浏览器 ↔ 服务器
import { WebSocketTransport } from '@naeemo/capnp';
const transport = await WebSocketTransport.connect(url);
// WebSocket 有少量帧头开销
```

### 4. 连接复用

```typescript
// ❌ 每次新建连接
async function callMethod(data) {
  const conn = await createConnection();  // 开销大
  return await conn.call(data);
}

// ✅ 复用连接
class ConnectionPool {
  private connections: RpcConnection[] = [];
  
  async getConnection() {
    return this.connections.find(c => c.isIdle()) 
      ?? await this.createConnection();
  }
}
```

## 内存优化

### 1. 避免大消息

```typescript
// ❌ 单个大消息
const hugeMessage = buildHugeMessage();  // 100MB
send(hugeMessage);

// ✅ 分块传输
const stream = createStream();
for (const chunk of chunks) {
  await stream.send(chunk);  // 每次 1MB
}
```

### 2. 及时释放引用

```typescript
function processLargeFile(data: Uint8Array) {
  const reader = new MessageReader(data);
  
  // 处理数据...
  const result = process(reader);
  
  // ✅ 及时释放，允许 GC
  reader.release?.();
  
  return result;
}
```

### 3. 使用 Struct Lists 而非 Pointer Lists

```typescript
// schema.capnp
# ❌ Pointer list，每个元素单独分配
struct Item { value @0 :UInt64; }
struct Container { items @0 :List(Item); }

# ✅ Inline list，连续内存
struct Container { 
  values @0 :List(UInt64); 
}
```

## 测量性能

### 使用内置 Benchmark

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

### 内存分析

```typescript
// Node.js
const v8 = require('v8');

function measureMemory() {
  const before = v8.getHeapStatistics();
  
  // 你的代码
  processLargeBatch();
  
  const after = v8.getHeapStatistics();
  console.log(`Heap used: ${(after.used_heap_size - before.used_heap_size) / 1024} KB`);
}
```

## 常见陷阱

### 1. 在热路径上创建 Builder

```typescript
// ❌ 高频调用中新建 builder
function handleRequest(data) {
  const builder = new MessageBuilder();  // 每次分配
  // ...
}

// ✅ 使用对象池
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

### 2. 不必要的字段拷贝

```typescript
// ❌ 拷贝所有字段
const copy = {
  id: reader.getId(),
  name: reader.getName(),
  // ... 几十个字段
};

// ✅ 直接传递 reader，按需读取
processReader(reader);  // 只读取需要的字段
```

### 3. 忽视列表预分配

```typescript
// ❌ 动态扩容
const list = [];
for (const item of items) {
  list.push(item);  // 多次扩容
}

// ✅ 预分配容量
const list = new Array(items.length);
for (let i = 0; i < items.length; i++) {
  list[i] = items[i];
}
```

## 性能基准

参考性能数据（在典型笔记本上）：

| 操作 | 性能 |
|------|------|
| 序列化 | ~1M ops/sec |
| 反序列化 | ~2M ops/sec（零拷贝） |
| RPC 调用（本地）| ~100K calls/sec |
| RPC 调用（远程）| 受网络延迟限制 |
| 流吞吐 | ~1 GB/sec |

## 参考

- [性能测试代码](../../src/bench/benchmark.ts)
- [内存池配置](../api/performance.md)
- [V8 性能指南](https://v8.dev/docs/profile)
