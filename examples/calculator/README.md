# Calculator Example for RPC Interface Testing

This directory contains a simple calculator interface for testing the RPC code generation.

## Schema

```capnp
@0x1234567890abcdef;

interface Calculator {
  # A simple calculator interface for testing RPC code generation

  evaluate @0 (expression :Expression) -> (value :Float64);
  # Evaluate an expression and return the result

  getOperator @1 (op :Operator) -> (func :Function);
  # Get a function for a specific operator
}

struct Expression {
  union {
    literal @0 :Float64;
    call :group {
      function @1 :Function;
      params @2 :List(Expression);
    }
  }
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

## Generated Code

The generator will produce:

1. **Method Constants**:
   ```typescript
   export const CalculatorInterfaceId = 0x1234567890abcdefn;
   export const CalculatorMethodIds = {
     evaluate: 0,
     getOperator: 1,
   } as const;
   ```

2. **Server Interface**:
   ```typescript
   export interface CalculatorServer {
     evaluate(context: CallContext<Expression, EvaluateResults>): Promise<void>;
     getOperator(context: CallContext<GetOperatorParams, GetOperatorResults>): Promise<void>;
   }
   ```

3. **Client Class**:
   ```typescript
   export class CalculatorClient extends BaseCapabilityClient {
     evaluate(params: Expression): PipelineClient<EvaluateResults>;
     getOperator(params: GetOperatorParams): PipelineClient<GetOperatorResults>;
   }
   ```

## Usage

```typescript
import { RpcConnection, WebSocketTransport } from '@naeemo/capnp';
import { CalculatorClient } from './calculator.ts';

// Connect to server
const transport = await WebSocketTransport.connect('ws://localhost:8080');
const conn = new RpcConnection(transport);
await conn.start();

// Get calculator capability
const bootstrap = await conn.bootstrap();
const calculator = new CalculatorClient(bootstrap);

// Make a pipelined call
const result = await calculator.evaluate({ literal: 42 }).toPromise();
```
