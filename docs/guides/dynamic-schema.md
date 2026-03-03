# 动态 Schema 指南

动态 Schema 允许你在运行时获取和使用 schema 信息，无需在编译时生成代码。这对于通用工具、调试器和支持多种 schema 的服务器非常有用。

## 使用场景

1. **通用 RPC 客户端** - 无需为每个服务生成代码
2. **Schema 浏览器** - 查看接口定义和类型
3. **调试工具** - 解码任意消息
4. **数据迁移工具** - 在不同 schema 版本间转换
5. **脚本语言绑定** - Python/JavaScript 动态调用

## 基本使用

### 获取远程 Schema

```typescript
import { SchemaCapabilityClient } from '@naeemo/capnp';

// 连接到提供 schema 的服务
const client = new SchemaCapabilityClient(connection);

// 获取特定类型的 schema
const schema = await client.getSchema({
  typeId: BigInt('0x8f9c8e7d6c5b4a50'),
});

console.log(schema.displayName);  // "Person"
console.log(schema.fields);       // 字段列表
```

### 动态读取消息

```typescript
import { createDynamicReader } from '@naeemo/capnp';
import { MessageReader } from '@naeemo/capnp';

// 假设你已经通过某种方式获取了 schema
const schema = await fetchSchema(typeId);

// 读取未知类型的消息
const messageReader = new MessageReader(data);
const dynamicReader = createDynamicReader(messageReader, schema);

// 动态访问字段
console.log(dynamicReader.get('name'));     // 任意字段名
console.log(dynamicReader.get('age'));      // 返回值是原始类型

// 获取所有字段
for (const [name, value] of dynamicReader.entries()) {
  console.log(`${name}: ${value}`);
}
```

### 动态构建消息

```typescript
import { createDynamicWriter } from '@naeemo/capnp';
import { MessageBuilder } from '@naeemo/capnp';

const message = new MessageBuilder();
const writer = createDynamicWriter(message, schema);

// 动态设置字段
writer.set('name', 'Alice');
writer.set('age', 30);
writer.set('emails', ['alice@example.com', 'alice@work.com']);

// 嵌套结构
const addressWriter = writer.init('address');
addressWriter.set('street', '123 Main St');
addressWriter.set('city', 'Springfield');

const data = message.toArrayBuffer();
```

## Schema 缓存

对于频繁使用的 schema，应该缓存以提高性能：

```typescript
import { createSchemaRegistry } from '@naeemo/capnp';

const registry = createSchemaRegistry({
  maxSize: 100,  // 最多缓存 100 个 schema
  ttl: 3600000,  // 1 小时过期
});

// 获取或加载 schema
const schema = await registry.getOrLoad(typeId, async () => {
  // 从远程服务器加载
  return await fetchSchemaFromServer(typeId);
});

// 缓存会自动更新
```

## 完整示例：通用 RPC 客户端

```typescript
import { 
  RpcConnection, 
  WebSocketTransport,
  SchemaCapabilityClient,
  createDynamicReader,
  createDynamicWriter 
} from '@naeemo/capnp';

class GenericRpcClient {
  private connection: RpcConnection;
  private schemaClient: SchemaCapabilityClient;
  private registry: SchemaRegistry;

  async connect(url: string) {
    const transport = await WebSocketTransport.connect(url);
    this.connection = new RpcConnection(transport);
    this.schemaClient = new SchemaCapabilityClient(this.connection);
    this.registry = createSchemaRegistry();
  }

  async call(
    interfaceId: bigint,
    methodName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    // 1. 获取 interface schema
    const interfaceSchema = await this.registry.getOrLoad(
      interfaceId,
      () => this.schemaClient.getSchema({ typeId: interfaceId })
    );

    // 2. 找到方法定义
    const method = interfaceSchema.methods.find(m => m.name === methodName);
    if (!method) {
      throw new Error(`Method ${methodName} not found`);
    }

    // 3. 构建请求
    const request = await this.buildRequest(method.paramStructType, args);

    // 4. 发送调用
    const response = await this.connection.call({
      interfaceId,
      methodId: method.id,
      params: request,
    });

    // 5. 解析响应
    return this.parseResponse(method.resultStructType, response);
  }

  private async buildRequest(
    typeId: bigint, 
    args: Record<string, unknown>
  ): Promise<Uint8Array> {
    const schema = await this.registry.getOrLoad(typeId, ...);
    const message = new MessageBuilder();
    const writer = createDynamicWriter(message, schema);
    
    for (const [key, value] of Object.entries(args)) {
      writer.set(key, value);
    }
    
    return message.toArrayBuffer();
  }

  private async parseResponse(
    typeId: bigint, 
    data: Uint8Array
  ): Promise<unknown> {
    const schema = await this.registry.getOrLoad(typeId, ...);
    const reader = new MessageReader(data);
    const dynamicReader = createDynamicReader(reader, schema);
    
    // 转换为普通对象
    return Object.fromEntries(dynamicReader.entries());
  }
}

// 使用
const client = new GenericRpcClient();
await client.connect('ws://example.com/rpc');

// 无需生成代码即可调用任何方法
const result = await client.call(
  BigInt('0x8f9c8e7d6c5b4a50'),
  'calculate',
  { expression: '1 + 1' }
);
```

## Schema 传输协议

Cap'n Proto 定义了标准的 schema 传输协议：

```typescript
interface SchemaProvider {
  getSchema @0 (typeId :UInt64) -> (schema :Schema);
  listSchemas @1 () -> (schemas :List(SchemaInfo));
}

struct Schema {
  typeId @0 :UInt64;
  displayName @1 :Text;
  nodes @2 :List(Node);  // 完整的 schema 节点树
}
```

实现 SchemaProvider 的服务器可以让客户端动态获取 schema。

## 与生成代码的对比

| 特性 | 生成代码 | 动态 Schema |
|------|----------|-------------|
| 类型安全 | ✅ 编译时检查 | ❌ 运行时检查 |
| 性能 | ✅ 最优 | ⚠️ 有额外开销 |
| 灵活性 | ❌ 编译时固定 | ✅ 运行时确定 |
| 包大小 | ⚠️ 随 schema 增加 | ✅ 固定大小 |
| IDE 支持 | ✅ 完整 | ⚠️ 有限 |
| 适用场景 | 生产代码 | 工具/调试/通用客户端 |

## 最佳实践

### 1. 混合使用

对性能关键路径使用生成代码，对工具类功能使用动态 schema：

```typescript
// 生产代码：使用生成的代码
import { Calculator } from './calculator.capnp.js';
const calc = await connection.bootstrap().getAs(Calculator);
const result = await calc.add({ a: 1, b: 2 });

// 调试工具：使用动态 schema
const inspector = new MessageInspector(schemaRegistry);
await inspector.inspect(messageData);
```

### 2. 缓存策略

```typescript
const registry = createSchemaRegistry({
  // LRU 缓存
  maxSize: 100,
  
  // TTL 过期
  ttl: 3600 * 1000,
  
  // 预加载常用 schema
  preload: [
    BigInt('0x8f9c8e7d6c5b4a50'), // Calculator
    BigInt('0x1234567890abcdef'), // Database
  ],
});
```

### 3. 错误处理

```typescript
try {
  const reader = createDynamicReader(messageReader, schema);
  const value = reader.get('fieldName');
} catch (error) {
  if (error.code === 'SCHEMA_MISMATCH') {
    // Schema 版本不匹配
  } else if (error.code === 'FIELD_NOT_FOUND') {
    // 字段不存在
  }
}
```

## 限制

1. **无类型安全**: 编译时无法检查字段名和类型
2. **性能开销**: 动态查找比直接访问慢
3. **IDE 支持**: 无法提供智能提示和自动完成

## 参考

- [API 参考 - DynamicReader](../api/dynamic.md)
- [API 参考 - SchemaRegistry](../api/schema-registry.md)
- [Cap'n Proto Schema 格式](https://capnproto.org/encoding.html)
