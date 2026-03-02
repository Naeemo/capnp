# Cap'n Proto RPC Phase 2 Progress

## Overview
Phase 2 implements Level 1 RPC features: Promise Pipelining, capability passing, and complete message serialization.

## Completed Tasks

### 1. Message Serialization (Week 1) ✅

**Files Created:**
- `src/rpc/message-serializer.ts` - Full RPC message serialization/deserialization
- `src/rpc/message-serializer.test.ts` - Comprehensive tests

**Features Implemented:**
- Serialize/deserialize all RPC message types:
  - Bootstrap, Call, Return, Finish
  - Resolve, Release, Disembargo
  - Provide, Accept, Join
  - Abort, Unimplemented
- Support for nested structures:
  - MessageTarget (importedCap, promisedAnswer)
  - Payload with capTable
  - CapDescriptor (all variants)
  - PromisedAnswer with transform operations
  - Exception with union type
- All tests passing (9/9)

### 2. Promise Pipelining (Week 2) ✅

**Files Created:**
- `src/rpc/pipeline.ts` - Core pipelining implementation
- `src/rpc/pipeline.test.ts` - Comprehensive tests

**Features Implemented:**
- `PipelineClient` interface for promised answers
- `PipelineOpTracker` for transform chain management
- `createPipelineClient()` using JavaScript Proxy
- `isPipelineClient()` type guard
- `QueuedCallManager` for delayed call execution
- `PipelineResolutionTracker` for tracking promise resolutions
- Integration with `RpcConnection`:
  - `callPipelined()` method for pipelined calls
  - Support for PipelineClient as call target
  - Proper question/answer lifecycle management

**API Usage:**
```typescript
// Make a pipelined call
const pipelineClient = await connection.callPipelined(
  targetId,
  interfaceId,
  methodId,
  params
);

// Make calls on the result before it arrives
const fieldClient = pipelineClient.getPointerField(0);
const result = await fieldClient.call(anotherInterfaceId, anotherMethodId, params);
```

All tests passing (17/17)

### 3. Capability Passing (Week 3) ✅

**Files Modified:**
- `src/rpc/rpc-connection.ts` - Enhanced with Level 1 features
- `src/rpc/four-tables.ts` - Already had basic support

**Features Implemented:**
- CapDescriptor encoding/decoding in serializer
- Payload capTable handling
- All CapDescriptor variants:
  - `none` - Null capability
  - `senderHosted` - Capability hosted by sender
  - `senderPromise` - Promise for sender-hosted capability
  - `receiverHosted` - Capability hosted by receiver
  - `receiverAnswer` - Capability from promised answer
  - `thirdPartyHosted` - Level 3 capability
- RpcConnection methods:
  - `release()` - Send Release message
  - `resolve()` - Send Resolve message for promises
  - `resolveException()` - Send Resolve with exception
  - `importCapability()` - Add to import table
  - `exportCapability()` - Add to export table
- Message handlers:
  - `handleResolve()` - Process promise resolution
  - `handleRelease()` - Process capability release
  - `handleDisembargo()` - Process embargo lift

### 4. Integration ✅

**Files Modified:**
- `src/rpc/websocket-transport.ts` - Now uses real serialization
- `src/rpc/index.ts` - Exports new modules

**Changes:**
- WebSocket transport now uses `serializeRpcMessage()` and `deserializeRpcMessage()`
- All new types and functions exported from index

## Test Results

```
✓ src/rpc/pipeline.test.ts (17 tests)
✓ src/rpc/rpc.test.ts (16 tests)
✓ src/rpc/message-serializer.test.ts (9 tests)
✓ src/rpc/echo.test.ts (4 tests)

Test Files: 4 passed
Tests: 46 passed
```

## Architecture

### Promise Pipelining Flow

```
Client                              Server
  |                                   |
  |--- Call (questionId=1) --------->|
  |                                   |
  |<-- Return (answerId=1, cap) -----|
  |                                   |
  |--- Call (questionId=2, --------->|
  |    target=promisedAnswer{        |
  |      questionId=1,               |
  |      transform=[getPointer(0)]   |
  |    })                            |
  |                                   |
  |<-- Return (answerId=2) ----------|
```

### Key Components

1. **PipelineClient**: Proxy object representing a promised answer
2. **PipelineOpTracker**: Builds transform chains (field access operations)
3. **QueuedCallManager**: Manages calls made before promise resolution
4. **PipelineResolutionTracker**: Tracks which promises have resolved

## Next Steps (Phase 3)

1. **Code Generation**
   - Extend V3 generator to create RPC Client classes
   - Generate Server interfaces
   - Generate method ID constants

2. **Integration Tests**
   - Real WebSocket integration tests
   - Echo service full implementation
   - Interoperability tests with C++ implementation

3. **Performance Optimization**
   - Multi-segment message support
   - Zero-copy optimizations
   - Memory pool for frequent allocations

## References

- [Cap'n Proto RPC Protocol](https://capnproto.org/rpc.html)
- [rpc.capnp schema](src/rpc/rpc.capnp)
- [CapTP Four Tables](http://www.erights.org/elib/distrib/captp/4tables.html)
