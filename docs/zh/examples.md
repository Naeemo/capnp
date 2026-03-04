# 示例代码

完整的使用示例。

## 基础序列化

简单的消息序列化和反序列化：

```typescript
import { MessageBuilder, MessageReader } from '@naeemo/capnp';
import { PersonBuilder, PersonReader } from './person.js';

// 构建消息
const message = new MessageBuilder();
const person = message.initRoot(PersonBuilder);
person.setName('Alice');
person.setAge(30);
person.setEmail('alice@example.com');

const data = message.toArrayBuffer();

// 读取消息
const reader = new MessageReader(new Uint8Array(data));
const personReader = reader.getRoot(PersonReader);

console.log(personReader.getName());  // "Alice"
console.log(personReader.getAge());   // 30
```

**完整代码**: [examples/basic.ts](https://github.com/Naeemo/capnp/blob/main/examples/basic.ts)

---

## Echo 服务 (RPC)

完整的 RPC 客户端/服务端示例：

### 服务端

```typescript
import { RpcConnection, EzRpcTransport } from '@naeemo/capnp';
import { EchoService } from './echo-service.js';

class EchoServiceImpl implements EchoService.Server {
  async echo(params: { message: string }) {
    return { result: params.message };
  }
}

const transport = await EzRpcTransport.connect('0.0.0.0', 8080);
const connection = new RpcConnection(transport, {
  bootstrap: new EchoServiceImpl()
});
```

### 客户端

```typescript
const transport = await EzRpcTransport.connect('localhost', 8080);
const connection = new RpcConnection(transport);
const echo = await connection.bootstrap().getAs(EchoService);

const result = await echo.echo({ message: 'Hello' });
console.log(result); // "Hello"
```

**完整代码**: [examples/echo-service.ts](https://github.com/Naeemo/capnp/blob/main/examples/echo-service.ts)

---

## Promise Pipelining

在一次网络往返中链式调用多个 RPC：

```typescript
// 不使用 pipelining: 3 次往返
const user = await db.getUser({ id: 1 });
const orders = await user.getOrders();
const items = await orders.getItems();

// 使用 pipelining: 1 次往返
const items = await db
  .getUser({ id: 1 })
  .getOrders()
  .getItems();
```

**完整代码**: [examples/promise-pipelining.ts](https://github.com/Naeemo/capnp/blob/main/examples/promise-pipelining.ts)

---

## 动态 Schema

在运行时处理 schema，无需代码生成：

```typescript
import { createDynamicWriter, createDynamicReader } from '@naeemo/capnp';

// 运行时定义 schema
const schema = {
  id: '0x123',
  displayName: 'Person',
  structInfo: {
    fields: [
      { name: 'name', type: { kind: { type: 'text' } } },
      { name: 'age', type: { kind: { type: 'uint32' } } }
    ]
  }
};

// 构建消息
const writer = createDynamicWriter(schema);
writer.set('name', 'Bob');
writer.set('age', 25);
const buffer = writer.toBuffer();

// 读取消息
const reader = createDynamicReader(schema, buffer);
console.log(reader.get('name')); // "Bob"
```

**完整代码**: [examples/dynamic-schema.ts](https://github.com/Naeemo/capnp/blob/main/examples/dynamic-schema.ts)

---

## WebSocket 聊天

使用 WebSocket 传输的实时聊天：

**完整代码**: [examples/websocket-chat.ts](https://github.com/Naeemo/capnp/blob/main/examples/websocket-chat.ts)

---

## 文件传输

大文件分块流传输：

**完整代码**: [examples/file-transfer.ts](https://github.com/Naeemo/capnp/blob/main/examples/file-transfer.ts)

---

## 更多示例

浏览 [GitHub 仓库](https://github.com/Naeemo/capnp/tree/main/examples) 中的所有示例。
