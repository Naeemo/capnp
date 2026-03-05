# @naeemo/capnp 路线图

> 基于官方 Cap'n Proto 路线图和 TypeScript 实现特性的开发规划。
> **当前优先级**: 1. 文档完善 → 2. Bug 修复 → 3. 性能测试

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

### Phase 7: 性能优化（基础）
- [x] MemoryPool
- [x] MultiSegmentMessageBuilder
- [x] Zero-copy views

### Phase 8: C++ 互操作
- [x] Node.js ↔ C++ 协议兼容（EzRpcTransport）
- [x] Bootstrap 握手测试
- [x] Call/Return 消息测试

---

## 当前优先级 🔥

### P1: 文档完善 ✅ **已完成**
目标：降低使用门槛，为 v1.0 做准备

**已完成**:
- ✅ 快速入门指南
- ✅ RPC 使用指南
- ✅ 代码生成器文档
- ✅ 动态 Schema 教程
- ✅ 流控制指南
- ✅ 性能优化最佳实践
- ✅ 错误处理最佳实践

### P2: Bug 修复 & 稳定性 ✅ **已完成**
目标：提高鲁棒性，处理边界情况

**已完成**:
- ✅ 无效输入处理 - 边界检查、默认值
- ✅ 多段消息边界 - Far Pointer 验证
- ✅ RPC 错误处理 - 连接、超时、错误消息

### P3: 性能测试 ✅ **已完成**
目标：建立性能基准，发现优化点

**已完成**:
- ✅ 基础性能测试（10个场景）
- ✅ 与 JSON 对比测试
- ✅ docs/benchmarks.md 性能报告

**关键数据**:
- 反序列化: 1-3μs (85万 ops/sec)
- 大数据量场景 Cap'n Proto 优势明显

---

## 后续计划 📋

### 可选方向

1. **API 参考生成** - typedoc 自动生成（低优先级）
2. **浏览器支持** - WebSocket-to-TCP 代理
3. **JSON 编解码器** - Capnp <-> JSON 转换
4. **更多示例** - 实际应用场景示例

### 质量保障（Pre-1.0）

- [ ] 扩大测试覆盖 - 目标 >90%
- [ ] 安全审查 - 恶意输入处理
- [ ] 生产环境验证

---

## 版本规划

| 版本 | 目标 | 主要特性 |
|------|------|----------|
| v0.5.2 | 当前 | ✅ 文档、Bug修复、性能测试 |
| v0.6.0 | 功能 | 浏览器支持、JSON 编解码器 |
| v0.7.0 | 生态 | 工具链、更多示例 |
| v1.0.0 | 成熟 | 稳定 API、生产就绪 |

---

## 后续计划 📋

### 浏览器支持 ✅ **已完成**
- [x] WebSocket-to-TCP 代理 - `src/proxy/websocket-proxy.ts`
- [x] 浏览器端互操作测试

### 工具增强
- [ ] JSON 编解码器 - Capnp ↔ JSON 双向转换
- [ ] Schema 兼容性检查器
- [ ] RPC 调试工具

### 高级功能（待评估）
- [ ] UDP 传输
- [ ] 加密传输
- [ ] 浏览器原生 WebSocket 支持优化

---

## 版本规划

| 版本 | 目标 | 主要特性 | 状态 |
|------|------|----------|------|
| v0.5.2 | 文档 | 完整文档、API 参考 | ✅ 已完成 |
| v0.9.0 | 工具 | Schema 兼容性检查、统一 CLI | ✅ 已完成 |
| v0.9.1 | 安全+性能 | 安全审计、基准测试套件 | ✅ 已发布 |
| v0.10.0 | 生态 | 浏览器支持完善、JSON 编解码器 | 📋 计划中 |
| v1.0.0 | 成熟 | 稳定 API、生产就绪 | 📋 待评估 |

---

## 参考

- [官方路线图](https://capnproto.org/roadmap.html)
- [官方 RPC 文档](https://capnproto.org/rpc.html)
- [官方编码规范](https://capnproto.org/encoding.html)
