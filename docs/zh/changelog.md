# 更新日志

## [0.5.0] - 2026-03-03

### 新增
- **Phase 7: Dynamic Schema** - 运行时动态获取和使用 Schema
  - Schema 传输协议（SchemaRequest/SchemaResponse）
  - 运行时 Schema 解析器（CodeGeneratorRequest 解析）
  - Dynamic Reader - 运行时读取消息
  - Dynamic Writer - 运行时写入消息
  - Schema Capability 实现（服务端提供和客户端获取）
  - Schema 缓存机制
  - 端到端测试套件
- **420+ 测试通过**（从 360+ 增加）

### 里程碑
🎉 **Phase 7 Dynamic Schema 完成！** 支持运行时动态获取和解析 Schema，为动态语言绑定和通用客户端奠定基础。

## [0.4.0] - 2026-03-02

### 新增
- **Level 3 RPC**: 三方握手，支持多节点连接
  - Provide/Accept 消息处理
  - 节点间自动连接建立
  - 跨连接能力传递
  - ConnectionManager 管理多并发连接
- **Level 4 RPC**: Join / 引用相等性验证
  - 验证不同来源的能力指向同一对象
  - Escrow Agent 安全模式用于共识验证
  - 身份哈希验证防欺骗
  - 安全敏感操作的审计日志
- **Streaming & Realtime API** (Phase 5)
  - 带背压的 Stream 抽象
  - 支持流量控制的 Bulk API 大数据传输
  - 带优先级队列和丢弃策略的 Realtime API
  - 带宽自适应和抖动缓冲
- **360+ 测试通过**（从 257 增加）

### 里程碑
🎉 **完整的 Cap'n Proto RPC Level 0-4 实现达成！**
首个支持完整官方 RPC 协议的 TypeScript 实现。

## [0.3.0] - 2026-03-02

### 新增
- **RPC 层**: 完整的 Cap'n Proto RPC 实现 (Level 0-2)
  - Promise Pipelining 用于链式 RPC 调用
  - 客户端和服务器间的能力传递
  - SturdyRefs（持久化能力引用）
  - WebSocket 传输层
- **RPC 代码生成**: 从接口定义生成 TypeScript 客户端/服务器
- **性能优化**: MemoryPool、MultiSegmentMessageBuilder、零拷贝工具
- **集成测试**: WebSocket 和 RPC 集成测试套件
- **示例**: Echo 服务、计算器、Promise Pipelining 示例

### 变更
- 增强 V3 代码生成器，支持 RPC 接口
- 257 测试通过（从 143 增加）

## [0.2.0] - 2026-03-02

### 新增
- **二进制 Schema 支持**: 解析官方 `capnp compile -o-` 输出
- **V3 代码生成器**: 使用二进制 Schema 的新生成器，完整功能支持
- **V3 CLI 工具**: `capnp-ts-codegen` 代码生成命令
- **Union 支持**: 完整的 union 代码生成，支持判别式和变体
- **Group 支持**: 生成代码中 group 字段的内联展开
- **默认值**: 生成代码中默认值的 XOR 编码
- **多段消息**: 大消息的 Far 指针支持
- **143 测试通过**（从 133 增加）

### 变更
- 弃用 V2 基于正则的解析器（仍然可用）

## [0.1.0] - 2026-02-28

### 新增
- 纯 TypeScript Cap'n Proto 实现
- 使用 MessageReader 的零拷贝反序列化
- 用于构建消息的 MessageBuilder
- 所有基本类型的完整支持
- Text、Data、List 支持
- Schema 解析器和代码生成器
- CLI: `npx @naeemo/capnp gen schema.capnp -o types.ts`
- 133 测试通过

[0.5.0]: https://github.com/Naeemo/capnp/releases/tag/v0.5.0
[0.4.0]: https://github.com/Naeemo/capnp/releases/tag/v0.4.0
[0.3.0]: https://github.com/Naeemo/capnp/releases/tag/v0.3.0
[0.2.0]: https://github.com/Naeemo/capnp/releases/tag/v0.2.0
[0.1.0]: https://github.com/Naeemo/capnp/releases/tag/v0.1.0
