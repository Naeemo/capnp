# C++ Interop Test Progress Report

## Date: 2026-03-03

## Summary

Successfully implemented TCP transport layer for direct communication between capnp-ts and C++ Cap'n Proto implementation.

## Completed Work

### 1. TCP Transport Implementation ✓

Created `src/rpc/tcp-transport.ts`:
- Length-prefixed binary message framing (compatible with C++ implementation)
- Node.js net.Socket based transport
- Full RpcTransport interface implementation
- Proper error handling and connection management

```typescript
import { TcpTransport } from '@naeemo/capnp';

const transport = await TcpTransport.connect('localhost', 8080);
const connection = new RpcConnection(transport);
```

### 2. Updated RPC Module Exports ✓

Added TcpTransport to `src/rpc/index.ts` exports for public API access.

### 3. Improved Interop Tests ✓

Updated `src/interop-cpp/interop.test.ts`:
- Uses TCP transport instead of WebSocket
- Tests basic message serialization/deserialization
- Tests error handling
- Structured for incremental expansion

### 4. Test Infrastructure ✓

The existing `test-interop.sh` provides:
- Automated C++ server build and startup
- C++ client-to-server verification
- TypeScript serialization tests
- Full test orchestration

## Current Issue: Message Format Compatibility

**Status**: 🐛 Investigating

**Problem**: C++ EzRpc server does not respond to TypeScript Bootstrap messages, but works fine with C++ client.

**Observations**:
1. TCP connection establishes successfully
2. TypeScript can serialize/deserialize RPC messages correctly (verified via round-trip tests)
3. C++ client can communicate with C++ server successfully
4. TypeScript messages are sent but C++ server does not respond (connection eventually times out)

**Hypotheses**:
1. EzRpc may use additional transport-layer wrapping not documented in public specs
2. KJ async I/O may require specific message framing
3. There may be a version mismatch in RPC protocol

**Next Steps**:
1. Capture network traffic between C++ client and server to analyze message format
2. Compare hex dumps of C++ vs TypeScript serialized messages
3. Review EzRpc/KJ source code for transport implementation details

### Pending (Requires Struct Encoding)
- [ ] EchoService.echo with Text parameter
- [ ] EchoService.echoStruct with struct parameter
- [ ] EchoService.getCounter/increment
- [ ] Calculator interface
- [ ] Database/Table interfaces
- [ ] PromiseTester/InnerCapability

## Architecture

```
┌─────────────────┐         TCP Socket          ┌─────────────────┐
│  TypeScript     │  [length][message data]  │  C++ Server     │
│  Client         │◄────────────────────────►│  (EzRpcServer)  │
│  (capnp-ts)     │                           │                 │
└─────────────────┘                           └─────────────────┘
```

## Running Tests

### Prerequisites
```bash
# Install Cap'n Proto C++ libraries (Ubuntu/Debian)
sudo apt-get update
sudo apt-get install -y libcapnp-dev

# Verify installation
capnp --version
```

### Automated Test Script
```bash
cd src/interop-cpp
./test-interop.sh
```

### Manual Testing
```bash
# Terminal 1: Start C++ server
cd src/interop-cpp
./interop-server server 0.0.0.0:8080

# Terminal 2: Run TypeScript tests
npm test src/interop-cpp/interop.test.ts
```

## Next Steps

### Phase 1: Basic RPC (Current)
- [x] TCP transport working
- [ ] Complete struct encoding for method parameters
- [ ] Echo service fully functional

### Phase 2: Full Interface Tests
- [ ] All EchoService methods
- [ ] Calculator operations
- [ ] Database/Table capability passing

### Phase 3: Advanced Features
- [ ] Promise Pipelining tests
- [ ] Capability passing between TS and C++
- [ ] SturdyRefs persistence

### Phase 4: Performance
- [ ] Throughput benchmarks
- [ ] Latency measurements
- [ ] Comparison with C++-to-C++ performance

## Files

```
src/interop-cpp/
├── README.md              # Documentation
├── PROGRESS.md            # This file
├── interop.capnp          # Test schema
├── interop-server.cpp     # C++ implementation
├── interop-server         # Compiled binary
├── interop.test.ts        # TypeScript tests
├── test-interop.sh        # Automated test script
└── Makefile               # Build automation

src/rpc/
├── tcp-transport.ts       # NEW: TCP transport implementation
├── websocket-transport.ts # WebSocket transport
└── transport.ts           # Transport interface
```

## Known Limitations

1. **Struct Encoding**: Current tests send empty parameters. Full method calls require proper Cap'n Proto struct encoding for parameters.

2. **Single Interface**: C++ server currently only implements EchoService. Calculator and Database interfaces are defined but not implemented.

3. **No Promise Pipelining Tests**: C++ server doesn't implement PromiseTester interface yet.

## References

- [TCP Transport](../../src/rpc/tcp-transport.ts)
- [Interop Tests](../../src/interop-cpp/interop.test.ts)
- [Official C++ RPC](https://capnproto.org/cxxrpc.html)
