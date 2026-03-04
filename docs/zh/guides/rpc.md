# RPC 使用指南

@naeemo/capnp 实现了完整的 Cap'n Proto RPC 协议（Level 0-4），支持从基本的远程调用到高级的 Promise Pipelining 和三方引入。

## 基本概念

### Capability（能力）

Capability 是 RPC 的核心概念，代表一个远程对象上的权限。它不是对象本身，而是调用该对象方法的权限。

```typescript
// Capability 可以像本地对象一样使用
const result = await capability.someMethod(args);
```

### 传输层

根据使用场景选择合适的传输：

| 传输 | 适用场景 | 特点 |
|------|----------|------|
| `EzRpcTransport` | Node.js ↔ C++ | 原始 TCP，无长度前缀 |
| `WebSocketTransport` | 浏览器、Node.js | 带长度前缀，支持浏览器 |
| `TcpTransport` | Node.js 内部 | 带长度前缀的 TCP |

## 基础 RPC

### 服务端实现

```typescript
import { RpcConnection, EzRpcTransport } from '@naeemo/capnp';
import { Calculator } from './calculator.js';  // 生成的代码

// 实现服务接口
class CalculatorImpl implements Calculator.Server {
  async evaluate(params: { expression: Expression }): Promise<{ value: number }> {
    // 实现计算逻辑
    return { value: this.compute(params.expression) };
  }
  
  private compute(expr: Expression): number {
    // ...
  }
}

// 启动服务器
async function startServer() {
  const transport = await EzRpcTransport.connect('0.0.0.0', 8080);
  const connection = new RpcConnection(transport, {
    bootstrap: new CalculatorImpl()
  });
  await connection.start();
  console.log('Server started');
}
```

### 客户端调用

```typescript
import { EzRpcTransport, RpcConnection } from '@naeemo/capnp';
import { Calculator } from './calculator.js';

async function useClient() {
  // 连接服务器
  const transport = await EzRpcTransport.connect('localhost', 8080);
  const connection = new RpcConnection(transport);
  await connection.start();
  
  // 获取 bootstrap 能力
  const calculator = await connection.bootstrap().getAs(Calculator);
  
  // 调用方法
  const result = await calculator.evaluate({
    expression: { literal: 42 }
  });
  
  console.log(result.value); // 42
}
```

## Promise Pipelining（流水线调用）

Promise Pipelining 是 Cap'n Proto RPC 的核心特性，允许在收到第一个调用的结果之前就发送第二个调用。

### 传统 RPC 的问题

```typescript
// 传统方式：需要 2 次网络往返
const foo = await getFoo();      // 第 1 次往返
const bar = await foo.getBar();  // 第 2 次往返
const result = await bar.baz();  // 第 3 次往返
// 总共 3 次往返！
```

### Cap'n Proto 的解决方案

```typescript
// Promise Pipelining：只需要 1 次网络往返
const foo = getFoo();                    // 不等待
const bar = foo.getBar();                // 在返回的 promise 上继续调用
const result = await bar.baz();          // 所有调用合并为一次往返
// 总共 1 次往返！
```

### 实际示例

```typescript
// 文件系统场景
const directory = await connection.bootstrap().getAs(Directory);

// 链式调用，只产生一次网络往返
const fileContent = await directory
  .open('documents')
  .open('report.txt')
  .read();
```

## Capability 传递

可以将 Capability 作为参数传递给远程方法：

```typescript
// 服务端提供数据能力
class DataProviderImpl implements DataProvider.Server {
  async getData() {
    return { data: 'some data' };
  }
}

// 客户端创建回调能力
class CallbackImpl implements Callback.Server {
  async onData(params: { data: string }) {
    console.log('Received:', params.data);
  }
}

// 使用
const provider = await connection.bootstrap().getAs(DataProvider);
const callback = new CallbackImpl();

// 将回调能力传递给服务端
await provider.processWithCallback({ callback });
```

## SturdyRefs（持久化能力）

SturdyRefs 允许 Capability 在连接断开后仍然存在：

```typescript
import { SturdyRefManager } from '@naeemo/capnp';

// 创建 SturdyRefManager
const sturdyRefs = new SturdyRefManager({
  secretKey: 'your-secret-key',  // 用于签名
});

// 保存能力
const token = await sturdyRefs.save(myCapability, {
  ttl: 3600,  // 1小时有效期
});
// token 是字符串，可以存储到数据库

// 恢复能力
const restoredCapability = await sturdyRefs.restore(token);
// 即使连接断开重连，也能恢复相同的能力
```

## Level 3: 三方引入

支持在三个参与方之间传递 Capability：

```typescript
import { ConnectionManager } from '@naeemo/capnp';

const manager = new ConnectionManager({
  vatId: generateVatId(),
});

// Alice 将能力传递给 Carol，通过 Bob
const carolId = await manager.introduce({
  provider: aliceConnection,
  recipient: carolId,
  capability: someCapability,
});
```

## 流控制

### Stream API

```typescript
import { createStream } from '@naeemo/capnp';

const stream = createStream({
  direction: 'bidirectional',
  flowControl: {
    windowSize: 65536,    // 64KB 窗口
  }
});

// 发送数据
for await (const chunk of stream) {
  await processChunk(chunk);
  stream.send(responseChunk);
}
```

### Bulk Transfer

```typescript
import { BulkTransferManager } from '@naeemo/capnp';

const bulk = createBulkTransferManager({
  chunkSize: 1024 * 1024,  // 1MB chunks
});

await bulk.upload({
  data: largeFileStream,
  onProgress: (progress) => {
    console.log(`${progress.percentage}%`);
  }
});
```

### Realtime Stream

```typescript
import { createRealtimeStreamManager, DropPolicy } from '@naeemo/capnp';

const realtime = createRealtimeStreamManager({
  policy: DropPolicy.oldest,  // 超出窗口时丢弃最旧数据
  maxLatency: 100,            // 100ms 最大延迟
});

// 适用于音视频流
realtime.send(videoFrame);
```

## 错误处理

```typescript
try {
  const result = await capability.someMethod();
} catch (error) {
  if (error.type === 'disconnected') {
    // 连接断开，可能需要重连
  } else if (error.type === 'failed') {
    // 方法执行失败
    console.error('Method failed:', error.reason);
  } else if (error.type === 'unimplemented') {
    // 服务器不支持该方法
  }
}
```

## 最佳实践

1. **尽早使用 Pipeline**: 不要 `await` 中间结果，直接链式调用
2. **限制并发**: 使用 `Promise.all()` 时要注意服务器负载
3. **处理断开**: 始终监听 `onClose` 事件
4. **使用 SturdyRefs**: 需要持久化的能力应该用 SturdyRefs

```typescript
// 好的做法：链式调用
const result = await obj.a().b().c();

// 避免：不必要的 await
const a = await obj.a();
const b = await a.b();
const result = await b.c();
```

## 参考

- [Cap'n Proto RPC 协议](https://capnproto.org/rpc.html)
- [Promise Pipelining 论文](http://www.erights.org/elib/distrib/pipeline.html)
- [API 参考 - RPC](./api/rpc.md)
