# @naeemo/capnp 项目状态与下一步计划

## 📊 当前状态（2026-03-02）

### 已实现功能

| 功能 | 状态 | 对应官方层级 |
|------|------|-------------|
| 核心序列化 | ✅ 稳定 | - |
| V3 代码生成 | ✅ 稳定 | - |
| RPC Level 0 | ✅ 完成 | Bootstrap, Call/Return/Finish |
| RPC Level 1 | ✅ 完成 | Promise Pipelining, Capability 传递 |
| RPC Level 2 | ✅ 完成 | SturdyRefs (持久化能力) |
| WebSocket 传输 | ✅ 完成 | - |
| C++ 互操作 | ✅ 完成 | 与官方 C++ 实现兼容 |

### 测试统计
- **250+ 测试通过**
- **v0.3.0 已发布到 npm**

---

## 📋 下一步计划（对比官方路线图）

### 🔴 高优先级（核心功能缺口）

| 功能 | 官方状态 | 我们的状态 | 优先级 | 说明 |
|------|---------|-----------|--------|------|
| **Level 3 RPC** | 已定义 | ❌ 未实现 | P1 | 三方握手 (Provide/Accept)，支持多节点直接连接 |
| **Level 4 RPC** | 已定义 | ❌ 未实现 | P2 | 引用相等验证 / Join 操作 |
| **Dynamic Schema** | 计划中 | ❌ 未实现 | P2 | 运行时获取 schema，对动态语言很重要 |

### 🟡 中优先级（性能与功能增强）

| 功能 | 官方状态 | 我们的状态 | 优先级 | 说明 |
|------|---------|-----------|--------|------|
| **Bulk/Realtime API** | 计划中 | ❌ 未实现 | P3 | 流控和实时通信支持 |
| **UDP Transport** | 计划中 | ❌ 未实现 | P3 | 零往返三方握手，实时通信 |
| **加密传输** | 未指定 | ❌ 未实现 | P3 | Noise Protocol + libsodium |
| **LZ4 压缩** | 计划中 | ❌ 未实现 | P4 | 减少带宽 |

### 🟢 低优先级（语言特性与工具）

| 功能 | 官方状态 | 我们的状态 | 优先级 | 说明 |
|------|---------|-----------|--------|------|
| **Doc Comments** | 计划中 | ❌ 未实现 | P4 | 从 schema 提取文档注释 |
| **Type Aliases** | 计划中 | ❌ 未实现 | P4 | `typedef` 支持 |
| **Maps** | 计划中 | ❌ 未实现 | P5 | 基于封装类型的 Map |
| **JSON 编解码定制** | 计划中 | ❌ 未实现 | P5 | 字段名映射等 |

---

## 🎯 推荐执行顺序

### Phase 4: Level 3 RPC（建议 2-3 周）

**目标**: 实现三方握手，支持多节点直接连接

**核心功能**:
- Provide/Accept 消息处理
- 自动连接建立
- 能力引用跨连接传递

**使用场景**:
```
Alice (A) 发送 Carol (C) 的引用给 Bob (B)
→ B 自动与 C 建立直接连接
→ Bob 可以直接调用 Carol，无需通过 Alice 代理
```

### Phase 5: 流控与实时通信（建议 2-3 周）

**目标**: Bulk/Realtime API

**核心功能**:
- 流控机制（背压）
- 消息优先级
- 丢弃策略（实时场景）

### Phase 6: 传输层扩展（建议 2-4 周）

**目标**: UDP、加密传输

**核心功能**:
- UDP transport（零往返握手）
- Noise Protocol 加密
- 与现代加密方案集成

---

## 📚 与官方功能对比

### 已对齐
- ✅ Level 0-2 RPC 完整实现
- ✅ Promise Pipelining（核心特性）
- ✅ Capability-based 安全模型
- ✅ WebSocket 传输

### 主要差距
- ❌ Level 3-4 RPC（多方交互）
- ❌ Dynamic Schema（运行时获取）
- ❌ 高级传输层（UDP、加密）
- ❌ 性能优化（LZ4、共享内存）

### 独特优势
- ✅ 纯 TypeScript 实现
- ✅ 浏览器 + Node.js 兼容
- ✅ 完整的代码生成
- ✅ 与官方 C++ 实现互操作

---

## 🚀 长期愿景

1. **成为 TypeScript 生态的 Cap'n Proto 标准实现**
2. **支持所有官方 RPC 层级（Level 1-4）**
3. **提供企业级特性（加密、认证、监控）**
4. **构建周边工具（调试器、代理、ORM）**

---

## 📝 参考链接

- [官方路线图](https://capnproto.org/roadmap.html)
- [RPC 协议文档](https://capnproto.org/rpc.html)
- [rpc.capnp 协议定义](https://github.com/capnproto/capnproto/blob/master/c++/src/capnp/rpc.capnp)
