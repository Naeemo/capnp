# Cap'n Proto TypeScript Roadmap

> 基于官方路线图 https://capnproto.org/roadmap.html

## 已完成 ✅

### v0.7.0 (2026-03-04)
- JSON Codec - 双向转换，全类型支持
- Doc Comments → JSDoc 代码生成

### v0.8.0 (2026-03-04)
- Debug Mode - RPC 消息追踪、开发调试

### v0.8.1 (2026-03-04)
- 文档站点重构 - 层级导航、中英双语

---

## 计划中 📋

### v0.9.0 - 开发者工具
- [ ] Schema Compatibility Checker
  - 检查 schema 破坏性变更
  - 版本兼容性报告
  - CI/CD 集成

- [ ] RPC Debugger CLI (`capnp-rpc`)
  - 类似 curl 但用于 Cap'n Proto RPC
  - 交互式 RPC 调用
  - 消息捕获和分析

### v1.0.0 - 生产就绪
- [ ] 完整的错误处理改进
- [ ] 性能基准测试套件
- [ ] 安全审计
- [ ] 完整的 API 文档

---

## 未来方向 🚀

### Infrastructure (来自官方路线图)
- [ ] JSON-HTTP 代理
  - REST API ↔ Cap'n Proto 桥接
  - 渐进式迁移支持

- [ ] 数据库适配器
  - ORM 风格的 Cap'n Proto 存储

### C++ API Features
- [ ] LZ4 压缩支持
  - 减少传输带宽

### Quality Assurance
- [ ] 模糊测试 (Fuzzing)
- [ ] 内存泄漏检测
- [ ] 完整的类型覆盖测试

---

## 社区需求 💬

等待反馈的功能：
- WebSocket 浏览器端优化
- Deno/Bun 运行时支持
- 更多语言绑定工具

---

*最后更新: 2026-03-04*
