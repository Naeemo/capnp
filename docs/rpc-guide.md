# Cap'n Proto RPC Usage Guide

## Introduction

@naeemo/capnp provides complete Cap'n Proto RPC implementation, supporting Level 0-4 features:

- **Level 0**: Basic RPC (Bootstrap, Call/Return/Finish)
- **Level 1**: Promise Pipelining, Capability passing
- **Level 2**: SturdyRefs (persistent capability references)
- **Level 3**: Three-party introductions (Provide/Accept)
- **Level 4**: Join operations (reference equality verification)
- **Phase 7**: Dynamic Schema (dynamic schema retrieval)

## Quick Start

### 1. Define Interface

Create `.capnp` file to define your service interface:

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

### 2. Generate Code

Use CLI to generate TypeScript code:

```bash
npx capnp-ts-codegen calculator.capnp -o calculator.ts
```

Generated code includes:
- `CalculatorInterfaceId` - Interface ID constant
- `CalculatorMethodIds` - Method ID constants
- `CalculatorServer` - Server interface
- `CalculatorStub` - Server stub (method dispatch)
- `CalculatorClient` - Client class (with Promise Pipelining support)

### 3. Implement Server

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
    params: EvaluateParamsReader,
    context: CallContext
  ): Promise<EvaluateResultsBuilder> {
    const expression = params.getExpression();
    const value = this.computeExpression(expression);
    
    const results = new EvaluateResultsBuilder();
    results.setValue(value);
    return results;
  }
  
  async getOperator(
    params: GetOperatorParamsReader
  ): Promise<GetOperatorResultsBuilder> {
    const op = params.getOp();
    const func = this.createOperatorFunction(op);
    
    const results = new GetOperatorResultsBuilder();
    results.setFunc(func);
    return results;
  }
  
  private computeExpression(expr: ExpressionReader): number {
    // Implementation...
  }
  
  private createOperatorFunction(op: Operator): Function {
    // Implementation...
  }
}

// Start server
async function startServer() {
  const transport = new WebSocketTransport({ port: 8080 });
  const impl = new CalculatorImpl();
  const stub = new CalculatorStub(impl);
  
  const connection = new RpcConnection(transport, {
    bootstrap: stub
  });
  
  await connection.start();
  console.log('Calculator server started on port 8080');
}
```

### 4. Create Client

```typescript
import { RpcConnection, WebSocketTransport } from '@naeemo/capnp';
import { CalculatorClient } from './calculator.js';

async function main() {
  // Connect to server
  const transport = new WebSocketTransport('ws://localhost:8080');
  const connection = new RpcConnection(transport);
  await connection.start();
  
  // Get bootstrap capability
  const calculator = new CalculatorClient(connection.bootstrap());
  
  // Call method
  const result = await calculator.evaluate({
    expression: { literal: 42 }
  });
  
  console.log('Result:', result.value); // 42
}
```

## Core Concepts

### Capability

Capability is the core concept of Cap'n Proto RPC - it's the right to call methods on a remote object.

```typescript
// Capability can be used like a local object
const result = await capability.someMethod(args);
```

### Promise Pipelining

Cap'n Proto's killer feature - make multiple calls in one network round trip:

```typescript
// Traditional RPC: 3 round trips
const user = await db.getUser({ id: 1 });
const orders = await user.getOrders();
const items = await orders.getItems();

// Cap'n Proto: 1 round trip
const items = await db
  .getUser({ id: 1 })
  .getOrders()
  .getItems();
```

### SturdyRefs

Persistent capability references that survive connection drops:

```typescript
import { SturdyRefManager } from '@naeemo/capnp';

const manager = new SturdyRefManager({
  secretKey: 'your-secret-key'
});

// Save capability
const token = await manager.save(myCapability, { ttl: 3600 });
// Store token in database...

// Later, restore capability
const restored = await manager.restore(token);
// Same capability, even after reconnect
```

## Advanced Features

### Level 3: Three-Party Introduction

Allow capabilities to be passed between three parties:

```typescript
import { ConnectionManager } from '@naeemo/capnp';

const manager = new ConnectionManager({
  vatId: generateVatId()
});

// Alice passes capability to Carol through Bob
await manager.introduce({
  provider: aliceConnection,
  recipient: carolConnection,
  capability: someCapability
});
```

### Level 4: Join

Verify that two capabilities point to the same object:

```typescript
const isSame = await connection.join([cap1, cap2]);
if (isSame) {
  console.log('Same object');
}
```

### Dynamic Schema

Retrieve schema information at runtime:

```typescript
const schema = await connection.getDynamicSchema({
  typeName: 'calculator.Calculator'
});

// Use dynamic reader/writer
const writer = createDynamicWriter(schema);
writer.set('operand1', 10);
writer.set('operand2', 20);
```

## Best Practices

### 1. Use Promise Pipelining

```typescript
// ✅ Good: Chain calls
const result = await service
  .getA()
  .getB()
  .getC();

// ❌ Bad: Sequential awaits
const a = await service.getA();
const b = await a.getB();
const result = await b.getC();
```

### 2. Handle Errors

```typescript
try {
  const result = await capability.method();
} catch (error) {
  switch (error.type) {
    case 'disconnected':
      await reconnect();
      break;
    case 'failed':
      console.error('Method failed:', error.reason);
      break;
  }
}
```

### 3. Clean Up Resources

```typescript
const connection = new RpcConnection(transport);
try {
  await connection.start();
  // ... use connection
} finally {
  await connection.stop();
}
```

## Reference

- [Full RPC Guide](./guides/rpc.md)
- [Dynamic Schema Guide](./guides/dynamic-schema.md)
- [Cap'n Proto RPC Spec](https://capnproto.org/rpc.html)
