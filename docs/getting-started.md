# Getting Started

Get started with @naeemo/capnp in 5 minutes.

## Installation

```bash
npm install @naeemo/capnp
```

You also need the official `capnp` tool for schema compilation:

```bash
# macOS
brew install capnp

# Ubuntu/Debian
apt-get install capnp

# Verify installation
capnp --version
```

## Define Schema

Create `person.capnp`:

```capnp
@0x1234567890abcdef;

struct Person {
  id @0 :UInt32;
  name @1 :Text;
  email @2 :Text;
  phones @3 :List(PhoneNumber);

  struct PhoneNumber {
    number @0 :Text;
    type @1 :Type;
    
    enum Type {
      mobile @0;
      home @1;
      work @2;
    }
  }
}
```

## Generate TypeScript

```bash
npx capnp-ts-codegen person.capnp -o person.ts
```

Generated code includes:
- `Person` - TypeScript interface
- `PersonReader` - Read serialized messages
- `PersonBuilder` - Build new messages

## Basic Usage

### Build a Message

```typescript
import { MessageBuilder } from '@naeemo/capnp';
import { PersonBuilder } from './person.js';

// Create message builder
const message = new MessageBuilder();
const person = message.initRoot(PersonBuilder);

// Set fields
person.setId(123);
person.setName('Alice');
person.setEmail('alice@example.com');

// Add list
const phones = person.initPhones(2);
phones.get(0).setNumber('555-1234');
phones.get(0).setType(Person.PhoneNumber.Type.mobile);
phones.get(1).setNumber('555-5678');
phones.get(1).setType(Person.PhoneNumber.Type.home);

// Serialize to Uint8Array
const data = message.toArrayBuffer();
```

### Read a Message

```typescript
import { MessageReader } from '@naeemo/capnp';
import { PersonReader } from './person.js';

// Read from Uint8Array
const reader = new MessageReader(new Uint8Array(data));
const person = reader.getRoot(PersonReader);

// Access fields
console.log(person.getId());      // 123
console.log(person.getName());    // "Alice"
console.log(person.getEmail());   // "alice@example.com"

// Iterate list
for (const phone of person.getPhones()) {
  console.log(phone.getNumber(), phone.getType());
}
```

## RPC Call

### Server

```typescript
import { RpcConnection, EzRpcTransport } from '@naeemo/capnp';

// Implement service
class MyServiceImpl implements MyService.Server {
  async echo(params: { message: string }) {
    return { result: params.message };
  }
}

// Create server
const transport = await EzRpcTransport.connect('0.0.0.0', 8080);
const connection = new RpcConnection(transport, {
  bootstrap: new MyServiceImpl()
});
```

### Client

```typescript
import { EzRpcTransport, RpcConnection } from '@naeemo/capnp';

// Connect to server
const transport = await EzRpcTransport.connect('localhost', 8080);
const connection = new RpcConnection(transport);

// Get capability
const service = await connection.bootstrap().getAs(MyService);

// Call method
const result = await service.echo({ message: 'Hello' });
console.log(result); // "Hello"
```

## Next Steps

- [Code Generation Guide](./guides/codegen.md) - Learn more about generation options
- [RPC Guide](./guides/rpc.md) - Promise Pipelining, Capability passing
- [API Reference](./api/core.md) - Complete API documentation
