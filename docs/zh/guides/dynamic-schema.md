# 动态 Schema

运行时从 RPC 服务器获取 schema 信息，无需预先生成代码。

## 使用场景

- 动态语言环境（脚本、REPL）
- 调试和探索性开发
- 泛型工具（schema 浏览器、代理）

## 基本用法

### 1. 请求 Schema

```typescript
import { RpcConnection } from '@naeemo/capnp';

const conn = new RpcConnection(transport);

// 按类型名请求 schema
const schema = await conn.getDynamicSchema({ 
  typeName: "calculator.Calculator" 
});
```

### 2. 动态读写

```typescript
import { createDynamicWriter, createDynamicReader } from '@naeemo/capnp';

// 构建消息
const writer = createDynamicWriter(schema);
writer.set("name", "Alice");
writer.set("age", 30);
const buffer = writer.toBuffer();

// 读取消息
const reader = createDynamicReader(schema, buffer);
console.log(reader.get("name")); // "Alice"
console.log(reader.get("age"));  // 30
```

### 3. 处理列表

```typescript
// 初始化列表
const list = writer.initList("items", 3);
list.set(0, { name: "Item 1", price: 100 });
list.set(1, { name: "Item 2", price: 200 });

// 读取列表
for (const item of reader.getList("items")) {
  console.log(item.get("name"));
}
```

## Schema Registry

缓存和管理解析的 schemas：

```typescript
import { createSchemaRegistry } from '@naeemo/capnp';

const registry = createSchemaRegistry();

// 注册 schema
registry.registerNode(schemaNode);

// 按 ID 查询
const schema = registry.getNodeById(0x123456789abcdef0n);

// 按名称查询
const schema = registry.getNodeByName("myapp.Person");
```

## 完整示例

```typescript
import { 
  EzRpcTransport, 
  RpcConnection,
  createDynamicWriter,
  createDynamicReader 
} from '@naeemo/capnp';

async function main() {
  // 连接服务器
  const transport = await EzRpcTransport.connect('localhost', 8080);
  const conn = new RpcConnection(transport);

  // 获取动态 schema
  const personSchema = await conn.getDynamicSchema({ 
    typeName: "addressbook.Person" 
  });

  // 构建消息
  const writer = createDynamicWriter(personSchema);
  writer.set("name", "Bob");
  writer.set("email", "bob@example.com");
  
  const phones = writer.initList("phones", 2);
  phones.get(0).set("number", "555-1234");
  phones.get(0).set("type", "mobile");

  // 序列化
  const buffer = writer.toBuffer();

  // 读取
  const reader = createDynamicReader(personSchema, buffer);
  console.log(reader.get("name"));
  console.log(reader.has("email"));
}
```

## 与生成代码对比

| 特性 | 动态 Schema | 生成代码 |
|------|-------------|----------|
| 类型安全 | 运行时检查 | 编译时检查 |
| 性能 | 稍慢（反射）| 最优（直接访问）|
| 灵活性 | 高 | 低 |
| IDE 支持 | 有限 | 完整 |
| 适用场景 | 探索、工具 | 生产代码 |

**建议**：生产环境使用生成代码，开发调试使用动态 schema。
