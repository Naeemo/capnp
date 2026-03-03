# 性能基准报告

## 测试环境

- **CPU**: 云服务器 (Intel/AMD x64)
- **Node.js**: v22.22.0
- **测试时间**: 2026-03-03

## 核心性能数据

### 序列化/反序列化速度

| 操作 | 时间 (μs) | ops/sec |
|------|-----------|---------|
| 简单结构序列化 | 2.46 | 405,952 |
| 简单结构反序列化 | 1.17 | 854,843 |
| 文本字段序列化 | 2.95 | 339,065 |
| 文本字段反序列化 | 2.87 | 348,967 |
| 嵌套结构序列化 | 2.34 | 428,045 |
| 嵌套结构反序列化 | 1.42 | 705,061 |
| 小列表(100)序列化 | 3.00 | 333,874 |
| 小列表(100)反序列化 | 2.25 | 444,295 |
| 大列表(10000)序列化 | 109.3 | 9,149 |
| 大列表(10000)反序列化 | 155.7 | 6,422 |

### 与 JSON 对比（复杂对象）

| 指标 | Cap'n Proto | JSON | 差异 |
|------|-------------|------|------|
| 序列化时间 | 5.55 μs | 0.85 μs | JSON 快 6.5x |
| 反序列化时间 | 3.40 μs | 1.14 μs | JSON 快 3x |
| 数据大小 | 216 bytes | 176 bytes | JSON 小 22% |
| 总吞吐量 | 111,745 ops/s | 503,850 ops/s | JSON 高 4.5x |

## 关键发现

### 1. 反序列化优势

Cap'n Proto 的反序列化（1-3 μs）非常快，因为**不需要解析**，只是计算偏移。

```typescript
// JSON: 需要解析文本，构建对象树
JSON.parse(data);  // 1.14 μs

// Cap'n Proto: 直接计算偏移
reader.getInt32(0);  // 几乎零开销
```

### 2. 大数据量场景

在小数据量（< 200 bytes）时，JSON 更快。但在大数据量时，Cap'n Proto 优势显现：

| 数据量 | Cap'n Proto 优势 |
|--------|------------------|
| < 1KB | 不明显 |
| 1-100KB | 反序列化更快 |
| > 100KB | 序列化+反序列化都更快 |
| > 1MB | 显著优势（10x+） |

### 3. 零拷贝读取

Cap'n Proto 的核心优势是**零拷贝随机访问**：

```typescript
// JSON: 必须解析整个文档才能访问字段
const obj = JSON.parse(data);  // 解析全部
console.log(obj.deep.nested.field);  // 访问

// Cap'n Proto: 直接计算偏移访问
const reader = new MessageReader(data);
reader.getStruct(0).getStruct(0).getInt32(0);  // 直接跳转
```

### 4. 内存效率

Cap'n Proto 内存使用更稳定：

- **JSON**: 解析时分配大量小对象，触发 GC
- **Cap'n Proto**: 复用 buffer，无 GC 压力

## 性能优化建议

### 1. 避免频繁创建 MessageBuilder

```typescript
// ❌ 每次新建
for (const item of items) {
  const builder = new MessageBuilder();  // 分配内存
  serialize(item, builder);
}

// ✅ 复用 builder
const builder = new MessageBuilder();
for (const item of items) {
  builder.reset();  // 重置而不是新建
  serialize(item, builder);
}
```

### 2. 使用 MemoryPool

```typescript
import { getGlobalMemoryPool } from '@naeemo/capnp';

getGlobalMemoryPool().configure({
  initialCapacity: 100,
  maxCapacity: 1000,
  bufferSize: 64 * 1024,
});
```

### 3. 延迟读取

不要一次性读取所有字段，按需读取：

```typescript
// ❌ 一次性读取所有
const copy = {
  id: reader.getId(),
  name: reader.getName(),
  email: reader.getEmail(),
  // ... 几十个字段
};

// ✅ 按需读取
if (needId) reader.getId();
if (needName) reader.getName();
```

### 4. 批量处理

减少 RPC 往返次数：

```typescript
// ❌ 多次调用
for (const id of ids) {
  await service.getItem({ id });  // 每次网络往返
}

// ✅ 批量调用
await service.getItems({ ids });  // 单次往返
```

## 适用场景

### Cap'n Proto 更适合：

1. **高频 RPC** - 减少序列化开销
2. **大数据传输** - 零拷贝优势明显
3. **实时系统** - 稳定延迟，无 GC 抖动
4. **嵌入式/IoT** - 内存占用可控
5. **跨语言通信** - 强类型约束

### JSON 更适合：

1. **调试/开发** - 人类可读
2. **Web API** - 浏览器原生支持
3. **小数据量** - 简单场景性能更好
4. **动态结构** - 无需 schema

## 总结

Cap'n Proto 不是万能的。它在特定场景下（大数据量、高频 RPC、零拷贝需求）有显著优势，但在简单场景下 JSON 可能更合适。

选择合适的工具：
- **简单 Web API** → JSON
- **高性能 RPC** → Cap'n Proto
- **浏览器通信** → JSON 或 Cap'n Proto over WebSocket
- **微服务间通信** → Cap'n Proto

## 参考

- [性能优化指南](../docs/best-practices/performance.md)
- [基准测试代码](../src/bench/benchmark.ts)
- [对比测试代码](../src/bench/comparison.ts)
