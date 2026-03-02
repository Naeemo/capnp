# @naeemo/capnp 项目状态与下一步计划

## 📊 当前状态（2026-03-03）

### 已实现功能

| 功能 | 状态 | 对应官方层级 |
|------|------|-------------|
| 核心序列化 | ✅ 稳定 | - |
| V3 代码生成 | ✅ 稳定 | - |
| RPC Level 0 | ✅ 完成 | Bootstrap, Call/Return/Finish |
| RPC Level 1 | ✅ 完成 | Promise Pipelining, Capability 传递 |
| RPC Level 2 | ✅ 完成 | SturdyRefs (持久化能力) |
| RPC Level 3 | ✅ 完成 | 三方握手 (Provide/Accept) |
| **RPC Level 4** | **✅ 完成** | **引用相等验证 (Join)** |
| WebSocket 传输 | ✅ 完成 | - |
| C++ 互操作 | ✅ 完成 | 与官方 C++ 实现兼容 |
| **Streaming API** | **✅ 完成** | **Bulk/Realtime (官方路线图中)** |
| **Dynamic Schema** | **🚧 进行中** | **Phase 7: Schema 传输协议** |

### 测试统计
- **361+ 测试通过**
- **v0.4.0 已发布到 npm**

---

## 📋 下一步计划（基于官方路线图 2025）

### 🔴 高优先级（核心功能）

| 功能 | 官方状态 | 我们的状态 | 优先级 | 说明 |
|------|---------|-----------|--------|------|
| **Dynamic Schema** | 计划中 | 🚧 **进行中** | P1 | 运行时获取 schema，对动态语言很重要。允许 Python 等应用从 RPC 服务器直接获取 schema，无需本地副本 |
| **UDP Transport** | 计划中 | ❌ 未实现 | P2 | 零往返三方握手，实时通信。支持真正的零拷贝和更低延迟 |
| **加密传输** | 计划中 | ❌ 未实现 | P2 | Noise Protocol + libsodium。基于能力授权（非 PKI），支持零往返三方握手 |

### 🟡 中优先级（性能与工具）

| 功能 | 官方状态 | 我们的状态 | 优先级 | 说明 |
|------|---------|-----------|--------|------|
| **LZ4 压缩** | 计划中 | ❌ 未实现 | P3 | 减少带宽，最小 CPU 开销 |
| **Doc Comments** | 计划中 | ❌ 未实现 | P3 | 从 schema 提取文档注释，生成代码文档 |
| **Type Aliases** | 计划中 | ❌ 未实现 | P4 | `typedef` 支持，代码生成时创建类型别名 |
| **JSON 编解码定制** | 计划中 | ❌ 未实现 | P4 | 字段名映射、自定义 JSON 表示 |

### 🟢 低优先级（高级特性）

| 功能 | 官方状态 | 我们的状态 | 优先级 | 说明 |
|------|---------|-----------|--------|------|
| **Encapsulated Types** | 计划中 | ❌ 未实现 | P5 | 封装类型，允许手写包装器注入生成的代码 |
| **Maps** | 计划中 | ❌ 未实现 | P5 | 基于封装和参数化类型的 Map 支持 |
| **Inline Lists** | 计划中 | ❌ 未实现 | P5 | 固定长度列表内联存储，节省指针空间 |

---

## 🎯 Phase 7: Dynamic Schema（建议 2-3周）

**状态**: 🚧 第一步已完成（Schema 传输协议定义）

**目标**: 实现运行时 schema 获取和解析

**已完成**:
1. ✅ **Schema 传输协议**
   - 在 `rpc.capnp` 中添加了 `SchemaRequest` 和 `SchemaResponse` 消息类型
   - 定义了 `SchemaTarget` 联合类型（支持按 typeId、typeName、fileId、fileName 查询）
   - 定义了 `SchemaPayload` 和 `SchemaFormat` 枚举（binary/json/capnp）
   - 定义了 `SchemaCapability` 接口用于专用 schema 提供者

2. ✅ **TypeScript 类型定义**
   - 创建了 `schema-types.ts` 包含完整的类型定义
   - 包括 SchemaNode、SchemaField、SchemaType、SchemaMethod 等
   - 定义了 SchemaRegistry 和 DynamicSchemaLoader 接口

3. ✅ **序列化/反序列化**
   - 创建了 `schema-serializer.ts` 处理消息编码/解码
   - 支持 SchemaRequest、SchemaResponse、GetSchemaParams 等

4. ✅ **Schema 解析器**
   - 创建了 `schema-parser.ts` 用于运行时解析 schema 二进制
   - 实现了 CodeGeneratorRequest 解析
   - 提供了 createSchemaRegistry() 工厂函数

**待完成**:
1. 🔄 **Dynamic Schema 解析增强**
   - 完善 schema 二进制解析器
   - 支持所有 schema.capnp 节点类型
   - 处理 generics 和 brands

2. 🔄 **动态 Reader/Writer 生成**
   - 基于解析的 schema 动态创建消息 reader
   - 动态创建消息 writer
   - 支持动态字段访问

3. 🔄 **工具支持**
   - `capnp-ts-codegen --dynamic` 模式
   - 交互式 schema 浏览器

**使用场景**:
```typescript
// 从远程服务器获取 schema
const schema = await connection.getDynamicSchema();

// 动态解析消息
const reader = schema.parseMessage(buffer);
console.log(reader.getField('name'));
```

---

## 🎯 Phase 8: UDP Transport（建议 3-4周）

**目标**: 实现 UDP 传输层，支持零往返握手

**核心功能**:
1. **UDP Transport 实现**
   - 基于 UDP 的 RPC 传输
   - 可靠性层（类似 QUIC）

2. **零往返优化**
   - 0-RTT 三方握手
   - 预共享密钥支持

3. **与现有架构集成**
   - 与 Streaming API 配合
   - 实时通信优化

---

## 🎯 Phase 9: 加密传输（建议 3-4周）

**目标**: Noise Protocol 加密传输

**核心功能**:
1. **Noise Protocol 实现**
   - 基于 libsodium
   - 能力授权（非 PKI）

2. **零往返握手**
   - 通过 introducer 预共享密钥
   - 与 Level 3 RPC 集成

3. **安全特性**
   - 完美前向保密
   - 身份验证

---

## 📚 参考链接

- [官方路线图](https://capnproto.org/roadmap.html)
- [官方 RPC 文档](https://capnproto.org/rpc.html)
- [Noise Protocol](http://noiseprotocol.org/)
- [libsodium](https://doc.libsodium.org/)

---

## 🏆 里程碑

| 版本 | 日期 | 成就 |
|------|------|------|
| v0.1.0 | 2026-02-28 | 初始发布，核心序列化 |
| v0.2.0 | 2026-03-02 | V3 代码生成器 |
| v0.3.0 | 2026-03-02 | Level 0-2 RPC |
| **v0.4.0** | **2026-03-02** | **Level 3-4 RPC + Streaming** |
| v0.5.0 | TBD | Dynamic Schema |
| v0.6.0 | TBD | UDP Transport |
| v0.7.0 | TBD | 加密传输 |
| v1.0.0 | TBD | 完整官方协议支持 |

---

## 📝 备注

- 官方 Cap'n Proto 1.0 发布时间未定
- 我们的实现优先覆盖官方已定义的功能
- 性能优化和安全审查将在功能完整后进行
