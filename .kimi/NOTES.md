# @naeemo/capnp 开发笔记

## 429 防护策略

**问题**: 主进程可能因 API 速率限制（429）而中断，导致开发流程停滞。

**对策**:

### 1. 定时保活任务（已部署）
- **频率**: 每 10 分钟
- **动作**: 检查开发状态，记录心跳
- **任务 ID**: `keepalive-capnp-dev`

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

### C++ 互操作测试 🐛
**问题**: TypeScript RPC 消息无法与 C++ EzRpc 服务器通信
**状态**: 调查中
**下一步**: 抓包分析 C++ 客户端与服务器的消息格式差异

### TCP 传输层 ✅
已实现，工作正常。问题在应用层消息格式。

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
