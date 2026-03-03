# Cap'n Proto RPC - Phase 7: Dynamic Schema Transfer Protocol

Dynamic Schema Transfer Protocol: Runtime schema discovery and dynamic message reading/writing.

## Overview

This module implements Phase 7 features of Cap'n Proto RPC:

- **Dynamic Schema Types**: TypeScript definitions for schema metadata
- **Schema Parser**: Runtime parsing of schema binary data
- **Schema Serializer**: Serialization/deserialization of schema RPC messages
- **Dynamic Reader**: Runtime message reading without compile-time code generation
- **Dynamic Writer**: Runtime message writing without compile-time code generation
- **Schema Capability**: RPC interface for fetching schema from remote vats

## Features

### 1. Schema Types (`schema-types.ts`)

Complete TypeScript definitions for schema metadata:

```typescript
import type { SchemaNode, SchemaField, SchemaType } from '@naeemo/capnp';

const schema: SchemaNode = {
  id: BigInt("0x1234567890abcdef"),
  displayName: "myapp.Person",
  type: SchemaNodeType.STRUCT,
  structInfo: {
    dataWordCount: 2,
    pointerCount: 2,
    fields: [
      { name: "name", offset: 0, type: { kind: { type: "text" } }, ... },
      { name: "age", offset: 32, type: { kind: { type: "uint32" } }, ... },
    ],
  },
};
```

### 2. Schema Parser (`schema-parser.ts`)

Parse schema binary data into SchemaNode objects:

```typescript
import { parseSchemaNodes, createSchemaRegistry } from '@naeemo/capnp';

// Parse schema from binary data
const nodes = parseSchemaNodes(schemaBinaryData);

// Create a registry for managing schemas
const registry = createSchemaRegistry();
for (const node of nodes) {
  registry.registerNode(node);
}

// Look up schemas
const personSchema = registry.getNodeByName("myapp.Person");
```

### 3. Dynamic Reader (`dynamic-reader.ts`)

Read Cap'n Proto messages at runtime using schema information:

```typescript
import { createDynamicReader, dumpDynamicReader } from '@naeemo/capnp';

// Create a dynamic reader from schema and buffer
const reader = createDynamicReader(schema, messageBuffer);

// Access fields by name
const name = reader.get("name") as string;
const age = reader.get("age") as number;

// Get all field names
const fields = reader.getFieldNames();

// Dump all fields for debugging
const dump = dumpDynamicReader(reader);
console.log(dump); // { name: "Alice", age: 30, ... }
```

### 4. Dynamic Writer (`dynamic-writer.ts`)

Write Cap'n Proto messages at runtime using schema information:

```typescript
import { createDynamicWriter, serializeDynamic } from '@naeemo/capnp';

// Create a dynamic writer
const writer = createDynamicWriter(schema);

// Set fields by name
writer.set("name", "Alice");
writer.set("age", 30);
writer.setText("email", "alice@example.com");

// Set multiple fields at once
writer.setFields({
  name: "Bob",
  age: 25,
});

// Initialize and set list fields
const listWriter = writer.initList("tags", 3);
listWriter.setAll(["developer", "typescript", "capnp"]);

// Serialize to buffer
const buffer = writer.toBuffer();
```

### 5. Schema Capability (`schema-capability.ts`)

RPC interface for fetching schema from remote vats:

```typescript
import { 
  SchemaCapabilityServer, 
  SchemaCapabilityClient 
} from '@naeemo/capnp';

// Server-side: Serve schemas to clients
const registry = new Map<bigint, SchemaNode>();
registry.set(schema.id, schema);

const server = new SchemaCapabilityServer(registry);
connection.registerSchemaProvider(server);

// Client-side: Fetch schemas from server
const client = new SchemaCapabilityClient(connection);

// Fetch by type ID
const schema = await client.getSchemaById(BigInt("0x1234567890abcdef"));

// Fetch by type name
const schemaByName = await client.getSchemaByName("myapp.Person");

// List all available schemas
const schemas = await client.listAvailableSchemas();
```

### 6. RpcConnection Integration (`rpc-connection.ts`)

Built-in schema fetching and caching:

```typescript
import { RpcConnection } from '@naeemo/capnp';

const connection = new RpcConnection(transport);

// Fetch schema from remote (with caching)
const schema = await connection.getDynamicSchema(BigInt("0x1234567890abcdef"));

// Fetch by name
const schemaByName = await connection.getDynamicSchemaByName("myapp.Person");

// Check if schema is cached
if (connection.hasCachedSchema(typeId)) {
  console.log("Schema is cached");
}

// Clear cache if needed
connection.clearSchemaCache();

// Get the schema registry
const registry = connection.getSchemaRegistry();
```

## Supported Types

### Primitive Types
- `void` - No data
- `bool` - Boolean
- `int8`, `int16`, `int32`, `int64` - Signed integers
- `uint8`, `uint16`, `uint32`, `uint64` - Unsigned integers
- `float32`, `float64` - Floating point
- `text` - UTF-8 string
- `data` - Raw bytes

### Complex Types
- `list<T>` - Lists of any type
- `struct` - Nested structures
- `enum` - Enumerations (stored as uint16)
- `interface` - Capabilities (limited support)
- `union` - Discriminated unions

## Usage Examples

### Complete E2E Example

```typescript
import { 
  RpcConnection, 
  createDynamicWriter, 
  createDynamicReader,
  SchemaCapabilityServer,
  SchemaCapabilityClient,
} from '@naeemo/capnp';

// Define schema (normally fetched from server)
const personSchema: SchemaNode = {
  id: BigInt("0x1234567890abcdef"),
  displayName: "example.Person",
  type: SchemaNodeType.STRUCT,
  structInfo: {
    dataWordCount: 1,
    pointerCount: 2,
    fields: [
      { name: "id", offset: 0, type: { kind: { type: "uint32" } }, ... },
      { name: "name", offset: 64, type: { kind: { type: "text" } }, ... },
      { name: "email", offset: 128, type: { kind: { type: "text" } }, ... },
    ],
  },
};

// Server setup
const serverRegistry = new Map<bigint, SchemaNode>();
serverRegistry.set(personSchema.id, personSchema);

const serverConnection = new RpcConnection(serverTransport);
const schemaServer = new SchemaCapabilityServer(serverRegistry);
serverConnection.registerSchemaProvider(schemaServer);

// Client setup
const clientConnection = new RpcConnection(clientTransport);
const schemaClient = new SchemaCapabilityClient(clientConnection);

// Client fetches schema dynamically
const schema = await schemaClient.getSchemaById(personSchema.id);

// Client creates and sends a message
const writer = createDynamicWriter(schema);
writer.set("id", 1);
writer.setText("name", "Alice");
writer.setText("email", "alice@example.com");

const messageBuffer = writer.toBuffer();
await clientConnection.call(target, interfaceId, methodId, {
  content: new Uint8Array(messageBuffer),
  capTable: [],
});

// Server receives and reads the message
const reader = createDynamicReader(schema, receivedBuffer);
console.log(reader.get("name")); // "Alice"
console.log(reader.get("email")); // "alice@example.com"
```

### Working with Lists

```typescript
// Schema with list field
const schema: SchemaNode = {
  // ...
  structInfo: {
    fields: [
      { 
        name: "scores", 
        type: { kind: { type: "list", elementType: { kind: { type: "int32" } } } },
        ...
      },
    ],
  },
};

// Writing
const writer = createDynamicWriter(schema);
const listWriter = writer.initList("scores", 5);
listWriter.setAll([100, 95, 87, 92, 88]);

// Reading
const reader = createDynamicReader(schema, buffer);
const scores = reader.getList("scores") as number[];
console.log(scores); // [100, 95, 87, 92, 88]
```

### Working with Unions

```typescript
// Schema with union
const schema: SchemaNode = {
  // ...
  structInfo: {
    discriminantCount: 2,
    discriminantOffset: 0,
    fields: [
      { name: "textValue", discriminantValue: 0, offset: 64, type: { kind: { type: "text" } }, ... },
      { name: "intValue", discriminantValue: 1, offset: 16, type: { kind: { type: "int32" } }, ... },
    ],
  },
};

// Writing (selects textValue variant)
const writer = createDynamicWriter(schema);
writer.setText("textValue", "Hello");

// Reading
const reader = createDynamicReader(schema, buffer);
// Access union fields based on discriminant
```

### Working with Nested Structs

```typescript
// Address schema
const addressSchema: SchemaNode = {
  id: BigInt("0xaaa"),
  displayName: "Address",
  type: SchemaNodeType.STRUCT,
  structInfo: {
    fields: [
      { name: "street", type: { kind: { type: "text" } }, ... },
      { name: "city", type: { kind: { type: "text" } }, ... },
    ],
  },
};

// Person schema with nested address
const personSchema: SchemaNode = {
  // ...
  structInfo: {
    fields: [
      { name: "name", type: { kind: { type: "text" } }, ... },
      { name: "address", type: { kind: { type: "struct", typeId: addressSchema.id } }, ... },
    ],
  },
};

// Writing nested struct
const writer = createDynamicWriter(personSchema);
writer.setText("name", "Alice");
const addressWriter = writer.initStruct("address");
addressWriter.setText("street", "123 Main St");
addressWriter.setText("city", "NYC");
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Dynamic Schema Architecture                       │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │  SchemaCapability│  │  Dynamic Reader │  │  Dynamic Writer     │  │
│  │  Server/Client   │  │                 │  │                     │  │
│  └────────┬────────┘  └────────┬────────┘  └──────────┬──────────┘  │
│           │                    │                      │              │
│           ▼                    ▼                      ▼              │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    Schema Registry                           │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │    │
│  │  │ SchemaNode  │  │ SchemaField │  │ SchemaType          │  │    │
│  │  │ (metadata)  │  │ (field def) │  │ (type definition)   │  │    │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────┘    │
│           │                                                          │
│           ▼                                                          │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    Schema Parser                             │    │
│  │         (parseSchemaNodes, createSchemaRegistry)             │    │
│  └─────────────────────────────────────────────────────────────┘    │
│           │                                                          │
│           ▼                                                          │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │              Schema Serializer (RPC messages)                │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

## Testing

```bash
# Run dynamic schema tests
npm test -- src/rpc/dynamic-schema-e2e.test.ts

# Run dynamic reader tests
npm test -- src/rpc/dynamic-reader.test.ts

# Run dynamic writer tests
npm test -- src/rpc/dynamic-writer.test.ts

# Run schema parser tests
npm test -- src/rpc/schema.test.ts

# Run all RPC tests
npm test -- src/rpc/
```

## Performance Considerations

- **Schema Caching**: Schemas are cached by default to avoid repeated network requests
- **Lazy Parsing**: Schema parsing is done only when needed
- **Field Cache**: Dynamic readers cache field lookups for faster access
- **Binary Format**: Schema serialization uses binary format by default for efficiency

## Error Handling

```typescript
try {
  const schema = await connection.getDynamicSchema(typeId);
} catch (error) {
  if (error.message.includes("not found")) {
    console.error("Schema not found on remote server");
  } else if (error.message.includes("not running")) {
    console.error("Connection is not established");
  } else {
    console.error("Failed to fetch schema:", error);
  }
}
```

## References

- [Cap'n Proto Schema Language](https://capnproto.org/language.html)
- [Cap'n Proto RPC Protocol](https://capnproto.org/rpc.html)
- [schema.capnp](https://github.com/capnproto/capnproto/blob/master/c%2B%2B/src/capnp/schema.capnp) - Official schema definitions
