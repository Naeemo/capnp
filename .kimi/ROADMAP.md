# @naeemo/capnp 路线图

> 基于官方 Cap'n Proto 路线图和 TypeScript 实现特性的开发规划。

## 已实现 ✅

### Phase 1: 核心基础
- [x] 零拷贝序列化/反序列化
- [x] 单段/多段消息
- [x] Far Pointer 支持（单/双间接）
- [x] Union 完整支持
- [x] Group 支持
- [x] 默认值/XOR 编码

### Phase 2: Binary Schema 与代码生成
- [x] 编译后 Schema 解析（`capnp compile -o-`）
- [x] V3 代码生成器
- [x] Struct/Enum/Interface 生成
- [x] Union 代码生成
- [x] Group 代码生成
- [x] CLI 工具

### Phase 3: RPC Level 0-2
- [x] Bootstrap
- [x] Call/Return/Finish
- [x] Promise Pipelining（Level 1）
- [x] SturdyRefs（Level 2）
- [x] Resolve/Release/Disembargo

### Phase 4: RPC Level 3-4
- [x] Three-way introductions（Level 3）
- [x] ConnectionManager
- [x] Join 操作（Level 4）
- [x] 对象身份验证
- [x] Escrow 代理

### Phase 5: 流控制与实时通信
- [x] Stream API 与流控
- [x] Bulk API（批量传输）
- [x] Realtime API（低延迟）

### Phase 6: 动态 Schema
- [x] Schema 传输协议
- [x] DynamicReader/DynamicWriter
- [x] Schema Registry

### Phase 7: 性能优化
- [x] MemoryPool
- [x] MultiSegmentMessageBuilder
- [x] Zero-copy views

---

## 开发中 🚧

### C++ 互操作测试
- [ ] 启动 C++ 参考服务器
- [ ] 跨语言兼容性测试
- [ ] 性能对比基准测试

### 文档完善
- [ ] RPC 使用指南
- [ ] 动态 Schema 教程
- [ ] 流控制 API 文档
- [ ] 最佳实践指南

---

## 计划中 📋

### 兼容性增强

参考官方路线图（https://capnproto.org/roadmap.html）：

#### 语言特性（官方规划中）
- [ ] **Inline lists** - 固定长度内联列表
- [ ] **Type aliases** - typedef 支持
- [ ] **Doc comments** - 从 schema 提取文档注释
- [ ] **Encapsulated types** - 封装类型包装器
- [ ] **Maps** - 基于封装类型的 Map 支持

#### RPC 协议特性（官方规划中）
- [ ] **Dynamic schema transmission** - 运行时 Schema 获取（已部分实现）
- [ ] **UDP transport** - UDP 传输层
- [ ] **Encrypted transport** - 基于 libsodium/Noise 的加密传输
- [ ] **Capability-based auth** - 基于能力的认证（非 PKI）

#### 工具（官方规划中）
- [ ] **Schema compatibility checker** - Schema 兼容性检查
- [ ] **RPC debugger** - RPC 调试工具

### TypeScript 特定功能

- [ ] **JSON 编解码器** - Cap'n Proto <-> JSON 转换
- [ ] **浏览器兼容性优化** - 更好的浏览器支持
- [ ] **WebSocket 传输优化** - 连接复用、心跳机制
- [ ] **TypeScript 装饰器** - 可选的装饰器 API

---

## 待评估 🤔

以下功能需要评估是否有必要在 TS 实现中支持：

- **Shared memory RPC** - 共享内存 RPC（主要面向 C++ 进程间通信）
- **POCS (Plain Old C Structs)** - 传统内存分配风格 API（TS 中必要性低）
- **ORM interface** - 远程存储对象接口
- **mmap-friendly mutable storage** - 可修改的 mmap 存储格式

---

## 质量保障（Pre-1.0）

参考官方 1.0 前必须完成的事项：

- [ ] **扩大测试覆盖** - 无效输入处理测试
- [ ] **性能审查** - 详细性能分析和优化
- [ ] **安全审查** - 恶意输入处理安全性

---

## 版本规划

| 版本 | 目标日期 | 主要特性 |
|------|----------|----------|
| v0.5.1 | - | Bug 修复、C++ 互操作测试 |
| v0.6.0 | - | 文档完善、JSON 编解码器 |
| v0.7.0 | - | 加密传输、UDP 支持 |
| v1.0.0 | - | 稳定 API、完整文档、质量保障 |

---

## 参考

- [官方路线图](https://capnproto.org/roadmap.html)
- [官方 RPC 文档](https://capnproto.org/rpc.html)
- [官方编码规范](https://capnproto.org/encoding.html)
