# Cap'n Proto RPC 使用指南

## 简介

@naeemo/capnp 提供完整的 Cap'n Proto RPC 实现，支持 Level 0-4 功能：

- **Level 0**: 基础 RPC (Bootstrap, Call/Return/Finish)
- **Level 1**: Promise Pipelining, Capability 传递
- **Level 2**: SturdyRefs (持久化能力引用)
- **Level 3**: 三方引入 (Provide/Accept)
- **Level 4**: Join 操作（引用相等性验证）

## 快速开始

### 1. 定义接口

创建 `.capnp` 文件定义服务接口：

```capnp
@0x1234567890abcdef;

interface Calculator {
  evaluate @0 (expression :Expression) -> (value :Float64);
  getOperator @1 (op :Operator) -> (func :Function);
}
```

### 2. 生成代码

```bash
npx capnp-ts-codegen calculator.capnp -o calculator.ts
```

生成的代码包含：
- `CalculatorInterfaceId` - 接口 ID 常量
- `CalculatorMethodIds` - 方法 ID 常量
- `CalculatorServer` - 服务器接口
- `CalculatorStub` - 服务器存根
- `CalculatorClient` - 客户端类（支持 Promise Pipelining）

### 3. 实现服务器

```typescript
import { RpcConnection, EzRpcTransport } from '@naeemo/capnp';
import { CalculatorServer, CalculatorStub } from './calculator.js';

class CalculatorImpl implements CalculatorServer {
  async evaluate(params: { expression: Expression }) {
    const value = this.compute(params.expression);
    return { value };
  }
}

const transport = await EzRpcTransport.connect('0.0.0.0', 8080);
const connection = new RpcConnection(transport, {
  bootstrap: new CalculatorImpl()
});
```

### 4. 创建客户端

```typescript
import { RpcConnection, EzRpcTransport } from '@naeemo/capnp';
import { Calculator } from './calculator.js';

const transport = await EzRpcTransport.connect('localhost', 8080);
const connection = new RpcConnection(transport);
const calculator = await connection.bootstrap().getAs(Calculator);

const result = await calculator.evaluate({
  expression: { literal: 42 }
});

console.log(result.value); // 42
```

## 核心概念

### Capability（能力）

Capability 是 RPC 的核心概念 - 它是调用远程对象方法的权限。

```typescript
// Capability 可以像本地对象一样使用
const result = await capability.someMethod(args);
```

### Promise Pipelining

Cap'n Proto 的杀手级特性 - 一次网络往返中发起多个调用：

```typescript
// 传统 RPC: 3 次往返
const user = await db.getUser({ id: 1 });
const orders = await user.getOrders();
const items = await orders.getItems();

// Cap'n Proto: 1 次往返
const items = await db
  .getUser({ id: 1 })
  .getOrders()
  .getItems();
```

### SturdyRefs

持久化的能力引用，连接断开后仍然存在：

```typescript
import { SturdyRefManager } from '@naeemo/capnp';

const manager = new SturdyRefManager({
  secretKey: 'your-secret-key'
});

// 保存能力
const token = await manager.save(myCapability, { ttl: 3600 });
// 存储 token 到数据库...

// 之后，恢复能力
const restored = await manager.restore(token);
// 同一个能力，即使重连后
```

## 高级特性

### Level 3: 三方引入

允许能力在三个参与方之间传递：

```typescript
import { ConnectionManager } from '@naeemo/capnp';

const manager = new ConnectionManager({
  vatId: generateVatId()
});

// Alice 将能力传递给 Carol，通过 Bob
await manager.introduce({
  provider: aliceConnection,
  recipient: carolConnection,
  capability: someCapability
});
```

### Level 4: Join

验证两个能力是否指向同一个对象：

```typescript
const isSame = await connection.join([cap1, cap2]);
if (isSame) {
  console.log('同一个对象');
}
```

### 动态 Schema

在运行时获取 schema 信息：

```typescript
const schema = await connection.getDynamicSchema({
  typeName: 'calculator.Calculator'
});

// 使用动态 reader/writer
const writer = createDynamicWriter(schema);
writer.set('operand1', 10);
writer.set('operand2', 20);
```

## 最佳实践

### 1. 使用 Promise Pipelining

```typescript
// ✅ 好的做法：链式调用
const result = await service
  .getA()
  .getB()
  .getC();

// ❌ 避免：顺序 await
const a = await service.getA();
const b = await a.getB();
const result = await b.getC();
```

### 2. 错误处理

```typescript
try {
  const result = await capability.method();
} catch (error) {
  switch (error.type) {
    case 'disconnected':
      await reconnect();
      break;
    case 'failed':
      console.error('方法失败:', error.reason);
      break;
  }
}
```

### 3. 清理资源

```typescript
const connection = new RpcConnection(transport);
try {
  await connection.start();
  // ... 使用连接
} finally {
  await connection.stop();
}
```

## 参考

- [完整 RPC 指南](./guides/rpc.md)
- [动态 Schema 指南](./guides/dynamic-schema.md)
- [Cap'n Proto RPC 规范](https://capnproto.org/rpc.html)
