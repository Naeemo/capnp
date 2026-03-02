# Phase 4: Level 3 RPC Implementation Progress

## Overview

Phase 4 implements Level 3 RPC (Three-way introductions), enabling capabilities to be passed between vats that don't have a direct connection. This allows automatic formation of direct connections between vats.

## Core Concept

Level 3 RPC enables the following scenario:
1. Alice (A) has connections to both Bob (B) and Carol (C)
2. Alice holds a capability to Carol's service
3. Alice sends Carol's reference to Bob
4. Bob automatically establishes a direct connection to Carol
5. Bob can now call Carol directly, without messages going through Alice

## Implementation Status

### ✅ Completed

#### 1. Protocol Extension (rpc.capnp)
- [x] Extended rpc.capnp with detailed Level 3 message types
- [x] Provide message: Offer capability to third party
- [x] Accept message: Accept capability from third party
- [x] Disembargo context extensions for Level 3 (accept/provide)
- [x] ThirdPartyCapId, RecipientId, ProvisionId types
- [x] Comprehensive protocol documentation

#### 2. Connection Manager
- [x] `ConnectionManager` class for managing multiple concurrent connections
- [x] Connection pooling and lifecycle management
- [x] Automatic connection establishment logic
- [x] Pending provision tracking
- [x] Third-party capability resolution
- [x] Vat ID generation and management
- [x] Provision ID generation

#### 3. Level 3 Message Handlers
- [x] `Level3Handlers` class for processing Level 3 messages
- [x] Provide message handling
- [x] Accept message handling
- [x] Third-party capability resolution
- [x] Embargo handling for cycle breaking
- [x] Disembargo message processing

#### 4. RpcConnection Updates
- [x] Integrated Level 3 message handling
- [x] Provide/Accept message routing
- [x] Third-party capability handling in return results
- [x] Support for `acceptFromThirdParty` return type
- [x] Internal methods for Level 3 operations

#### 5. Type Definitions
- [x] Extended rpc-types.ts with Level 3 types
- [x] Provide, Accept, Join message types
- [x] ThirdPartyCapId, RecipientId, ProvisionId
- [x] Updated CapDescriptor with thirdPartyHosted variant

#### 6. Tests
- [x] ConnectionManager unit tests
- [x] Level3Handlers unit tests
- [x] Three-way introduction scenario tests
- [x] Cycle breaking with embargo tests
- [x] Mock transport for testing

#### 7. Module Exports
- [x] Updated index.ts to export Level 3 modules
- [x] ConnectionManager and related types
- [x] Level3Handlers and related types

### 🔄 Partially Implemented

#### Message Serialization
- [x] Basic serialization structure for Provide/Accept
- [ ] Full serialization of ThirdPartyCapId content
- [ ] Full serialization of ProvisionId content
- [ ] Complete Payload serialization for Level 3 scenarios

### ⏳ Not Yet Implemented

#### Integration Tests
- [ ] Full three-node integration test
- [ ] WebSocket transport with multiple connections
- [ ] Interoperability with official C++ implementation

#### Advanced Features
- [ ] Connection address hints in ThirdPartyCapId
- [ ] Authentication in RecipientId
- [ ] Provision expiration and cleanup
- [ ] Connection health monitoring

## Architecture

### ConnectionManager

```
┌─────────────────────────────────────────────────────────────┐
│                    ConnectionManager                        │
├─────────────────────────────────────────────────────────────┤
│  connections: Map<vatId, ConnectionInfo>                    │
│  pendingProvisions: Map<provisionId, PendingProvision>      │
│  connectionPromises: Map<vatId, Promise<Connection>>        │
├─────────────────────────────────────────────────────────────┤
│  + registerConnection(vatId, connection)                    │
│  + getConnection(vatId): Promise<Connection>                │
│  + establishConnection(vatId, address?): Promise<Connection>│
│  + createPendingProvision(...): PendingProvision            │
│  + getPendingProvision(id): PendingProvision                │
│  + resolveThirdPartyCap(id): {connection, provisionId}      │
└─────────────────────────────────────────────────────────────┘
```

### Level3Handlers

```
┌─────────────────────────────────────────────────────────────┐
│                     Level3Handlers                          │
├─────────────────────────────────────────────────────────────┤
│  connection: RpcConnection                                  │
│  connectionManager: ConnectionManager                       │
│  selfVatId: VatId                                           │
│  pendingAccepts: Map<questionId, PendingAccept>             │
│  embargoedCalls: Map<embargoId, EmbargoedCall[]>            │
├─────────────────────────────────────────────────────────────┤
│  + handleProvide(provide): Promise<void>                    │
│  + handleAccept(accept): Promise<void>                      │
│  + handleDisembargo(disembargo): Promise<void>              │
│  + handleThirdPartyCapability(id): Promise<ImportId>        │
│  + createThirdPartyCapDescriptor(...): CapDescriptor        │
└─────────────────────────────────────────────────────────────┘
```

### Three-Way Introduction Flow

```
Alice (A)          Carol (C)          Bob (B)
   │                  │                  │
   │──── Provide ────▶│                  │
   │   (target: C's   │                  │
   │    capability,   │                  │
   │    recipient: B) │                  │
   │                  │                  │
   │◀─── Return ──────│                  │
   │   (provisionId)  │                  │
   │                  │                  │
   │                  │◄──── Accept ─────│
   │                  │   (provisionId)  │
   │                  │                  │
   │                  │──── Return ────▶│
   │                  │   (capability)   │
   │                  │                  │
   │                  │◄──── Call ───────│
   │                  │   (direct!)      │
   │                  │                  │
```

## Key Design Decisions

### 1. Vat ID Format
- 32-byte random identifiers
- Hex string encoding for Map keys
- Generated using crypto.getRandomValues or Node.js crypto

### 2. ThirdPartyCapId Format
- Concatenation of vat ID (32 bytes) + provision ID (32 bytes)
- Total 64 bytes
- Allows recipient to identify hosting vat and specific provision

### 3. Embargo Handling
- Used to break cycles in introduction graphs
- When embargo=true, Accept returns resultsSentElsewhere
- Disembargo messages lift the embargo
- Prevents deadlock in simultaneous introductions

### 4. Connection Management
- Lazy connection establishment
- Connection pooling with max limits
- Idle timeout for cleanup
- Auto-connect option for third-party capabilities

## Testing

### Unit Tests
```bash
npm test -- src/rpc/level3.test.ts
```

### Test Coverage
- ConnectionManager: Connection lifecycle, provision management
- Level3Handlers: Message handling, embargo logic
- Scenarios: Three-way introduction, cycle breaking

## Usage Example

```typescript
import {
  RpcConnection,
  ConnectionManager,
  Level3Handlers,
  generateVatId,
  WebSocketTransport,
} from '@naeemo/capnp';

// Create this vat's ID
const selfVatId = generateVatId();

// Create connection manager
const connectionManager = new ConnectionManager({
  selfVatId,
  connectionFactory: async (vatId, address) => {
    const ws = new WebSocket(address || getAddressForVat(vatId));
    return new WebSocketTransport(ws);
  },
  autoConnect: true,
});

// Create a connection to Carol
const carolTransport = new WebSocketTransport(carolWs);
const carolConnection = new RpcConnection(carolTransport, {
  selfVatId,
  connectionManager,
});

// Set up Level 3 handlers
const level3Handlers = new Level3Handlers({
  connection: carolConnection,
  connectionManager,
  selfVatId,
});
carolConnection.setLevel3Handlers(level3Handlers);

// Register the connection
connectionManager.registerConnection(carolVatId, carolConnection);

// Now when we receive a capability from Carol that is actually hosted by Bob,
// the connection manager will automatically establish a connection to Bob
```

## Next Steps (Phase 5)

Phase 5 will focus on:
1. **Flow Control (Bulk/Realtime API)**
   - Message prioritization
   - Backpressure handling
   - Drop policies for real-time scenarios

2. **UDP Transport**
   - Zero-roundtrip three-way handshake
   - Real-time communication support

3. **Encryption**
   - Noise Protocol integration
   - libsodium for cryptographic operations

## References

- [Cap'n Proto RPC Protocol](https://capnproto.org/rpc.html)
- [CapTP: The Four Tables](http://www.erights.org/elib/distrib/captp/4tables.html)
- [rpc.capnp schema](https://github.com/capnproto/capnproto/blob/master/c++/src/capnp/rpc.capnp)
