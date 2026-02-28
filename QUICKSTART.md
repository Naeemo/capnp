# 快速开始 - Next.js 全栈应用

## 安装

```bash
npm install @naeemo/capnp
```

## 1. 定义 Schema

创建 `schemas/user.capnp`：

```capnp
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

## 2. 生成 TypeScript 代码

```bash
npx tsx node_modules/@naeemo/capnp/dist/cli/codegen.js schemas/user.capnp -o types/user.ts
```

生成的代码：
```typescript
export interface User {
  id: bigint;
  name: string;
  email: string;
  age: number;
}

export class UserReader {
  constructor(reader: StructReader);
  get id(): bigint;
  get name(): string;
  get email(): string;
  get age(): number;
}

export class UserBuilder {
  constructor(builder: StructBuilder);
  static create(message: MessageBuilder): UserBuilder;
  setId(value: bigint): void;
  setName(value: string): void;
  setEmail(value: string): void;
  setAge(value: number): void;
}
```

## 3. 后端 API

创建 `app/api/users/route.ts`：

```typescript
import { NextRequest } from 'next/server';
import { MessageBuilder, MessageReader } from '@naeemo/capnp';
import { UserBuilder, CreateUserRequestReader } from '@/types/user';

let nextId = 1n;
const users = new Map();

export async function POST(request: NextRequest) {
  const buffer = await request.arrayBuffer();
  
  // 解析请求
  const reqReader = new CreateUserRequestReader(
    new MessageReader(buffer).getRoot(1, 2)
  );
  
  const id = nextId++;
  users.set(id, {
    id,
    name: reqReader.name,
    email: reqReader.email,
    age: reqReader.age,
  });
  
  // 构建响应
  const builder = new MessageBuilder();
  const userBuilder = UserBuilder.create(builder);
  userBuilder.setId(id);
  userBuilder.setName(reqReader.name);
  userBuilder.setEmail(reqReader.email);
  userBuilder.setAge(reqReader.age);
  
  return new Response(builder.toArrayBuffer(), {
    status: 201,
    headers: { 'Content-Type': 'application/x-capnp' },
  });
}
```

## 4. 前端客户端

创建 `lib/api.ts`：

```typescript
import { MessageBuilder, MessageReader } from '@naeemo/capnp';
import { UserReader, CreateUserRequestBuilder } from '@/types/user';

export async function createUser(name: string, email: string, age: number) {
  const builder = new MessageBuilder();
  const req = CreateUserRequestBuilder.create(builder);
  req.setName(name);
  req.setEmail(email);
  req.setAge(age);
  
  const res = await fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-capnp' },
    body: builder.toArrayBuffer(),
  });
  
  return new UserReader(new MessageReader(await res.arrayBuffer()).getRoot(2, 2));
}
```

## 5. 前端页面

```tsx
'use client';
import { createUser } from '@/lib/api';

export default function Page() {
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const user = await createUser('John', 'john@example.com', 25);
    console.log(user.id, user.name);
  }
  
  return <form onSubmit={handleSubmit}>...</form>;
}
```

## 运行

```bash
npm run dev
```

访问 http://localhost:3000
