# Cap'n Proto RPC 使用指南

## 简介

@naeemo/capnp 提供完整的 Cap'n Proto RPC 实现，支持 Level 0-4 功能：

- **Level 0**: 基础 RPC (Bootstrap, Call/Return/Finish)
- **Level 1**: Promise Pipelining, Capability 传递
- **Level 2**: SturdyRefs (持久化能力引用)
- **Level 3**: 第三方握手 (Provide/Accept)
- **Level 4**: Join 操作（引用相等性验证）
- **Phase 7**: Dynamic Schema（动态 Schema 获取）

## 快速开始

### 1. 定义接口

创建 `.capnp` 文件定义你的服务接口：

```capnp
@0x1234567890abcdef;

interface Calculator {
  evaluate @0 (expression :Expression) -> (value :Float64);
  getOperator @1 (op :Operator) -> (func :Function);
}

struct Expression {
  union {
    literal @0 :Float64;
    call @1 :Call;
  }
}

struct Call {
  function @0 :Function;
  params @1 :List(Expression);
}

struct Function {
  interfaceId @0 :UInt64;
  methodId @1 :UInt16;
}

enum Operator {
  add @0;
  subtract @1;
  multiply @2;
  divide @3;
}
```

### 2. 生成代码

使用 V3 CLI 生成 TypeScript 代码：

```bash
npx capnp-ts-codegen calculator.capnp -o calculator.ts
```

生成的代码包含：
- `CalculatorInterfaceId` - 接口 ID 常量
- `CalculatorMethodIds` - 方法 ID 常量
- `CalculatorServer` - 服务器接口
- `CalculatorStub` - 服务器存根（方法分发）
- `CalculatorClient` - 客户端类（支持 Promise Pipelining）

### 3. 实现服务器

```typescript
import { RpcConnection, WebSocketTransport } from '@naeemo/capnp';
import { 
  CalculatorServer, 
  CalculatorStub,
  EvaluateParamsReader,
  EvaluateResultsBuilder,
  CallContext 
} from './calculator.js';

class CalculatorImpl implements CalculatorServer {
  async evaluate(
    context: CallContext<EvaluateParamsReader, EvaluateResultsBuilder>
  ): Promise<void> {
    const params = context.getParams();
    const results = context.getResults();
    
    const value = this.evaluateExpression(params.getExpression());
    results.setValue(value);
    
    context.return();
  }
  
  private evaluateExpression(expr: ExpressionReader): number {
    // 实现表达式求值逻辑
    return 0;
  }
}

// 启动服务器
const transport = WebSocketTransport.fromWebSocket(ws);
const calculator = new CalculatorImpl();
const stub = new CalculatorStub(calculator);

const connection = new RpcConnection(transport, {
  bootstrap: stub
});

await connection.start();
```

### 4. 创建客户端

```typescript
import { WebSocketTransport, RpcConnection } from '@naeemo/capnp';
import { CalculatorClient } from './calculator.js';

// 连接到服务器
const transport = await WebSocketTransport.connect('ws://localhost:8080');
const connection = new RpcConnection(transport);
await connection.start();

// 获取 bootstrap 能力
const bootstrap = await connection.bootstrap();

// 创建 Calculator 客户端
const calculator = new CalculatorClient(connection, bootstrap);

// 调用方法
const result = await calculator.evaluate({
  expression: { literal: 42.0 }
});

console.log('Result:', result.getValue());

// 关闭连接
await connection.stop();
```

## Phase 7: Dynamic Schema（动态 Schema 获取）

Phase 7 提供了在运行时动态获取和使用 Schema 的能力，特别适用于：

- **动态语言绑定** - 为 Python、Ruby 等动态语言提供运行时类型信息
- **Schema 浏览器** - 构建可以探索远程服务类型的工具
- **通用客户端** - 创建可以调用任何 Cap'n Proto 服务的通用客户端
- **调试工具** - 在运行时检查和解析消息内容

### 核心功能

#### 1. 从远程获取 Schema

```typescript
import { RpcConnection, WebSocketTransport } from '@naeemo/capnp';

const transport = await WebSocketTransport.connect('ws://localhost:8080');
const connection = new RpcConnection(transport);
await connection.start();

// 通过类型 ID 获取 Schema
const schema = await connection.getDynamicSchema(0x1234567890abcdefn);
console.log('Struct name:', schema.displayName);
console.log('Fields:', schema.structInfo?.fields);

// 通过类型名称获取 Schema
const schemaByName = await connection.getDynamicSchemaByName('myapp.Person');
```

#### 2. 使用 Dynamic Reader 读取消息

```typescript
import { createDynamicReader, dumpDynamicReader } from '@naeemo/capnp';

// 获取 Schema
const schema = await connection.getDynamicSchema(0x1234567890abcdefn);

// 创建动态 reader 读取消息
const reader = createDynamicReader(schema, messageBuffer);

// 动态访问字段
console.log('Name:', reader.get('name'));
console.log('Age:', reader.get('age'));

// 导出所有字段
console.log(dumpDynamicReader(reader));
```

#### 3. 使用 Dynamic Writer 写入消息

```typescript
import { createDynamicWriter } from '@naeemo/capnp';

// 获取 Schema
const schema = await connection.getDynamicSchema(0x1234567890abcdefn);

// 创建动态 writer
const writer = createDynamicWriter(schema);

// 设置字段
writer.set('name', 'John Doe');
writer.set('age', 30);
writer.setText('email', 'john@example.com');

// 序列化
const buffer = writer.toBuffer();
```

### CLI 工具增强

#### 生成动态加载代码

使用 `--dynamic` 标志生成支持动态 Schema 加载的代码：

```bash
# 生成动态加载代码
capnp-ts-codegen calculator.capnp --dynamic -o calculator-dynamic.ts

# 生成的代码包含：
# - 类型 ID 常量
# - loadCalculatorSchema() - 从远程加载 Schema
# - createExpressionReader() - 创建动态 reader
# - Schema 缓存管理
```

#### 交互式 Schema 查询工具

使用 `--interactive` 标志启动交互式 Schema 浏览器：

```bash
capnp-ts-codegen calculator.capnp --interactive
```

交互式命令：
- `inspect <type>` - 查看类型的详细信息
- `ids` - 列出所有类型 ID
- `export` - 导出 Schema 信息为 JSON
- `quit` - 退出

### Schema 缓存

Dynamic Schema 会自动缓存已获取的 Schema，避免重复网络请求：

```typescript
// 第一次调用会从远程获取
const schema1 = await connection.getDynamicSchema(0x1234567890abcdefn);

// 第二次调用会从缓存返回
const schema2 = await connection.getDynamicSchema(0x1234567890abcdefn);

// 手动清除缓存
connection.clearSchemaCache();

// 检查 Schema 是否在缓存中
const isCached = connection.hasCachedSchema(0x1234567890abcdefn);
```

### Schema Registry

Schema Registry 管理所有已加载的 Schema：

```typescript
// 获取 Registry
const registry = connection.getSchemaRegistry();

// 通过 ID 获取 Schema
const schema = registry.getNode(0x1234567890abcdefn);

// 通过名称获取 Schema
const schemaByName = registry.getNodeByName('myapp.Person');

// 手动注册 Schema
connection.registerSchema(customSchemaNode);
```

### 完整示例

参见 [examples/dynamic-schema-client.ts](../examples/dynamic-schema-client.ts) 获取完整示例。

## 当前状态汇总

| 功能 | 状态 |
|------|------|
| Level 0 RPC | ✅ 完成 |
| Level 1 Promise Pipelining | ✅ 完成 |
| Level 2 SturdyRefs | ✅ 完成 |
| Level 3 第三方握手 | ✅ 完成 |
| Level 4 Join 操作 | ✅ 完成 |
| WebSocket 传输 | ✅ 完成 |
| 代码生成 | ✅ 完成 |
| C++ 互操作 | ✅ 完成 |
| Phase 7 Dynamic Schema | ✅ 完成 |

**测试**: 420+ 测试通过

## 下一步计划

1. **性能优化** - 基准测试和优化
2. **更多传输层** - HTTP/2、TCP 原生支持
3. **持久化存储** - SturdyRefs 的持久化实现
