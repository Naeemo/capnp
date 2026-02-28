# Cap'n Proto C++ 封装方案

## 官方库结构分析

capnproto/c++ 核心模块：

```
capnproto/c++/
├── src/kj/          # 基础库（async, io, memory）
├── src/capnp/       # 核心 Cap'n Proto
│   ├── message.h    # MessageReader, MessageBuilder
│   ├── layout.h     # StructReader, StructBuilder, ListReader
│   ├── any.h        # DynamicValue, DynamicStruct
│   ├── schema.h     # Schema, StructSchema
│   ├── schema-parser.h  # 解析 .capnp 文件
│   └── serialize.h  # 序列化/反序列化
└── src/capnp/compat/  # 兼容性代码
```

## WASM 封装策略

### 1. 裁剪方案

官方库依赖 kj，kj 又依赖 POSIX/Win32 API。WASM 需要裁剪：

**保留：**
- `kj/memory.h` - 智能指针
- `kj/array.h` - 数组
- `kj/string.h` - 字符串
- `capnp/message.h` - 核心消息
- `capnp/layout.h` - 布局访问
- `capnp/any.h` - 动态 API
- `capnp/schema.h` - Schema

**移除：**
- `kj/async.h` - 异步（WASM 单线程）
- `kj/io.h` - IO（用 JS 替代）
- `capnp/rpc.h` - RPC（暂时不需要）

### 2. Embind 绑定层设计

```cpp
// 绑定核心类
class_<capnp::MessageReader>("MessageReader")
    .function("getRoot", &MessageReader::getRoot)
    ...

class_<capnp::MessageBuilder>("MessageBuilder")
    .function("initRoot", &MessageBuilder::initRoot)
    .function("toArrayBuffer", ...)
    ...

// Dynamic API 用于代码生成器
class_<capnp::DynamicStruct>("DynamicStruct")
    .function("get", &DynamicStruct::get)
    .function("set", &DynamicStruct::set)
    ...
```

### 3. TypeScript API 设计

保持现在的 API，底层换成官方库：

```typescript
// 不变
const reader = new MessageReader(buffer);
const person = reader.getRoot(Person);
console.log(person.name);

// 不变
const builder = new MessageBuilder();
const person = builder.initRoot(Person);
person.name = "Alice";
const buffer = builder.toArrayBuffer();
```

### 4. 代码生成器流程

```
schema.capnp ──► capnp compile -o ts ──► schema.ts
```

生成的代码：
- 继承 StructReader/StructBuilder
- 类型安全的 getter/setter
- 嵌套 struct、list、union 支持

### 5. 构建流程

```bash
# 1. 编译官方库到 WASM
emcmake cmake third_party/capnproto -DBUILD_SHARED_LIBS=OFF
emmake make

# 2. 编译我们的绑定层
emcmake cmake wasm -Dcapnp_DIR=...
emmake make

# 3. 构建 TypeScript
pnpm run build:ts
```

## 关键问题

### WASM 体积
- 官方库 + kj 约 500KB 源码
- 预计 WASM 输出 200-500KB
- 可用 `-Oz`、`-s FILESYSTEM=0` 优化

### 64 位整数
- Cap'n Proto 用 64 位指针
- JS 只有 53 位安全整数
- 方案：用 BigInt，或 split high/low

### 多段消息
- 官方库支持多段（multi-segment）
- 需要绑定 SegmentArray

## 下一步

1. 下载官方库源码
2. 写 CMake 配置交叉编译
3. 绑定 message.h 和 layout.h
4. 跑通第一个测试
