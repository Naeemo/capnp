# 快速入门

5 分钟上手 @naeemo/capnp。

## 安装

```bash
npm install @naeemo/capnp
```

同时需要安装官方 `capnp` 工具用于 schema 编译：

```bash
# macOS
brew install capnp

# Ubuntu/Debian
apt-get install capnp

# 验证安装
capnp --version
```

## 定义 Schema

创建 `person.capnp`：

```capnp
@0x1234567890abcdef;

struct Person {
  id @0 :UInt32;
  name @1 :Text;
  email @2 :Text;
  phones @3 :List(PhoneNumber);

  struct PhoneNumber {
    number @0 :Text;
    type @1 :Type;
    
    enum Type {
      mobile @0;
      home @1;
      work @2;
    }
  }
}
```

## 生成 TypeScript

```bash
npx capnp-ts-codegen person.capnp -o person.ts
```

生成的代码包含：
- `Person` - TypeScript 接口
- `PersonReader` - 读取已序列化的消息
- `PersonBuilder` - 构建新消息

## 基本使用

### 构建消息

```typescript
import { MessageBuilder } from '@naeemo/capnp';
import { PersonBuilder } from './person.js';

// 创建消息构建器
const message = new MessageBuilder();
const person = message.initRoot(PersonBuilder);

// 设置字段
person.setId(123);
person.setName('Alice');
person.setEmail('alice@example.com');

// 添加列表
const phones = person.initPhones(2);
phones.get(0).setNumber('555-1234');
phones.get(0).setType(Person.PhoneNumber.Type.mobile);
phones.get(1).setNumber('555-5678');
phones.get(1).setType(Person.PhoneNumber.Type.home);

// 序列化为 Uint8Array
const data = message.toArrayBuffer();
```

### 读取消息

```typescript
import { MessageReader } from '@naeemo/capnp';
import { PersonReader } from './person.js';

// 从 Uint8Array 读取
const reader = new MessageReader(new Uint8Array(data));
const person = reader.getRoot(PersonReader);

// 访问字段
console.log(person.getId());      // 123
console.log(person.getName());    // "Alice"
console.log(person.getEmail());   // "alice@example.com"

// 遍历列表
for (const phone of person.getPhones()) {
  console.log(phone.getNumber(), phone.getType());
}
```

## RPC 调用

### 服务端

```typescript
import { RpcConnection, EzRpcTransport } from '@naeemo/capnp';

// 实现服务
class MyServiceImpl implements MyService.Server {
  async echo(params: { message: string }) {
    return { result: params.message };
  }
}

// 创建服务器
const transport = await EzRpcTransport.connect('0.0.0.0', 8080);
const connection = new RpcConnection(transport, {
  bootstrap: new MyServiceImpl()
});
```

### 客户端

```typescript
import { EzRpcTransport, RpcConnection } from '@naeemo/capnp';

// 连接服务器
const transport = await EzRpcTransport.connect('localhost', 8080);
const connection = new RpcConnection(transport);

// 获取能力
const service = await connection.bootstrap().getAs(MyService);

// 调用方法
const result = await service.echo({ message: 'Hello' });
console.log(result); // "Hello"
```

## 下一步

- [代码生成详解](./guides/codegen.md) - 了解更多生成选项
- [RPC 使用指南](./guides/rpc.md) - Promise Pipelining、Capability 传递
- [示例代码](./examples.md) - 更多使用示例
