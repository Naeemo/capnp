# Examples

Complete working examples for common use cases.

## Basic Serialization

Simple message serialization and deserialization:

```typescript
import { MessageBuilder, MessageReader } from '@naeemo/capnp';
import { PersonBuilder, PersonReader } from './person.js';

// Build message
const message = new MessageBuilder();
const person = message.initRoot(PersonBuilder);
person.setName('Alice');
person.setAge(30);
person.setEmail('alice@example.com');

const data = message.toArrayBuffer();

// Read message
const reader = new MessageReader(new Uint8Array(data));
const personReader = reader.getRoot(PersonReader);

console.log(personReader.getName());  // "Alice"
console.log(personReader.getAge());   // 30
```

**Full code**: [examples/basic.ts](https://github.com/Naeemo/capnp/blob/main/examples/basic.ts)

---

## Echo Service (RPC)

A complete RPC client/server example:

### Server

```typescript
import { RpcConnection, EzRpcTransport } from '@naeemo/capnp';
import { EchoService } from './echo-service.js';

class EchoServiceImpl implements EchoService.Server {
  async echo(params: { message: string }) {
    return { result: params.message };
  }
}

const transport = await EzRpcTransport.connect('0.0.0.0', 8080);
const connection = new RpcConnection(transport, {
  bootstrap: new EchoServiceImpl()
});
```

### Client

```typescript
const transport = await EzRpcTransport.connect('localhost', 8080);
const connection = new RpcConnection(transport);
const echo = await connection.bootstrap().getAs(EchoService);

const result = await echo.echo({ message: 'Hello' });
console.log(result); // "Hello"
```

**Full code**: [examples/echo-service.ts](https://github.com/Naeemo/capnp/blob/main/examples/echo-service.ts)

---

## Promise Pipelining

Chain multiple RPC calls in a single network round trip:

```typescript
// Without pipelining: 3 round trips
const user = await db.getUser({ id: 1 });
const orders = await user.getOrders();
const items = await orders.getItems();

// With pipelining: 1 round trip
const items = await db
  .getUser({ id: 1 })
  .getOrders()
  .getItems();
```

**Full code**: [examples/promise-pipelining.ts](https://github.com/Naeemo/capnp/blob/main/examples/promise-pipelining.ts)

---

## Dynamic Schema

Work with schemas at runtime without code generation:

```typescript
import { createDynamicWriter, createDynamicReader } from '@naeemo/capnp';

// Define schema at runtime
const schema = {
  id: '0x123',
  displayName: 'Person',
  structInfo: {
    fields: [
      { name: 'name', type: { kind: { type: 'text' } } },
      { name: 'age', type: { kind: { type: 'uint32' } } }
    ]
  }
};

// Build message
const writer = createDynamicWriter(schema);
writer.set('name', 'Bob');
writer.set('age', 25);
const buffer = writer.toBuffer();

// Read message
const reader = createDynamicReader(schema, buffer);
console.log(reader.get('name')); // "Bob"
```

**Full code**: [examples/dynamic-schema.ts](https://github.com/Naeemo/capnp/blob/main/examples/dynamic-schema.ts)

---

## WebSocket Chat

Real-time chat using WebSocket transport:

**Full code**: [examples/websocket-chat.ts](https://github.com/Naeemo/capnp/blob/main/examples/websocket-chat.ts)

---

## File Transfer

Large file transfer with chunked streaming:

**Full code**: [examples/file-transfer.ts](https://github.com/Naeemo/capnp/blob/main/examples/file-transfer.ts)

---

## More Examples

Browse all examples in the [GitHub repository](https://github.com/Naeemo/capnp/tree/main/examples).
