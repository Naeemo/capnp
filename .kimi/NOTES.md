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

### P1: 文档完善 ✅ **已完成**

**已完成**:
- ✅ docs/index.md 文档入口
- ✅ getting-started.md 快速入门
- ✅ guides/rpc.md RPC 使用指南
- ✅ guides/codegen.md 代码生成器文档
- ✅ guides/dynamic-schema.md 动态 Schema 指南
- ✅ guides/streaming.md 流控制指南
- ✅ best-practices/performance.md 性能优化
- ✅ best-practices/error-handling.md 错误处理

**待完成**:
- [ ] api/ 自动生成 API 参考（typedoc）- 低优先级

### P2: Bug 修复 ✅ **已完成**

**已完成**:
- ✅ 边界检查：Segment/StructReader 越界保护
- ✅ 12 个边界测试全部通过
- ✅ 无效输入处理（空 buffer、畸形指针）
- ✅ RPC 错误处理改进（连接、超时、错误消息）

**核心修复**:
- Segment/StructReader 添加边界检查
- EzRpcTransport 错误处理完善
- 越界访问返回默认值而非崩溃

### P3: 性能测试 ✅ **已完成**

**已完成**:
- ✅ 基础性能测试（10个场景）
- ✅ 与 JSON 对比测试
- ✅ docs/benchmarks.md 性能报告

**关键数据**:
- 反序列化: 1-3μs (85万 ops/sec)
- vs JSON: 小数据量 JSON 快，大数据量 Capnp 优势明显
- 414个测试全部通过

---

## 今日成果 (2026-03-03)

**代码**: 8 commits, 修复边界检查、RPC错误处理
**文档**: 8篇核心文档完成
**测试**: 12个新边界测试，414个总测试通过
**性能**: 完整基准测试和对比报告

---

## 下一步

**可选方向**:
1. **API 参考生成** - typedoc 自动生成
2. **浏览器支持** - WebSocket-to-TCP 代理
3. **JSON 编解码器** - Capnp <-> JSON 转换
4. **更多示例** - 实际应用场景

---

## 快速参考

```bash
# 运行测试
npm test

# 运行性能测试
npx tsx src/bench/benchmark.ts
npx tsx src/bench/comparison.ts

# 提交进度
git add -A && git commit -m "wip: ..." && git push
```

---

## 维护者

- Naeemo <naeemo@qq.com>
- Kimi (AI assistant)

*最后更新: 2026-03-03*
