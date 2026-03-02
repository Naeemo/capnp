# Cap'n Proto RPC - Phase 2

Level 1 RPC Implementation: Promise Pipelining, capability passing, and complete message serialization.

## Overview

This module implements Level 1 features of Cap'n Proto RPC:

- **Promise Pipelining**: Make calls on results before they arrive
- **Capability Passing**: Send and receive capabilities in messages
- **Complete Serialization**: Full message serialization using MessageBuilder/MessageReader
- **Level 1 Messages**: Resolve, Release, Disembargo

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Application Layer                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐  │
│  │   Client    │  │   Server    │  │     PipelineClient          │  │
│  │   Code      │  │   Code      │  │     (Proxy)                 │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                  │
┌─────────────────────────────────────────────────────────────────────┐
│                          RPC System Layer                            │
│  ┌──────────────────────┐  ┌─────────────────────────────────────┐  │
│  │    RpcConnection     │  │    WebSocketTransport               │  │
│  │    - Four Tables     │  │    - Message framing                │  │
│  │    - Pipeline mgmt   │  │    - Binary transport               │  │
│  │    - Capability mgmt │  │    - Full serialization             │  │
│  └──────────────────────┘  └─────────────────────────────────────┘  │
│  ┌──────────────────────┐  ┌─────────────────────────────────────┐  │
│  │  Message Serializer  │  │    Pipeline Module                  │  │
│  │  - Serialize msgs    │  │    - PipelineClient                 │  │
│  │  - Deserialize msgs  │  │    - OpTracker                      │  │
│  │  - CapDescriptor     │  │    - Queued calls                   │  │
│  └──────────────────────┘  └─────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Promise Pipelining

Promise Pipelining is the key feature of Level 1 RPC. It allows making calls on
results that haven't arrived yet, dramatically reducing latency in distributed systems.

### Without Pipelining

```
Client                              Server
  |                                   |
  |--- getDatabase() --------------->|
  |                                   |
  |<-- Database capability -----------|
  |                                   |
  |--- query() ---------------------->|
  |                                   |
  |<-- Query result ------------------|
  |
  Total: 2 round trips
```

### With Pipelining

```
Client                              Server
  |                                   |
  |--- getDatabase() --------------->|
  |--- query() ---------------------->| (pipelined!)
  |                                   |
  |<-- Database capability -----------|
  |<-- Query result ------------------|
  |
  Total: 1 round trip
```

## Usage

### Promise Pipelining

```typescript
import { RpcConnection, WebSocketTransport } from '@naeemo/capnp';

// Connect to server
const transport = await WebSocketTransport.connect('ws://localhost:8080');
const conn = new RpcConnection(transport);
await conn.start();

// Get bootstrap capability
const bootstrap = await conn.bootstrap();

// Make a pipelined call - returns immediately
const databasePromise = await conn.callPipelined(
  bootstrap as number,
  BigInt('0x1234567890abcdef'), // Database interface ID
  0, // getDatabase method ID
  { content: new Uint8Array(), capTable: [] }
);

// Make calls on the result before it arrives!
const queryResult = await databasePromise.call(
  BigInt('0xfedcba0987654321'),
  1, // query method ID
  { content: new Uint8Array(), capTable: [] }
);

// Access nested fields
const table = databasePromise.getPointerField(0);
const tableResult = await table.call(interfaceId, methodId, params);
```

### Capability Management

```typescript
// Release a capability when done
await conn.release(importId, referenceCount);

// Resolve a promise to a capability
await conn.resolve(promiseId, { type: 'senderHosted', exportId: 5 });

// Resolve a promise to an exception
await conn.resolveException(promiseId, 'Something went wrong');
```

### Raw Message Serialization

```typescript
import { serializeRpcMessage, deserializeRpcMessage } from '@naeemo/capnp';

// Serialize a message
const message: RpcMessage = {
  type: 'call',
  call: {
    questionId: 1,
    target: { type: 'importedCap', importId: 5 },
    interfaceId: BigInt('0x1234567890abcdef'),
    methodId: 0,
    allowThirdPartyTailCall: false,
    noPromisePipelining: false,
    onlyPromisePipeline: false,
    params: { content: new Uint8Array(), capTable: [] },
    sendResultsTo: { type: 'caller' },
  },
};

const bytes = serializeRpcMessage(message);

// Deserialize a message
const received: RpcMessage = deserializeRpcMessage(bytes);
```

## The Four Tables (Enhanced)

### Question Table
Enhanced to support pipelined calls with `PromisedAnswer` targets.

### Answer Table
Tracks inbound calls and their resolution status.

### Import Table
Tracks capabilities received from remote. Supports promises.

### Export Table
Tracks capabilities sent to remote. Supports promises.

## Message Types (Level 1)

### Resolve
Indicate that a promise has resolved.

```typescript
{
  type: 'resolve',
  resolve: {
    promiseId: 10,
    resolution: {
      type: 'cap',
      cap: { type: 'senderHosted', exportId: 20 }
    }
  }
}
```

### Release
Release a capability reference.

```typescript
{
  type: 'release',
  release: {
    id: 5,
    referenceCount: 1
  }
}
```

### Disembargo
Lift an embargo on promise resolution.

```typescript
{
  type: 'disembargo',
  disembargo: {
    target: { type: 'importedCap', importId: 5 },
    context: { type: 'senderLoopback', embargoId: 100 }
  }
}
```

## API Reference

### PipelineClient

```typescript
interface PipelineClient {
  readonly questionId: QuestionId;
  readonly opTracker: PipelineOpTracker;

  // Make a pipelined call
  call(interfaceId: InterfaceId, methodId: MethodId, params: Payload): Promise<unknown>;

  // Get a field of the promised result
  getPointerField(fieldIndex: number): PipelineClient;
}
```

### RpcConnection (Phase 2 additions)

```typescript
class RpcConnection {
  // Make a call that returns a PipelineClient
  callPipelined(target, interfaceId, methodId, params): Promise<PipelineClient>;

  // Release a capability
  release(importId: ImportId, referenceCount: number): Promise<void>;

  // Resolve a promise
  resolve(promiseId: ExportId, cap: CapDescriptor): Promise<void>;

  // Resolve a promise to an exception
  resolveException(promiseId: ExportId, reason: string): Promise<void>;
}
```

## Testing

```bash
# Run all RPC tests
npm test -- src/rpc/

# Run specific test files
npm test -- src/rpc/pipeline.test.ts
npm test -- src/rpc/message-serializer.test.ts

# Run all tests
npm test
```

## Examples

See `examples/promise-pipelining.ts` for detailed usage examples.

## Progress

See `PHASE2_PROGRESS.md` for detailed implementation progress.

## Next Steps (Phase 3)

- Code generation for RPC Client classes
- Generate Server interfaces
- Method ID constants generation
- Full integration tests with C++ implementation
