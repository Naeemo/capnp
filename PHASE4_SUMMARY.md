# Phase 4: Level 3 RPC 开发完成总结

## 完成时间
2026-03-02

## 目标
实现 Level 3 RPC：三方握手（Three-way introductions），支持多节点直接连接。

## 核心概念
Level 3 允许 RPC 网络中的多个节点相互传递能力引用并自动形成直接连接：
- Alice (A) 发送 Carol (C) 的引用给 Bob (B)
- B 自动与 C 建立直接连接
- Bob 可以直接调用 Carol，无需通过 Alice 代理

## 已实现功能

### 1. 协议扩展 ✅
- 扩展 `rpc.capnp` 协议定义，添加 Level 3 消息类型
- Provide 消息：提供能力给第三方
- Accept 消息：接受第三方能力
- Embargo 消息（用于打破循环依赖）
- ThirdPartyCapId, RecipientId, ProvisionId 类型定义
- 详细的协议文档注释

### 2. 连接管理 ✅
- `ConnectionManager` 类：管理多个并发连接
- 自动连接建立逻辑
- 连接池和复用
- Vat ID 和 Provision ID 生成
- 待处理 Provision 跟踪

### 3. 能力传递 ✅
- 跨连接的能力引用传递
- ThirdPartyCapId 处理
- 接收方能力恢复
- `createThirdPartyCapId()` 辅助函数

### 4. 消息处理 ✅
- `Level3Handlers` 类
- Provide 消息处理
- Accept 消息处理
- 循环依赖场景处理 (Embargo)
- Disembargo 消息处理

### 5. RpcConnection 更新 ✅
- 集成 Level 3 消息处理
- Provide/Accept 消息路由
- 第三方能力处理
- 支持 `acceptFromThirdParty` 返回类型

### 6. 测试 ✅
- 14 个 Level 3 单元测试
- 三节点测试场景
- 循环依赖测试
- 所有 97 个 RPC 测试通过

### 7. 文档和示例 ✅
- `PHASE4_PROGRESS.md`：详细进度文档
- `examples/level3-intro.ts`：使用示例
- 更新 `ROADMAP.md`
- 更新 `src/rpc/README.md`

## 文件变更

### 新增文件
1. `src/rpc/connection-manager.ts` - 连接管理器
2. `src/rpc/level3-handlers.ts` - Level 3 消息处理器
3. `src/rpc/level3.test.ts` - Level 3 测试
4. `src/rpc/PHASE4_PROGRESS.md` - Phase 4 进度文档
5. `examples/level3-intro.ts` - 使用示例

### 修改文件
1. `src/rpc/rpc.capnp` - 扩展协议定义
2. `src/rpc/rpc-connection.ts` - 添加 Level 3 支持
3. `src/rpc/rpc-types.ts` - 已有 Level 3 类型定义
4. `src/rpc/index.ts` - 导出 Level 3 模块
5. `src/rpc/README.md` - 更新文档
6. `ROADMAP.md` - 更新项目状态

## 测试结果

```
✓ src/rpc/level3.test.ts (14 tests) 8ms
✓ src/rpc/pipeline.test.ts (17 tests) 11ms
✓ src/rpc/message-serializer.test.ts (9 tests) 6ms
✓ src/rpc/sturdyrefs.test.ts (15 tests) 6ms
✓ src/rpc/rpc.test.ts (16 tests) 6ms
✓ src/rpc/performance.test.ts (22 tests) 6ms
✓ src/rpc/echo.test.ts (4 tests) 4ms

Test Files  7 passed (7)
Tests  97 passed (97)
```

## 使用示例

```typescript
import {
  RpcConnection,
  ConnectionManager,
  Level3Handlers,
  generateVatId,
  createThirdPartyCapId,
  generateProvisionId,
} from '@naeemo/capnp';

// 1. 创建 Vat ID
const selfVatId = generateVatId();

// 2. 创建连接管理器
const connectionManager = new ConnectionManager({
  selfVatId,
  connectionFactory: async (vatId, address) => {
    return new WebSocketTransport(new WebSocket(address));
  },
  autoConnect: true,
});

// 3. 创建连接并设置 Level 3 处理器
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

// 4. 注册连接
connectionManager.registerConnection(remoteVatId, connection);

// 5. 创建第三方能力引用
const provisionId = generateProvisionId();
connectionManager.createPendingProvision(
  provisionId,
  recipientVatId,
  targetExportId,
  questionId,
  false // not embargoed
);

const thirdPartyCapId = createThirdPartyCapId(hostVatId, provisionId);
```

## 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    ConnectionManager                        │
├─────────────────────────────────────────────────────────────┤
│  connections: Map<vatId, ConnectionInfo>                    │
│  pendingProvisions: Map<provisionId, PendingProvision>      │
├─────────────────────────────────────────────────────────────┤
│  + registerConnection(vatId, connection)                    │
│  + getConnection(vatId): Promise<Connection>                │
│  + createPendingProvision(...): PendingProvision            │
│  + resolveThirdPartyCap(id): {connection, provisionId}      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     Level3Handlers                          │
├─────────────────────────────────────────────────────────────┤
│  connection: RpcConnection                                  │
│  connectionManager: ConnectionManager                       │
├─────────────────────────────────────────────────────────────┤
│  + handleProvide(provide): Promise<void>                    │
│  + handleAccept(accept): Promise<void>                      │
│  + handleDisembargo(disembargo): Promise<void>              │
│  + handleThirdPartyCapability(id): Promise<ImportId>        │
└─────────────────────────────────────────────────────────────┘
```

## 三方握手流程

```
Alice (A)          Carol (C)          Bob (B)
   │                  │                  │
   │──── Provide ────▶│                  │
   │   (target: C's   │                  │
   │    capability,   │                  │
   │    recipient: B) │                  │
   │                  │                  │
   │◀─── Return ──────│                  │
   │   (provisionId)  │                  │
   │                  │                  │
   │                  │◄──── Accept ─────│
   │                  │   (provisionId)  │
   │                  │                  │
   │                  │──── Return ────▶│
   │                  │   (capability)   │
   │                  │                  │
   │                  │◄──── Call ───────│
   │                  │   (direct!)      │
   │                  │                  │
```

## 下一步 (Phase 5)

根据用户要求，自动开始 Phase 5: 流控与实时。

### Phase 5 目标
实现流控与实时通信：
1. **Bulk/Realtime API**
   - 流控机制（背压）
   - 消息优先级
   - 丢弃策略（实时场景）

2. **UDP Transport**
   - 零往返三方握手
   - 实时通信支持

3. **加密传输**
   - Noise Protocol 集成
   - libsodium 加密

## 参考文档
- [官方 RPC 文档](https://capnproto.org/rpc.html)
- [rpc.capnp 协议定义](https://github.com/capnproto/capnproto/blob/master/c++/src/capnp/rpc.capnp)
- [CapTP: The Four Tables](http://www.erights.org/elib/distrib/captp/4tables.html)
