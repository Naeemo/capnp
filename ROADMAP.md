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
| **RPC Level 3** | **✅ 完成** | **三方握手 (Provide/Accept)** |
| WebSocket 传输 | ✅ 完成 | - |
| C++ 互操作 | ✅ 完成 | 与官方 C++ 实现兼容 |

### 测试统计
- **260+ 测试通过** (新增 14 个 Level 3 测试)
- **v0.3.0 已发布到 npm**

---

## 📋 下一步计划（对比官方路线图）

### 🔴 高优先级（核心功能缺口）

| 功能 | 官方状态 | 我们的状态 | 优先级 | 说明 |
|------|---------|-----------|--------|------|
| **Level 3 RPC** | 已定义 | ✅ **已实现** | P1 | 三方握手 (Provide/Accept)，支持多节点直接连接 |
| **Level 4 RPC** | 已定义 | ❌ 未实现 | P1 | 引用相等验证 / Join 操作 |
| **Dynamic Schema** | 计划中 | ❌ 未实现 | P2 | 运行时获取 schema，对动态语言很重要 |

### 🟡 中优先级（性能与功能增强）

| 功能 | 官方状态 | 我们的状态 | 优先级 | 说明 |
|------|---------|-----------|--------|------|
| **Bulk/Realtime API** | 计划中 | ❌ 未实现 | P2 | 流控和实时通信支持 |
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

## ✅ Phase 4 完成总结 (Level 3 RPC)

### 已实现功能

#### 1. 协议扩展
- ✅ 扩展 `rpc.capnp` 协议定义，添加 Level 3 消息类型
- ✅ Provide 消息：提供能力给第三方
- ✅ Accept 消息：接受第三方能力
- ✅ Embargo 消息（用于打破循环依赖）
- ✅ ThirdPartyCapId, RecipientId, ProvisionId 类型定义

#### 2. 连接管理
- ✅ `ConnectionManager`：管理多个并发连接
- ✅ 自动连接建立逻辑
- ✅ 连接池和复用
- ✅ Vat ID 和 Provision ID 生成

#### 3. 能力传递
- ✅ 跨连接的能力引用传递
- ✅ ThirdPartyCapId 处理
- ✅ 接收方能力恢复
- ✅ `createThirdPartyCapId()` 辅助函数

#### 4. 消息处理
- ✅ `Level3Handlers` 类
- ✅ Provide 消息处理
- ✅ Accept 消息处理
- ✅ 循环依赖场景处理 (Embargo)

#### 5. 测试
- ✅ 14 个 Level 3 单元测试
- ✅ 三节点测试场景
- ✅ 循环依赖测试
- ✅ 所有 97 个 RPC 测试通过

### 核心概念

Level 3 RPC 允许 RPC 网络中的多个节点相互传递能力引用并自动形成直接连接：

```
Alice (A) 发送 Carol (C) 的引用给 Bob (B)
→ B 自动与 C 建立直接连接
→ Bob 可以直接调用 Carol，无需通过 Alice 代理
```

### 使用示例

```typescript
import {
  RpcConnection,
  ConnectionManager,
  Level3Handlers,
  generateVatId,
} from '@naeemo/capnp';

// 创建 Vat ID 和连接管理器
const selfVatId = generateVatId();
const connectionManager = new ConnectionManager({
  selfVatId,
  connectionFactory: async (vatId, address) => {
    // 创建到目标 vat 的传输层连接
    return new WebSocketTransport(new WebSocket(address));
  },
  autoConnect: true,
});

// 创建连接并设置 Level 3 处理器
const connection = new RpcConnection(transport, {
  selfVatId,
  connectionManager,
});

const level3Handlers = new Level3Handlers({
  connection,
  connectionManager,
  selfVatId,
});
connection.setLevel3Handlers(level3Handlers);
```

---

## 🎯 推荐执行顺序

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

### Phase 7: Level 4 RPC（建议 2-3 周）

**目标**: Join 操作

**核心功能**:
- 引用相等验证
- Join 消息处理
- 能力合并

---

## 📚 与官方功能对比

### 已对齐
- ✅ Level 0-3 RPC 完整实现
- ✅ Promise Pipelining（核心特性）
- ✅ Capability-based 安全模型
- ✅ WebSocket 传输
- ✅ 三方握手协议

### 主要差距
- ❌ Level 4 RPC（Join 操作）
- ❌ Dynamic Schema（运行时获取）
- ❌ 高级传输层（UDP、加密）
- ❌ 性能优化（LZ4、共享内存）

### 独特优势
- ✅ 纯 TypeScript 实现
- ✅ 浏览器 + Node.js 兼容
- ✅ 完整的代码生成
- ✅ 与官方 C++ 实现互操作
- ✅ Level 3 RPC 完整实现

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
- [Phase 4 进度文档](./src/rpc/PHASE4_PROGRESS.md)
