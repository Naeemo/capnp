# Cap'n Proto TypeScript

纯 TypeScript 实现的 Cap'n Proto，支持零拷贝反序列化，与官方 C++ 实现完全兼容。

[English Documentation](./README.md)

## 特性

- 🚀 **零拷贝反序列化** - 直接从缓冲区读取数据，无需解析
- 🔧 **纯 TypeScript** - 无 WASM 或原生依赖，可在任何 JS 环境运行
- ✅ **官方兼容** - 已通过官方 C++ 实现测试验证
- 📦 **Schema 代码生成** - 从 `.capnp` 模式生成 TypeScript 类型
- ⚡ **高性能** - 简单结构序列化 1.4μs，反序列化 0.6μs

## 安装

```bash
npm install @naeemo/capnp
```

## 快速开始

### 基础用法

```typescript
import { MessageBuilder, MessageReader } from '@naeemo/capnp';

// 构建消息
const builder = new MessageBuilder();
const root = builder.initRoot(2, 1); // 2 个数据字，1 个指针
root.setInt32(0, 42);
root.setText(0, '你好，Cap\'n Proto！');
const buffer = builder.toArrayBuffer();

// 读取消息
const reader = new MessageReader(buffer);
const data = reader.getRoot(2, 1);
console.log(data.getInt32(0)); // 42
console.log(data.getText(0));  // "你好，Cap'n Proto！"
```

### 代码生成

从 Cap'n Proto 模式生成 TypeScript 类型：

```bash
npx @capnp-ts/codegen schema.capnp -o types.ts
```

## 性能

| 操作 | 延迟 | 吞吐量 |
|-----------|---------|------------|
| 简单结构序列化 | 1.4 μs | 68万 ops/sec |
| 简单结构反序列化 | 0.6 μs | 166万 ops/sec |
| 嵌套结构序列化 | 4.1 μs | 24万 ops/sec |
| 列表(100项)序列化 | 6.8 μs | 14万 ops/sec |

详见 [PERFORMANCE.md](./PERFORMANCE.md)

## 文档

- [API 文档](./docs/API.md)
- [性能报告](./PERFORMANCE.md)
- [测试覆盖](./TEST_COVERAGE.md)
- [更新日志](./CHANGELOG.md)

## 贡献

欢迎贡献！请查看 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解指南。

## 致谢

由 **Naeemo** 和 **Kimi** 共同开发。

## 许可证

MIT 许可证 - 详见 [LICENSE](./LICENSE)
