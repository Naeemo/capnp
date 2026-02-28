# Next.js Full-Stack Example

A complete example of using Cap'n Proto TypeScript in a Next.js full-stack application.

## Project Structure

```
my-app/
├── app/
│   ├── api/
│   │   └── users/
│   │       └── route.ts      # API route with Cap'n Proto
│   └── page.tsx              # Frontend page
├── lib/
│   ├── api.ts                # API client with Cap'n Proto
│   └── capnp.ts              # Cap'n Proto helpers
├── schemas/
│   └── user.capnp            # Cap'n Proto schema
└── package.json
```

## Quick Start

### 1. Install Dependencies

```bash
npm install @naeemo/capnp
npm install -D @types/node
```

### 2. Define Schema

Create `schemas/user.capnp`:

```capnp
@0x123456789abcdef0;

struct User {
  id @0 :UInt64;
  name @1 :Text;
  email @2 :Text;
  age @3 :UInt8;
}

struct CreateUserRequest {
  name @0 :Text;
  email @1 :Text;
  age @2 :UInt8;
}
```

### 3. Create API Helpers

Create `lib/capnp.ts`:

```typescript
import { MessageBuilder, MessageReader, StructReader, StructBuilder } from '@naeemo/capnp';

// Helper to create a User builder
export function createUserBuilder(builder: MessageBuilder): UserBuilder {
  // 2 data words (id: UInt64 = 1 word, age: UInt8 = part of word 1)
  // 2 pointers (name, email)
  const root = builder.initRoot(2, 2);
  return new UserBuilder(root);
}

// Helper to read a User
export function readUser(reader: StructReader): User {
  return {
    id: reader.getUint64(0),
    name: reader.getText(0) || '',
    email: reader.getText(1) || '',
    age: reader.getUint8(8),
  };
}

// User builder wrapper
class UserBuilder {
  constructor(private struct: StructBuilder) {}
  
  setId(id: bigint) {
    this.struct.setUint64(0, id);
  }
  
  setName(name: string) {
    this.struct.setText(0, name);
  }
  
  setEmail(email: string) {
    this.struct.setText(1, email);
  }
  
  setAge(age: number) {
    this.struct.setUint8(8, age);
  }
}

// Type definition
export interface User {
  id: bigint;
  name: string;
  email: string;
  age: number;
}
```

### 4. Create API Route

Create `app/api/users/route.ts`:

```typescript
import { NextRequest } from 'next/server';
import { MessageReader, MessageBuilder } from '@naeemo/capnp';
import { createUserBuilder, readUser, User } from '@/lib/capnp';

// In-memory storage (replace with database in production)
let nextId = 1n;
const users: User[] = [];

export async function POST(request: NextRequest) {
  try {
    // Read Cap'n Proto request body
    const buffer = await request.arrayBuffer();
    const reader = new MessageReader(buffer);
    const root = reader.getRoot(1, 2); // 1 data word, 2 pointers for CreateUserRequest
    
    // Extract fields
    const name = root.getText(0) || '';
    const email = root.getText(1) || '';
    const age = root.getUint8(0);
    
    // Create user
    const user: User = {
      id: nextId++,
      name,
      email,
      age,
    };
    users.push(user);
    
    // Build Cap'n Proto response
    const builder = new MessageBuilder();
    const userBuilder = createUserBuilder(builder);
    userBuilder.setId(user.id);
    userBuilder.setName(user.name);
    userBuilder.setEmail(user.email);
    userBuilder.setAge(user.age);
    
    return new Response(builder.toArrayBuffer(), {
      status: 201,
      headers: {
        'Content-Type': 'application/x-capnp',
      },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

export async function GET() {
  // Build response with all users
  const builder = new MessageBuilder();
  const root = builder.initRoot(0, 1);
  
  // Create list of users
  const list = root.initList(0, 7, users.length, { dataWords: 2, pointerCount: 2 });
  users.forEach((user, i) => {
    const item = list.getStruct(i, 2, 2);
    item.setUint64(0, user.id);
    item.setUint8(8, user.age);
    item.setText(0, user.name);
    item.setText(1, user.email);
  });
  
  return new Response(builder.toArrayBuffer(), {
    headers: {
      'Content-Type': 'application/x-capnp',
    },
  });
}
```

### 5. Create Frontend Client

Create `lib/api.ts`:

```typescript
import { MessageBuilder, MessageReader } from '@naeemo/capnp';
import { User, createUserBuilder, readUser } from './capnp';

const API_BASE = '/api';

export async function createUser(
  name: string,
  email: string,
  age: number
): Promise<User> {
  // Build request
  const builder = new MessageBuilder();
  const root = builder.initRoot(1, 2);
  root.setText(0, name);
  root.setText(1, email);
  root.setUint8(0, age);
  
  // Send request
  const response = await fetch(`${API_BASE}/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-capnp',
    },
    body: builder.toArrayBuffer(),
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  // Parse response
  const buffer = await response.arrayBuffer();
  const reader = new MessageReader(buffer);
  return readUser(reader.getRoot(2, 2));
}

export async function listUsers(): Promise<User[]> {
  const response = await fetch(`${API_BASE}/users`, {
    headers: {
      'Accept': 'application/x-capnp',
    },
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  const buffer = await response.arrayBuffer();
  const reader = new MessageReader(buffer);
  const root = reader.getRoot(0, 1);
  const list = root.getList(0, 7, { dataWords: 2, pointerCount: 2 });
  
  if (!list) return [];
  
  const users: User[] = [];
  for (let i = 0; i < list.length; i++) {
    const item = list.getStruct(i, 2, 2);
    users.push(readUser(item));
  }
  
  return users;
}
```

### 6. Create Frontend Page

Create `app/page.tsx`:

```typescript
'use client';

import { useState, useEffect } from 'react';
import { createUser, listUsers, User } from '@/lib/api';

export default function Home() {
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [age, setAge] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      const data = await listUsers();
      setUsers(data);
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createUser(name, email, parseInt(age));
      setName('');
      setEmail('');
      setAge('');
      loadUsers();
    } catch (error) {
      console.error('Failed to create user:', error);
      alert('Failed to create user');
    }
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Cap'n Proto + Next.js Demo</h1>
      
      <form onSubmit={handleSubmit} className="mb-8 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border rounded px-3 py-2"
            required
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border rounded px-3 py-2"
            required
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Age</label>
          <input
            type="number"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            className="w-full border rounded px-3 py-2"
            required
          />
        </div>
        
        <button
          type="submit"
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          Create User
        </button>
      </form>

      <h2 className="text-xl font-semibold mb-4">Users</h2>
      <div className="space-y-2">
        {users.map((user) => (
          <div key={user.id.toString()} className="border rounded p-4">
            <p><strong>ID:</strong> {user.id.toString()}</p>
            <p><strong>Name:</strong> {user.name}</p>
            <p><strong>Email:</strong> {user.email}</p>
            <p><strong>Age:</strong> {user.age}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 7. Run the App

```bash
npm run dev
```

Visit http://localhost:3000

## Key Points

1. **Binary Format**: Data is sent as Cap'n Proto binary, not JSON
2. **Zero-Copy**: Server reads data directly from the request buffer
3. **Type Safety**: TypeScript ensures correct field access
4. **Performance**: No parsing overhead, minimal allocations

## Next Steps

- Add database integration (Prisma, Drizzle, etc.)
- Implement authentication
- Add more complex schemas with nested types
- Set up code generation from `.capnp` files
