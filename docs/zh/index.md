# @naeemo/capnp

Cap'n Proto 的纯 TypeScript 实现，具有零拷贝反序列化功能，并与官方 C++ 实现完全兼容。

## 特性

- 🚀 **零拷贝反序列化** - 直接从缓冲区读取数据，无需解析
- 🔧 **纯 TypeScript** - 无 WASM 或原生依赖
- ✅ **官方兼容** - 与官方 C++ 实现进行测试验证
- 📦 **Schema 代码生成** - 从 `.capnp` Schema 生成 TypeScript 类型
- ⚡ **高性能** - 序列化 1.4μs，反序列化 0.6μs

## 安装

```bash
npm install @naeemo/capnp
```

## 快速开始

### 代码生成

从你的 Cap'n Proto Schema 生成 TypeScript 类型：

```bash
npx @naeemo/capnp gen schema.capnp -o types.ts
```

### 基本用法

```typescript
import { MessageBuilder, MessageReader } from '@naeemo/capnp';
import { PersonBuilder, PersonReader } from './types';

// 构建消息
const builder = new MessageBuilder();
const person = PersonBuilder.create(builder);
person.setName('John');
person.setAge(30);
const buffer = builder.toArrayBuffer();

// 读取消息
const reader = new MessageReader(buffer);
const p = new PersonReader(reader.getRoot(2, 1));
console.log(p.name); // "John"
```

## 文档

- [快速开始指南](./quickstart)
- [RPC 指南](./rpc-guide)
- [更新日志](./changelog)

## 许可证

MIT License © 2024-2026 Naeemo
