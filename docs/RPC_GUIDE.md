# Cap'n Proto RPC 使用指南

## 简介

@naeemo/capnp 提供完整的 Cap'n Proto RPC 实现，支持 Level 0-2 功能：

- **Level 0**: 基础 RPC (Bootstrap, Call/Return/Finish)
- **Level 1**: Promise Pipelining, Capability 传递
- **Level 2**: SturdyRefs (持久化能力引用)

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

## 当前状态汇总

| 功能 | 状态 |
|------|------|
| Level 0 RPC | ✅ 完成 |
| Level 1 Promise Pipelining | ✅ 完成 |
| Level 2 SturdyRefs | ✅ 完成 |
| WebSocket 传输 | ✅ 完成 |
| 代码生成 | ✅ 完成 |
| C++ 互操作 | ✅ 完成 |

**测试**: 250+ 测试通过

## 下一步计划

1. **文档完善** - 添加更多示例和教程
2. **Level 3/4** - 第三方握手 (Provide/Accept) 和 Join 操作（按需）
3. **性能优化** - 基准测试和优化
4. **更多传输层** - HTTP/2、TCP 原生支持
