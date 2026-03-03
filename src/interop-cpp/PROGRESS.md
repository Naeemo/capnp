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

## Test Coverage

### Transport Layer
- [x] TCP connection establishment
- [x] Length-prefixed message framing
- [x] Message serialization round-trip
- [x] Error handling
- [x] Connection cleanup

### RPC Protocol (Basic)
- [x] Bootstrap handshake
- [x] Call message encoding
- [x] Response message decoding
- [x] Error response handling

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
