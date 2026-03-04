# RPC Usage Guide

@naeemo/capnp implements the complete Cap'n Proto RPC protocol (Level 0-4), supporting everything from basic remote calls to advanced Promise Pipelining and three-party introductions.

## Basic Concepts

### Capability

Capability is the core concept of RPC, representing permission to call methods on a remote object. It's not the object itself, but the right to invoke methods on it.

```typescript
// Capability can be used like a local object
const result = await capability.someMethod(args);
```

### Transport Layer

Choose transport based on use case:

| Transport | Use Case | Characteristics |
|-----------|----------|-----------------|
| `EzRpcTransport` | Node.js ↔ C++ | Raw TCP, no length prefix |
| `WebSocketTransport` | Browser, Node.js | With length prefix, browser support |
| `TcpTransport` | Node.js internal | TCP with length prefix |

## Basic RPC

### Server Implementation

```typescript
import { RpcConnection, EzRpcTransport } from '@naeemo/capnp';
import { Calculator } from './calculator.js';  // Generated code

// Implement service interface
class CalculatorImpl implements Calculator.Server {
  async evaluate(params: { expression: Expression }): Promise<{ value: number }> {
    // Implement calculation logic
    return { value: this.compute(params.expression) };
  }
  
  private compute(expr: Expression): number {
    // ...
  }
}

// Start server
async function startServer() {
  const transport = await EzRpcTransport.connect('0.0.0.0', 8080);
  const connection = new RpcConnection(transport, {
    bootstrap: new CalculatorImpl()
  });
  await connection.start();
  console.log('Server started');
}
```

### Client Call

```typescript
import { EzRpcTransport, RpcConnection } from '@naeemo/capnp';
import { Calculator } from './calculator.js';

async function useClient() {
  // Connect to server
  const transport = await EzRpcTransport.connect('localhost', 8080);
  const connection = new RpcConnection(transport);
  await connection.start();
  
  // Get bootstrap capability
  const calculator = await connection.bootstrap().getAs(Calculator);
  
  // Call method
  const result = await calculator.evaluate({
    expression: { literal: 42 }
  });
  
  console.log(result.value); // 42
}
```

## Promise Pipelining

Promise Pipelining is a core feature of Cap'n Proto RPC, allowing the second call to be sent before receiving the result of the first call.

### Traditional RPC Problem

```typescript
// Traditional approach: 2 network round trips
const foo = await getFoo();      // Round trip 1
const bar = await foo.getBar();  // Round trip 2
const result = await bar.baz();  // Round trip 3
// Total: 3 round trips!
```

### Cap'n Proto Solution

```typescript
// Promise Pipelining: only 1 network round trip
const foo = getFoo();                    // Don't wait
const bar = foo.getBar();                // Call on returned promise
const result = await bar.baz();          // All calls merged into one round trip
// Total: 1 round trip!
```

### Practical Example

```typescript
// File system scenario
const directory = await connection.bootstrap().getAs(Directory);

// Chain calls, only one network round trip
const fileContent = await directory
  .open('documents')
  .open('report.txt')
  .read();
```

### How It Works

```typescript
// When calling a method on a promise, capnp-ts will:
// 1. Not wait for promise resolution
// 2. Immediately send second call, referencing first call's result
// 3. Server processes in order, returns all results at once

const promise1 = obj.method1();           // Send Call(questionId=1)
const promise2 = promise1.method2();      // Send Call(questionId=2, target=answer to 1)
const result = await promise2;            // Wait for Return for question 2
```

## Capability Passing

Capabilities can be passed as arguments to remote methods:

```typescript
// Server provides data capability
class DataProviderImpl implements DataProvider.Server {
  async getData() {
    return { data: 'some data' };
  }
}

// Client creates callback capability
class CallbackImpl implements Callback.Server {
  async onData(params: { data: string }) {
    console.log('Received:', params.data);
  }
}

// Usage
const provider = await connection.bootstrap().getAs(DataProvider);
const callback = new CallbackImpl();

// Pass callback capability to server
await provider.processWithCallback({ callback });
```

## SturdyRefs (Persistent Capabilities)

SturdyRefs allow Capabilities to persist after connection drops:

```typescript
import { SturdyRefManager } from '@naeemo/capnp';

// Create SturdyRefManager
const sturdyRefs = new SturdyRefManager({
  secretKey: 'your-secret-key',  // For signing
});

// Save capability
const token = await sturdyRefs.save(myCapability, {
  ttl: 3600,  // 1 hour validity
});
// token is a string, can be stored in database

// Restore capability
const restoredCapability = await sturdyRefs.restore(token);
// Same capability even after connection reconnects
```

## Level 3: Three-Party Introduction

Support for passing Capability between three parties:

```typescript
import { ConnectionManager } from '@naeemo/capnp';

const manager = new ConnectionManager({
  vatId: generateVatId(),
});

// Alice passes capability to Carol, through Bob
const carolId = await manager.introduce({
  provider: aliceConnection,
  recipient: carolId,
  capability: someCapability,
});
```

## Flow Control

### Stream API

```typescript
import { createStream } from '@naeemo/capnp';

const stream = createStream({
  direction: 'bidirectional',
  flowControl: {
    windowSize: 65536,    // 64KB window
  }
});

// Send data
for await (const chunk of stream) {
  await processChunk(chunk);
  stream.send(responseChunk);
}
```

### Bulk Transfer

```typescript
import { BulkTransferManager } from '@naeemo/capnp';

const bulk = createBulkTransferManager({
  chunkSize: 1024 * 1024,  // 1MB chunks
});

await bulk.upload({
  data: largeFileStream,
  onProgress: (progress) => {
    console.log(`${progress.percentage}%`);
  }
});
```

### Realtime Stream

```typescript
import { createRealtimeStreamManager, DropPolicy } from '@naeemo/capnp';

const realtime = createRealtimeStreamManager({
  policy: DropPolicy.oldest,  // Drop oldest data when exceeding window
  maxLatency: 100,            // 100ms max latency
});

// Suitable for audio/video streams
realtime.send(videoFrame);
```

## Error Handling

```typescript
try {
  const result = await capability.someMethod();
} catch (error) {
  if (error.type === 'disconnected') {
    // Connection dropped, may need to reconnect
  } else if (error.type === 'failed') {
    // Method execution failed
    console.error('Method failed:', error.reason);
  } else if (error.type === 'unimplemented') {
    // Server doesn't support this method
  }
}
```

## Best Practices

1. **Use Pipeline Early**: Don't `await` intermediate results, chain calls directly
2. **Limit Concurrency**: Be careful with server load when using `Promise.all()`
3. **Handle Disconnects**: Always listen to `onClose` events
4. **Use SturdyRefs**: Capabilities that need persistence should use SturdyRefs

```typescript
// Good: chain calls
const result = await obj.a().b().c();

// Avoid: unnecessary awaits
const a = await obj.a();
const b = await a.b();
const result = await b.c();
```

## Reference

- [Cap'n Proto RPC Protocol](https://capnproto.org/rpc.html)
- [Promise Pipelining Paper](http://www.erights.org/elib/distrib/pipeline.html)
- [API Reference - RPC](./api/rpc.md)
