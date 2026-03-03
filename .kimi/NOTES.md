# @naeemo/capnp 开发笔记

## 429 防护策略

**问题**: 主进程可能因 API 速率限制（429）而中断，导致开发流程停滞。

**对策**:

### 1. 定时保活任务（已部署）
- **频率**: 每 10 分钟
- **动作**: 检查开发状态，记录心跳
- **任务 ID**: `capnp-dev-keepalive`

### 2. 子 Agent 任务拆分
对于长时间/复杂任务，使用 `sessions_spawn` 创建子 Agent：
- 大功能开发（如新的 RPC 层）
- 批量测试运行
- 文档生成

### 3. 开发断点保存
关键进展及时提交到 git：
```bash
git add -A && git commit -m "wip: ..."
git push origin main
```

### 4. 恢复流程
如果主进程中断：
1. 检查 git log 了解最后状态
2. 检查 .kimi/ 目录的笔记
3. 从上次提交继续

---

## 当前开发重点

### P2: Bug 修复 🚧 **进行中**

**已完成**:
- ✅ 边界检查：Segment/StructReader 越界保护
- ✅ 12 个边界测试全部通过
- ✅ 无效输入处理（空 buffer、畸形指针）

**进行中**:
- 🚧 MessageBuilder 内存管理
- 🚧 RPC 连接错误处理

**待完成**:
- [ ] 内存泄漏检查
- [ ] 连接断开检测
- [ ] 超时机制

### P2: Bug 修复 🐛 **待开始**

**方向**:
- 无效输入处理
- 多段消息边界情况
- 内存泄漏检查
- 错误信息优化

### P3: 性能测试 📊 **待开始**

**方向**:
- 序列化性能基准
- RPC 延迟测试
- 与 C++ 对比测试
- 内存使用分析

---

## C++ 互操作 ✅ **已完成**

**状态**: Node.js ↔ C++ 协议兼容已完成
**关键实现**: `src/rpc/ezrpc-transport.ts`

---

## 快速参考

```bash
# 启动 C++ 测试服务器
export LD_LIBRARY_PATH=/usr/lib/x86_64-linux-gnu
cd src/interop-cpp
./interop-server server 0.0.0.0:18080

# 运行互操作测试
CAPNP_TEST_HOST=localhost CAPNP_TEST_PORT=18080 \
  npx vitest run src/interop-cpp/interop.test.ts

# 提交进度
git add -A && git commit -m "wip: ..." && git push
```

---

## 维护者

- Naeemo <naeemo@qq.com>
- Kimi (AI assistant)

*最后更新: 2026-03-03*
