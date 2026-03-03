# @naeemo/capnp 项目记忆

> 纯 TypeScript 实现的 Cap'n Proto，零拷贝反序列化，与官方 C++ 实现兼容。

## 项目定位

一个完整的 Cap'n Proto TypeScript 实现，支持：
- 零拷贝序列化/反序列化
- 完整的 RPC 协议（Level 0-4）
- Binary Schema 代码生成
- 动态 Schema 支持

## 当前版本

**v0.5.0** - 2026-03-02 发布

## 功能状态

### 核心序列化 ✅ 完整
| 功能 | 状态 | 说明 |
|------|------|------|
| MessageReader/MessageBuilder | ✅ | 单段/多段消息 |
| StructReader/StructBuilder | ✅ | 结构体读写 |
| ListReader/ListBuilder | ✅ | 列表支持 |
| Union | ✅ | Union 类型完整支持 |
| Far Pointer | ✅ | 单/双间接寻址 |
| 默认值/XOR编码 | ✅ | 默认值的编码解码 |

### Binary Schema ✅ 完整
| 功能 | 状态 | 说明 |
|------|------|------|
| Schema 解析 | ✅ | 读取 `capnp compile -o-` 输出 |
| V3 代码生成器 | ✅ | 生成 Interface + Reader + Builder |
| Union 代码生成 | ✅ | discriminant + variant |
| Group 支持 | ✅ | Group 字段生成 |
| Interface 代码生成 | ✅ | RPC Interface 生成 |

### RPC 协议 ✅ Level 0-4 完整

**Level 0 - 基础消息交换**
- ✅ Bootstrap
- ✅ Call/Return/Finish
- ✅ 基础消息序列化

**Level 1 - Promise Pipelining**
- ✅ 流水线调用
- ✅ 能力传递
- ✅ Resolve/Release

**Level 2 - 持久化能力**
- ✅ SturdyRefs
- ✅ Save/Restore

**Level 3 - 三方引入**
- ✅ Three-way introductions
- ✅ Provide/Accept
- ✅ ConnectionManager
- ✅ Embargo 处理

**Level 4 - 引用相等**
- ✅ Join 操作
- ✅ 对象身份验证
- ✅ Escrow 代理模式

### 流控制与实时通信 ✅
| 功能 | 状态 | 说明 |
|------|------|------|
| Stream API | ✅ | 流抽象与流控 |
| Bulk API | ✅ | 批量数据传输 |
| Realtime API | ✅ | 低延迟通信 |

### 动态 Schema ✅
| 功能 | 状态 | 说明 |
|------|------|------|
| Schema 传输协议 | ✅ | 运行时获取 Schema |
| DynamicReader | ✅ | 动态读取 |
| DynamicWriter | ✅ | 动态写入 |
| Schema Registry | ✅ | Schema 缓存管理 |

### 性能优化 ✅
- ✅ MemoryPool - 内存池
- ✅ MultiSegmentMessageBuilder - 多段构建器优化
- ✅ OptimizedRpcMessageBuilder - RPC 消息优化
- ✅ Zero-copy views

## 技术架构

```
src/
├── core/                    # 核心序列化
│   ├── message-reader.ts    # 消息读取
│   ├── message-builder.ts   # 消息构建
│   ├── list.ts              # 列表实现
│   ├── pointer.ts           # 指针编解码
│   ├── segment.ts           # 段管理
│   └── union.ts             # Union 支持
│
├── schema/                  # Binary Schema 解析
│   └── schema-reader.ts     # 编译后 Schema 读取
│
├── codegen/                 # 代码生成
│   ├── generator.ts         # 主生成器
│   ├── struct-gen.ts        # 结构体生成
│   ├── enum-gen.ts          # 枚举生成
│   ├── rpc-codegen.ts       # RPC 代码生成
│   └── cli.ts               # CLI 工具
│
├── rpc/                     # RPC 实现
│   ├── rpc-types.ts         # RPC 类型定义
│   ├── rpc-connection.ts    # 连接管理
│   ├── four-tables.ts       # 四表管理
│   ├── pipeline.ts          # Promise Pipelining
│   ├── sturdyrefs.ts        # 持久化能力
│   ├── connection-manager.ts# Level 3 连接管理
│   ├── level3-handlers.ts   # Level 3 处理器
│   ├── level4-handlers.ts   # Level 4 处理器
│   ├── stream.ts            # 流控制
│   ├── bulk.ts              # 批量传输
│   ├── realtime.ts          # 实时通信
│   ├── schema-*.ts          # 动态 Schema
│   └── dynamic-*.ts         # 动态读写
│
└── test/                    # 测试
```

## 关键设计决策

### 1. Schema 解析策略
使用官方 `capnp compile -o binary` 生成的编译后 Schema，而非正则解析。
**原因**：字段布局算法复杂，官方已处理好 offset/dataWords/pointerCount。

### 2. 代码生成策略
- **Reader 类**：getter + 类型安全
- **Builder 类**：setter + factory
- **Union**：discriminant 检查 + variant 类型
- **Interface**：Method ID 常量 + Server Interface + Client Class

### 3. RPC 架构
- 基于四表（Question/Answer/Import/Export）
- Promise Pipelining 支持流水线调用
- 支持 SturdyRefs 持久化能力
- 支持三方引入和 Join 操作

## 使用方式

### 代码生成
```bash
# 安装 capnp 工具后
npx capnp-ts-codegen schema.capnp -o types.ts
```

### RPC 服务端
```typescript
import { RpcConnection } from '@naeemo/capnp';

const connection = new RpcConnection(transport, {
  bootstrap: myCapability
});
```

### RPC 客户端
```typescript
const client = await connection.bootstrap();
const result = await client.callMethod();
```

## 参考资源

- 官方协议：https://capnproto.org/encoding.html
- 官方语言规范：https://capnproto.org/language.html
- 官方 RPC：https://capnproto.org/rpc.html
- 官方路线图：https://capnproto.org/roadmap.html

## 维护者

- Naeemo <naeemo@qq.com>
- Kimi (AI assistant)

---
*本文件由开发助手维护，记录项目当前状态和设计决策。*
