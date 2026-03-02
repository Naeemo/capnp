# C++ Interop Tests

This directory contains tests for verifying capnp-ts RPC implementation compatibility with the official Cap'n Proto C++ implementation.

## Overview

The goal is to ensure that capnp-ts can communicate correctly with C++ Cap'n Proto servers and clients over the network.

## Prerequisites

- Cap'n Proto C++ tools (`capnp`, `capnpc-c++`)
- Cap'n Proto C++ development libraries (`libcapnp-dev`)
- C++ compiler with C++17 support

## Installation

```bash
# Install Cap'n Proto development libraries (Ubuntu/Debian)
sudo apt-get update
sudo apt-get install -y libcapnp-dev

# Verify installation
capnp --version
which capnpc-c++
```

## Building

```bash
cd src/interop-cpp
make
```

This will:
1. Compile `interop.capnp` schema to C++ code
2. Compile the C++ server/client binary

## Running Tests

### 1. Start the C++ Server

```bash
./interop-server server 0.0.0.0:8080
```

### 2. Test with C++ Client

```bash
./interop-server client localhost:8080
```

### 3. Test with TypeScript Client

```bash
# From project root
pnpm test src/interop-cpp/interop.test.ts
```

## Test Coverage

### Basic RPC
- [x] Bootstrap handshake
- [x] Call/Return message exchange
- [x] Message serialization/deserialization

### Data Types
- [x] Primitive types (int, float, bool)
- [x] Text and Data fields
- [x] Struct fields
- [x] List fields
- [x] Union fields

### Advanced Features
- [ ] Promise Pipelining
- [ ] Capability passing
- [ ] Three-party handoff (Level 3)

## Architecture

```
┌─────────────────┐         ┌─────────────────┐
│  TypeScript     │  WebSocket │  C++ Server    │
│  Client         │◄────────►│  (interop-server)│
│  (capnp-ts)     │           │                 │
└─────────────────┘         └─────────────────┘
```

## Schema

The `interop.capnp` schema defines the interfaces used for testing:

- `EchoService` - Basic echo operations
- `Calculator` - Mathematical operations
- `Database` - Database operations with capability passing
- `PromiseTester` - Promise pipelining tests

## Troubleshooting

### Connection Refused
- Ensure the C++ server is running
- Check firewall settings
- Verify the port is correct

### Compilation Errors
- Ensure `libcapnp-dev` is installed
- Check C++ compiler version (`g++ --version`)

### Message Parsing Errors
- Check that both sides use the same schema
- Verify message framing is correct

## Future Work

- [ ] WebSocket support in C++ server
- [ ] More comprehensive test cases
- [ ] Performance benchmarks
- [ ] TLS/SSL support
