# Code Generation Guide

@naeemo/capnp includes a powerful code generator that generates TypeScript type definitions and helper classes from `.capnp` schema files.

## Installation

The code generator is included in the main package:

```bash
npm install @naeemo/capnp
```

## Basic Usage

### Generate Single File

```bash
npx capnp-ts-codegen schema.capnp -o output.ts
```

### Generate to Directory

```bash
npx capnp-ts-codegen schema.capnp -d ./generated/
```

### Specify Runtime Path

If your project uses a non-standard runtime path:

```bash
npx capnp-ts-codegen schema.capnp -o types.ts -r ../my-runtime
```

## Generated Content

For each struct, the generator creates:

### 1. TypeScript Interface

```typescript
// For type definitions
interface Person {
  id: number;
  name: string;
  email: string;
}
```

### 2. Reader Class

```typescript
// For reading serialized messages
class PersonReader {
  getId(): number;
  getName(): string;
  getEmail(): string;
  hasEmail(): boolean;
}
```

### 3. Builder Class

```typescript
// For building new messages
class PersonBuilder {
  setId(value: number): void;
  setName(value: string): void;
  setEmail(value: string): void;
  initPhones(size: number): ListBuilder<PhoneNumberBuilder>;
}
```

## Complete Example

### Schema Definition

```capnp
@0x9876543210abcdef;

struct AddressBook {
  people @0 :List(Person);
}

struct Person {
  id @0 :UInt32;
  name @1 :Text;
  email @2 :Text;
  
  phones @3 :List(PhoneNumber);
  employment :union {
    unemployed @4 :Void;
    employer @5 :Text;
    school @6 :Text;
    selfEmployed @7 :Void;
  }
  
  struct PhoneNumber {
    number @0 :Text;
    type @1 :Type = mobile;
    
    enum Type {
      mobile @0;
      home @1;
      work @2;
    }
  }
}
```

### Generate Code

```bash
npx capnp-ts-codegen addressbook.capnp -o addressbook.ts
```

### Use Generated Code

```typescript
import { MessageBuilder, MessageReader } from '@naeemo/capnp';
import { 
  AddressBookBuilder, 
  AddressBookReader,
  PersonBuilder,
  PersonReader 
} from './addressbook.js';

// Build message
const message = new MessageBuilder();
const addressBook = message.initRoot(AddressBookBuilder);

const people = addressBook.initPeople(2);

// First person
const person1 = people.get(0);
person1.setId(1);
person1.setName('Alice');
person1.setEmail('alice@example.com');
person1.initPhones(1).get(0).setNumber('555-1234');
person1.getEmployment().setEmployer('TechCorp');

// Second person (using union)
const person2 = people.get(1);
person2.setId(2);
person2.setName('Bob');
person2.getEmployment().setSelfEmployed();

// Serialize
const data = message.toArrayBuffer();

// Read message
const reader = new MessageReader(new Uint8Array(data));
const book = reader.getRoot(AddressBookReader);

for (const person of book.getPeople()) {
  console.log(person.getName());
  
  // Handle union
  const employment = person.getEmployment();
  switch (employment.which()) {
    case Person.Employment.EMPLOYER:
      console.log('Employer:', employment.getEmployer());
      break;
    case Person.Employment.SELF_EMPLOYED:
      console.log('Self employed');
      break;
    // ...
  }
}
```

## Supported Cap'n Proto Features

### Structs

```capnp
struct Point {
  x @0 :Float64;
  y @1 :Float64;
}
```

### Unions

```capnp
struct Shape {
  area @0 :Float64;
  
  union {
    circle @1 :Circle;
    rectangle @2 :Rectangle;
  }
}
```

Generated code includes a `which()` method to check union state.

### Groups

```capnp
struct Person {
  name @0 :Text;
  
  address :group {
    street @1 :Text;
    city @2 :Text;
  }
}
```

Group fields are generated as part of the struct.

### Lists

```capnp
struct Data {
  items @0 :List(Text);
  matrix @1 :List(List(Float64));
}
```

### Enums

```capnp
enum Status {
  pending @0;
  active @1;
  completed @2;
}
```

Generates TypeScript enum and type guards.

### Interfaces (RPC)

```capnp
interface Calculator {
  add @0 (a :Int32, b :Int32) -> (result :Int32);
  subtract @1 (a :Int32, b :Int32) -> (result :Int32);
}
```

Generates Server interface and Client class.

## CLI Options

```
Usage: capnp-ts-codegen [options] <schema.capnp>

Options:
  -o, --output <file>      Output file path
  -d, --directory <dir>    Output directory (generates multiple files)
  -r, --runtime <path>     Runtime import path (default: @naeemo/capnp)
  --no-types               Don't generate TypeScript type definitions
  --no-readers             Don't generate Reader classes
  --no-builders            Don't generate Builder classes
  -h, --help              Show help
```

## Integration with Build Tools

### Vite

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { execSync } from 'child_process';
import { glob } from 'glob';

export default defineConfig({
  plugins: [{
    name: 'capnp-codegen',
    buildStart() {
      const schemas = glob.sync('src/**/*.capnp');
      for (const schema of schemas) {
        const output = schema.replace('.capnp', '.capnp.ts');
        execSync(`npx capnp-ts-codegen ${schema} -o ${output}`);
      }
    }
  }]
});
```

### Script Approach

```json
// package.json
{
  "scripts": {
    "generate": "capnp-ts-codegen src/schemas/*.capnp -d src/generated/",
    "generate:watch": "chokidar 'src/**/*.capnp' -c 'npm run generate'"
  }
}
```

## Best Practices

1. **Commit generated code to version control** or **regenerate in CI**
2. **Use `.capnp.ts` suffix** to distinguish generated files
3. **Don't manually modify generated code** - will be overwritten
4. **Use `import type`** when only types are needed

```typescript
// Good
import type { Person } from './person.capnp.js';
import { PersonReader, PersonBuilder } from './person.capnp.js';

// Avoid
import { Person } from './person.capnp.js';  // If not used as type
```

## Troubleshooting

### "capnp: command not found"

Ensure official capnp tool is installed:

```bash
# macOS
brew install capnp

# Ubuntu/Debian  
apt-get install capnp
```

### "Cannot find module"

Ensure using `.js` extension for imports (ESM requirement):

```typescript
import { Person } from './person.capnp.js';  // ✅
import { Person } from './person.capnp';      // ❌
```

### Type Errors

Ensure `tsconfig.json` has strict mode enabled:

```json
{
  "compilerOptions": {
    "strict": true,
    "moduleResolution": "bundler"
  }
}
```
