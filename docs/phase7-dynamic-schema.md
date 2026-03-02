# Phase 7: Dynamic Schema Transfer Protocol

## 概述

Phase 7 实现了 Cap'n Proto RPC 的动态 Schema 传输协议，允许运行时从 RPC 服务器获取 schema 信息。这对动态语言（如 Python、JavaScript）特别有用，因为它们可以在运行时获取类型信息，而无需预先生成代码。

## 已完成的工作

### 1. Schema 传输协议 (rpc.capnp)

在 `src/rpc/rpc.capnp` 中添加了新的消息类型：

```capnp
# 主 Message 结构体中添加了:
schemaRequest @14 :SchemaRequest;
schemaResponse @15 :SchemaResponse;
```

新增的结构体：

- **SchemaRequest**: 请求 schema 信息
  - `questionId`: 问题 ID
  - `targetSchema`: 目标 schema 规格（按 typeId、typeName、fileId、fileName 或 bootstrapInterface）

- **SchemaResponse**: 响应包含 schema 数据或异常
  - `answerId`: 对应请求的 answer ID
  - `success`: 包含 SchemaPayload
  - `exception`: 错误信息

- **SchemaPayload**: 序列化的 schema 数据
  - `schemaData`: 二进制 schema 数据
  - `format`: 格式（binary/json/capnp）
  - `sourceInfo`: 可选的源码信息
  - `dependencies`: 依赖项列表

- **SchemaCapability**: 专用 schema 提供者接口
  - `getSchema`: 获取 schema
  - `listAvailableSchemas`: 列出可用 schemas

### 2. TypeScript 类型定义 (schema-types.ts)

完整的类型系统，包括：

- Schema 消息类型（SchemaRequest, SchemaResponse, SchemaPayload 等）
- Schema 节点类型（SchemaNode, SchemaField, SchemaType, SchemaMethod 等）
- SchemaRegistry 接口用于管理解析的 schemas
- DynamicSchemaLoader 接口用于加载 schema

### 3. 序列化/反序列化 (schema-serializer.ts)

实现了以下消息的编解码：

- `serializeSchemaRequest` / `deserializeSchemaRequest`
- `serializeSchemaResponse` / `deserializeSchemaResponse`
- `serializeGetSchemaParams` / `serializeGetSchemaResults`
- `serializeListSchemasResults`

### 4. Schema 解析器 (schema-parser.ts)

运行时解析 schema 二进制数据：

- `parseSchemaNodes`: 解析 CodeGeneratorRequest 格式的数据
- `createSchemaRegistry`: 创建 schema 注册表
- 支持 Node、Field、Type、Method、Annotation 等的解析

## 使用示例

### 请求 Schema

```typescript
import { 
  SchemaRequest, 
  SchemaTarget,
  serializeSchemaRequest,
  deserializeSchemaResponse 
} from '@naeemo/capnp/rpc';

// 创建 schema 请求
const request: SchemaRequest = {
  questionId: 42,
  targetSchema: { type: "byTypeName", typeName: "calculator.Calculator" }
};

// 序列化请求
const data = serializeSchemaRequest(request);

// 发送请求... 接收响应...

// 反序列化响应
const response = deserializeSchemaResponse(responseData);
if (response.result.type === "success") {
  console.log("Schema format:", response.result.payload.format);
  console.log("Schema data:", response.result.payload.schemaData);
}
```

### 解析 Schema

```typescript
import { parseSchemaNodes, createSchemaRegistry } from '@naeemo/capnp/rpc';

// 解析从服务器获取的 schema 数据
const nodes = parseSchemaNodes(schemaBinaryData);

// 创建注册表并添加节点
const registry = createSchemaRegistry();
for (const node of nodes) {
  registry.registerNode(node);
}

// 查询 schema
const calculatorSchema = registry.getNodeByName("calculator.Calculator");
console.log("Methods:", calculatorSchema?.interfaceInfo?.methods);
```

### 使用 SchemaRegistry

```typescript
import { createSchemaRegistry } from '@naeemo/capnp/rpc';

const registry = createSchemaRegistry();

// 注册 schema 节点
registry.registerNode({
  id: 0x123456789abcdef0n,
  displayName: "myapp.Person",
  displayNamePrefixLength: 6,
  scopeId: 0n,
  nestedNodes: [],
  annotations: [],
  type: SchemaNodeType.STRUCT,
  structInfo: {
    dataWordCount: 2,
    pointerCount: 1,
    preferredListEncoding: 7,
    isGroup: false,
    discriminantCount: 0,
    discriminantOffset: 0,
    fields: [
      { name: "name", codeOrder: 0, discriminantValue: 0xffff, offset: 0, 
        type: { kind: { type: "text" } }, hadExplicitDefault: false },
      { name: "age", codeOrder: 1, discriminantValue: 0xffff, offset: 0,
        type: { kind: { type: "uint32" } }, hadExplicitDefault: false }
    ]
  }
});

// 查询
const personSchema = registry.getNodeByName("myapp.Person");
console.log("Fields:", personSchema?.structInfo?.fields);
```

## 后续工作

### 待完成

1. **Dynamic Reader/Writer 生成**
   - 基于解析的 schema 动态创建消息 reader
   - 动态创建消息 writer
   - 支持动态字段访问（`reader.getField('name')`）

2. **工具支持**
   - `capnp-ts-codegen --dynamic` 模式
   - 交互式 schema 浏览器 CLI

3. **与 RPC Connection 集成**
   - 在 RpcConnection 中添加 `getDynamicSchema()` 方法
   - 自动 schema 缓存和版本管理

## 参考

- [官方 schema.capnp](https://github.com/capnproto/capnproto/blob/master/c%2B%2B/src/capnp/schema.capnp)
- [Cap'n Proto RPC 协议](https://capnproto.org/rpc.html)
