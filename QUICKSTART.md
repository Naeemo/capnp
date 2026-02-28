# 快速开始 - Next.js 全栈应用

Cap'n Proto TypeScript 核心功能已可用，以下是完整使用示例。

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

## 2. 后端 API (Next.js Route Handler)

创建 `app/api/users/route.ts`：

```typescript
import { NextRequest } from 'next/server';
import { MessageReader, MessageBuilder } from '@naeemo/capnp';

// 内存存储（生产环境用数据库）
let nextId = 1n;
const users: Map<bigint, { id: bigint; name: string; email: string; age: number }> = new Map();

export async function POST(request: NextRequest) {
  // 1. 读取 Cap'n Proto 二进制请求
  const buffer = await request.arrayBuffer();
  const reader = new MessageReader(buffer);
  
  // 2. 解析 CreateUserRequest (1 data word, 2 pointers)
  const root = reader.getRoot(1, 2);
  const name = root.getText(0) || '';
  const email = root.getText(1) || '';
  const age = root.getUint8(0);
  
  // 3. 创建用户
  const id = nextId++;
  const user = { id, name, email, age };
  users.set(id, user);
  
  // 4. 构建 Cap'n Proto 响应 (2 data words, 2 pointers)
  const builder = new MessageBuilder();
  const responseRoot = builder.initRoot(2, 2);
  responseRoot.setUint64(0, id);
  responseRoot.setUint8(8, age);
  responseRoot.setText(0, name);
  responseRoot.setText(1, email);
  
  // 5. 返回二进制响应
  return new Response(builder.toArrayBuffer(), {
    status: 201,
    headers: {
      'Content-Type': 'application/x-capnp',
    },
  });
}

export async function GET() {
  // 返回所有用户列表
  const usersList = Array.from(users.values());
  
  // 计算布局：每个 User 需要 2 data words + 2 pointers
  const userCount = usersList.length;
  const dataWordsPerUser = 2;
  const pointersPerUser = 2;
  
  const builder = new MessageBuilder();
  const root = builder.initRoot(0, 1);
  
  // 创建列表 (element size = 7 for composite)
  const list = root.initList(0, 7, userCount, { 
    dataWords: dataWordsPerUser, 
    pointerCount: pointersPerUser 
  });
  
  usersList.forEach((user, i) => {
    const item = list.getStruct(i, dataWordsPerUser, pointersPerUser);
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

## 3. 前端客户端

创建 `lib/capnp-api.ts`：

```typescript
import { MessageBuilder, MessageReader } from '@naeemo/capnp';

export interface User {
  id: bigint;
  name: string;
  email: string;
  age: number;
}

export async function createUser(name: string, email: string, age: number): Promise<User> {
  // 1. 构建请求
  const builder = new MessageBuilder();
  const root = builder.initRoot(1, 2);
  root.setText(0, name);
  root.setText(1, email);
  root.setUint8(0, age);
  
  // 2. 发送请求
  const response = await fetch('/api/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-capnp',
    },
    body: builder.toArrayBuffer(),
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  // 3. 解析响应 (2 data words, 2 pointers)
  const buffer = await response.arrayBuffer();
  const reader = new MessageReader(buffer);
  const data = reader.getRoot(2, 2);
  
  return {
    id: data.getUint64(0),
    name: data.getText(0) || '',
    email: data.getText(1) || '',
    age: data.getUint8(8),
  };
}

export async function listUsers(): Promise<User[]> {
  const response = await fetch('/api/users', {
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
  
  // 读取列表 (composite elements)
  const list = root.getList(0, 7, { dataWords: 2, pointerCount: 2 });
  if (!list) return [];
  
  const users: User[] = [];
  for (let i = 0; i < list.length; i++) {
    const item = list.getStruct(i, 2, 2);
    users.push({
      id: item.getUint64(0),
      name: item.getText(0) || '',
      email: item.getText(1) || '',
      age: item.getUint8(8),
    });
  }
  
  return users;
}
```

## 4. 前端页面

创建 `app/page.tsx`：

```typescript
'use client';

import { useState, useEffect } from 'react';
import { createUser, listUsers, User } from '@/lib/capnp-api';

export default function Home() {
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [age, setAge] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    const data = await listUsers();
    setUsers(data);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await createUser(name, email, parseInt(age));
    setName('');
    setEmail('');
    setAge('');
    loadUsers();
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Cap'n Proto + Next.js</h1>
      
      <form onSubmit={handleSubmit} className="mb-8 space-y-4">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="w-full border rounded px-3 py-2"
          required
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full border rounded px-3 py-2"
          required
        />
        <input
          type="number"
          value={age}
          onChange={(e) => setAge(e.target.value)}
          placeholder="Age"
          className="w-full border rounded px-3 py-2"
          required
        />
        <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded">
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

## 关键概念

### 1. initRoot(dataWords, pointerCount)
- `dataWords`: 数据段字数（64-bit words）
- `pointerCount`: 指针数量

### 2. 字段偏移计算
- UInt64: offset 0
- UInt8: offset 8 (在第二个 word 的第一个字节)
- Text pointer: index 0
- Text pointer: index 1

### 3. 类型映射
| Cap'n Proto | TypeScript | 方法 |
|------------|-----------|------|
| UInt64 | bigint | getUint64/setUint64 |
| UInt8 | number | getUint8/setUint8 |
| Text | string | getText/setText |
| List | Array | getList/initList |

## 运行

```bash
npm run dev
```

访问 http://localhost:3000

## 优势

1. **零拷贝** - 直接读取二进制，无解析开销
2. **类型安全** - 编译时检查字段类型
3. **高性能** - 比 JSON 快 10-100 倍
4. **紧凑** - 二进制格式，体积小

## 限制

- 需要手动计算字段偏移（暂时无代码生成器）
- 无 Union/Group 支持（可用基础类型替代）
- 无 RPC 支持（可用 HTTP + Cap'n Proto 二进制替代）
