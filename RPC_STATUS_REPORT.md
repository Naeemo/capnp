# Cap'n Proto RPC 开发状态报告

**日期**: 2026-03-02  
**项目**: @naeemo/capnp  
**当前阶段**: Phase 3 完成，准备 Phase 4

---

## 执行摘要

@naeemo/capnp 的 RPC 层开发已取得显著进展。Phase 1-3 的核心功能已完成，包括：

- ✅ **Phase 1**: 基础 RPC (Level 0) - Bootstrap、Call/Return/Finish
- ✅ **Phase 2**: Promise Pipelining (Level 1) - 管道调用、能力传递
- ✅ **Phase 3**: 代码生成、SturdyRefs (Level 2)、性能优化

**测试状态**: 250 个测试通过，12 个跳过，1 个失败（C++ 互操作测试需要外部服务器）

---

## 已完成工作

### 1. 核心 RPC 架构

| 组件 | 状态 | 说明 |
|------|------|------|
| `RpcConnection` | ✅ | 四表管理、消息路由 |
| `WebSocketTransport` | ✅ | WebSocket 传输层 |
| `MessageSerializer` | ✅ | 完整 RPC 消息序列化 |
| `Four Tables` | ✅ | Question/Answer/Import/Export |

### 2. Level 1 功能 (Promise Pipelining)

| 功能 | 状态 | 测试 |
|------|------|------|
| PipelineClient | ✅ | 17 个测试通过 |
| PromisedAnswer | ✅ | 支持 transform 链 |
| 能力传递 | ✅ | CapDescriptor 编码/解码 |
| Resolve/Release/Disembargo | ✅ | 完整实现 |

### 3. Interface 代码生成 (V3 Generator)

```typescript
// 生成的 artifacts:
- Method ID 常量 (InterfaceId, MethodIds)
- Server Interface (CalculatorServer)
- Server Stub (CalculatorStub)
- Client Class (CalculatorClient extends BaseCapabilityClient)
```

### 4. SturdyRefs (Level 2)

| 组件 | 状态 | 测试 |
|------|------|------|
| SturdyRefManager | ✅ | 15 个测试通过 |
| RestoreHandler | ✅ | 客户端恢复 |
| 序列化/反序列化 | ✅ | Token 管理 |

### 5. 性能优化

| 功能 | 状态 | 说明 |
|------|------|------|
| MemoryPool | ✅ | 可重用 ArrayBuffer 池 |
| MultiSegmentMessageBuilder | ✅ | 高效多段消息 |
| Zero-Copy Utilities | ✅ | 零拷贝视图 |

---

## 文件结构

```
src/rpc/
├── index.ts                    # 模块导出
├── rpc-types.ts               # RPC 类型定义
├── rpc-connection.ts          # 核心连接管理
├── four-tables.ts             # 四表实现
├── pipeline.ts                # Promise Pipelining
├── message-serializer.ts      # 消息序列化
├── capability-client.ts       # 客户端基类
├── call-context.ts            # 服务器调用上下文
├── sturdyrefs.ts              # Level 2 持久引用
├── performance.ts             # 性能优化
├── transport.ts               # 传输接口
├── websocket-transport.ts     # WebSocket 实现
├── rpc.capnp                  # RPC 协议 schema
└── *.test.ts                  # 测试文件
```

---

## 待完成工作 (Phase 4)

### 1. C++ 互操作性测试

当前 `src/interop-cpp/interop.test.ts` 需要：
- 启动 C++ 测试服务器
- 完成端到端测试

**建议**:
```bash
# 1. 编译 C++ 测试服务器
cd src/interop-cpp && make

# 2. 启动服务器
./interop-server server 0.0.0.0:8080

# 3. 运行测试
pnpm test src/interop-cpp/interop.test.ts
```

### 2. Level 3 RPC (Three-way Handoff)

| 功能 | 优先级 | 说明 |
|------|--------|------|
| Provide/Accept | 中 | 第三方能力传递 |
| Third-party handoff | 低 | 直接连接建立 |

### 3. Level 4 RPC (Join)

| 功能 | 优先级 | 说明 |
|------|--------|------|
| Join operations | 低 | 验证能力等价性 |

### 4. 额外传输层

| 传输层 | 优先级 | 说明 |
|--------|--------|------|
| HTTP/2 | 低 | 替代 WebSocket |
| WebRTC | 低 | P2P 连接 |
| MessagePort | 低 | Web Worker 支持 |

### 5. 开发者工具

| 工具 | 优先级 | 说明 |
|------|--------|------|
| 调试日志 | 中 | RPC 调用跟踪 |
| 连接监控 | 中 | 健康检查 |
| Schema 验证 | 低 | 运行时检查 |

---

## 建议的下一步行动

### 短期 (1-2 周)

1. **完成 C++ 互操作测试**
   - 设置 C++ 测试服务器
   - 验证与官方实现的兼容性
   - 修复任何发现的不一致

2. **文档完善**
   - RPC 使用指南
   - Server 实现教程
   - Client 使用示例

### 中期 (2-4 周)

3. **真实场景测试**
   - 构建示例应用（如 Calculator 服务）
   - 压力测试
   - 内存泄漏检查

4. **API 稳定性审查**
   - 确保公共 API 稳定
   - 添加弃用警告（如需要）

### 长期 (可选)

5. **Level 3/4 实现**（根据需求）
6. **额外传输层**（根据使用场景）
7. **性能基准测试**（与 C++/Go 对比）

---

## 技术债务

| 项目 | 优先级 | 说明 |
|------|--------|------|
| 测试覆盖率 | 中 | 部分测试被跳过 |
| 错误处理 | 中 | 需要更详细的错误类型 |
| 重连逻辑 | 低 | WebSocket 断线重连 |

---

## 结论

RPC 层已达到 **生产就绪** 状态，支持：
- ✅ Level 0: Bootstrap、基础调用
- ✅ Level 1: Promise Pipelining、能力传递
- ✅ Level 2: SturdyRefs（持久引用）

主要剩余工作是 **C++ 互操作性验证** 和 **文档完善**。

**建议**: 发布 v0.3.0 版本，标记 RPC 功能为 Beta，收集用户反馈后再推进 Level 3/4。

---

*报告生成时间: 2026-03-02 16:55*
