# Cap'n Proto RPC - Phase 4

Level 3 RPC Implementation: Three-way introductions for multi-vat direct connections.

## Overview

This module implements Level 3 features of Cap'n Proto RPC:

- **Three-way Introductions**: Pass capabilities between vats without direct connections
- **Connection Manager**: Manage multiple concurrent connections
- **Automatic Connection Establishment**: Automatically connect to third parties
- **Embargo Handling**: Break cycles in introduction graphs
- **Provide/Accept Messages**: Protocol for capability handoff

## Core Concept

Level 3 RPC enables the following scenario:

```
Alice (A) has connections to both Bob (B) and Carol (C)
Alice holds a capability to Carol's service
Alice sends Carol's reference to Bob
Bob automatically establishes a direct connection to Carol
Bob can now call Carol directly, without messages going through Alice
```

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
│  │    RpcConnection     │  │    ConnectionManager (NEW)          │  │
│  │    - Four Tables     │  │    - Multi-vat connections          │  │
│  │    - Pipeline mgmt   │  │    - Connection pooling             │  │
│  │    - Capability mgmt │  │    - Provision tracking             │  │
│  └──────────────────────┘  └─────────────────────────────────────┘  │
│  ┌──────────────────────┐  ┌─────────────────────────────────────┐  │
│  │  Level3Handlers      │  │    WebSocketTransport               │  │
│  │  - Provide handling  │  │    - Message framing                │  │
│  │  - Accept handling   │  │    - Binary transport               │  │
│  │  - Embargo mgmt      │  │    - Full serialization             │  │
│  └──────────────────────┘  └─────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Three-way Introduction Flow

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

## Usage

### Connection Manager

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
  maxConnections: 100,
  idleTimeoutMs: 300000, // 5 minutes
});

// Register a connection
const transport = new WebSocketTransport(ws);
const connection = new RpcConnection(transport, {
  selfVatId,
  connectionManager,
});

connectionManager.registerConnection(remoteVatId, connection);

// Get or establish connection to a vat
const conn = await connectionManager.getConnection(targetVatId);
```

### Level 3 Handlers

```typescript
// Set up Level 3 handlers
const level3Handlers = new Level3Handlers({
  connection,
  connectionManager,
  selfVatId,
  onProvide: async (provide) => {
    console.log('Received Provide:', provide);
  },
  onAccept: async (accept) => {
    console.log('Received Accept:', accept);
  },
});

connection.setLevel3Handlers(level3Handlers);
```

### Creating Third-Party Capabilities

```typescript
import { createThirdPartyCapId, generateProvisionId } from '@naeemo/capnp';

// When Alice wants to introduce Bob to Carol's capability:

// 1. Create a provision ID
const provisionId = generateProvisionId();

// 2. Create a pending provision
connectionManager.createPendingProvision(
  provisionId,
  bobVatId,      // Recipient
  carolExportId, // The capability to provide
  questionId,
  false          // Not embargoed
);

// 3. Create ThirdPartyCapId
const thirdPartyCapId = createThirdPartyCapId(carolVatId, provisionId);

// 4. Send to Bob (embedded in a CapDescriptor)
const capDescriptor: CapDescriptor = {
  type: 'thirdPartyHosted',
  thirdPartyCapId,
};
```

### Resolving Third-Party Capabilities

```typescript
// When Bob receives a third-party capability:

// The connection manager automatically resolves it
const resolved = await connectionManager.resolveThirdPartyCap(thirdPartyCapId);

if (resolved) {
  const { connection, provisionId } = resolved;
  
  // Send Accept to pick up the capability
  const importId = await level3Handlers.sendAccept(
    connection,
    provisionId,
    false // Not embargoed
  );
  
  // Now use the capability directly
  const result = await connection.call(importId, interfaceId, methodId, params);
}
```

### Cycle Breaking with Embargo

```typescript
// When Alice introduces Bob to Carol AND Carol to Bob simultaneously,
// use embargo to prevent deadlock:

// Provision for Bob (to access Carol)
connectionManager.createPendingProvision(
  provisionForBob,
  bobVatId,
  carolExportId,
  questionId1,
  true // Embargoed!
);

// Provision for Carol (to access Bob)
connectionManager.createPendingProvision(
  provisionForCarol,
  carolVatId,
  bobExportId,
  questionId2,
  true // Embargoed!
);

// When Bob and Carol Accept, they get resultsSentElsewhere
// The embargoes are lifted once direct connections are established
```

## API Reference

### ConnectionManager

```typescript
class ConnectionManager {
  constructor(options: ConnectionManagerOptions);

  // Connection management
  registerConnection(vatId: VatId, connection: RpcConnection): ConnectionInfo;
  getConnection(vatId: VatId): Promise<RpcConnection | undefined>;
  establishConnection(vatId: VatId, address?: string): Promise<RpcConnection>;
  closeConnection(vatId: VatId): Promise<void>;
  closeAll(): Promise<void>;

  // Provision management
  createPendingProvision(...): PendingProvision;
  getPendingProvision(provisionId: ProvisionId): PendingProvision | undefined;
  removePendingProvision(provisionId: ProvisionId): boolean;
  findProvisionsForRecipient(recipientId: VatId): PendingProvision[];

  // Third-party resolution
  resolveThirdPartyCap(thirdPartyCapId: ThirdPartyCapId): Promise<{
    connection: RpcConnection;
    provisionId: ProvisionId;
  } | undefined>;

  // Utilities
  getAllConnections(): ConnectionInfo[];
  getConnectionCount(): number;
  hasConnection(vatId: VatId): boolean;
}
```

### Level3Handlers

```typescript
class Level3Handlers {
  constructor(options: Level3HandlersOptions);

  // Message handlers
  handleProvide(provide: Provide): Promise<void>;
  handleAccept(accept: Accept): Promise<void>;
  handleDisembargo(disembargo: Disembargo): Promise<void>;

  // Capability handling
  handleThirdPartyCapability(thirdPartyCapId: ThirdPartyCapId): Promise<ImportId | undefined>;
  createThirdPartyCapDescriptor(
    hostedConnection: RpcConnection,
    exportId: ExportId,
    recipientVatId: VatId
  ): CapDescriptor;

  // Sending
  sendProvide(target: MessageTarget, recipient: RecipientId): Promise<{...}>;
  sendAccept(targetConnection: RpcConnection, provision: ProvisionId, embargo: boolean): Promise<ImportId>;
}
```

### Utility Functions

```typescript
// Generate unique IDs
function generateVatId(): VatId;
function generateProvisionId(): ProvisionId;

// Create IDs from components
function createThirdPartyCapId(vatId: VatId, provisionId: ProvisionId): ThirdPartyCapId;
function createRecipientId(vatId: VatId): RecipientId;
function createProvisionId(id: Uint8Array): ProvisionId;
```

## Message Types (Level 3)

### Provide

Offer a capability to a third party:

```typescript
{
  type: 'provide',
  provide: {
    questionId: 10,
    target: { type: 'importedCap', importId: 5 },
    recipient: { id: Uint8Array } // Bob's vat ID
  }
}
```

### Accept

Accept a capability from a third party:

```typescript
{
  type: 'accept',
  accept: {
    questionId: 20,
    provision: { id: Uint8Array },
    embargo: false
  }
}
```

### Disembargo (Level 3 contexts)

Lift embargo on third-party capabilities:

```typescript
{
  type: 'disembargo',
  disembargo: {
    target: { type: 'importedCap', importId: 5 },
    context: { type: 'accept' } // or { type: 'provide', questionId: 10 }
  }
}
```

## Testing

```bash
# Run Level 3 tests
npm test -- src/rpc/level3.test.ts

# Run all RPC tests
npm test -- src/rpc/

# Run all tests
npm test
```

## Examples

See `examples/level3-intro.ts` for detailed usage examples.

## Progress

See `PHASE4_PROGRESS.md` for detailed implementation progress.

## Next Steps (Phase 5)

- **Flow Control (Bulk/Realtime API)**: Message prioritization, backpressure, drop policies
- **UDP Transport**: Zero-roundtrip handshake, real-time communication
- **Encryption**: Noise Protocol integration
