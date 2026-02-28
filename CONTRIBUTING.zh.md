# 贡献指南

感谢你的贡献兴趣！本项目由 **Naeemo** 和 **Kimi** 共同开发。

## 如何贡献

### 报告问题

- 使用 GitHub Issues 报告 bug 或请求功能
- 包含最小复现案例
- 描述预期行为与实际行为

### 提交更改

1. Fork 仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 进行更改
4. 运行测试 (`npm test`)
5. 提交清晰的 commit 信息
6. 推送到你的 fork
7. 发起 Pull Request

### 开发环境

```bash
# 克隆仓库
git clone https://github.com/YOUR_USERNAME/capnp-ts.git
cd capnp-ts

# 安装依赖
npm install

# 运行测试
npm test

# 构建
npm run build
```

### 代码风格

- 遵循现有 TypeScript 规范
- 提交前运行 `npm run lint`
- 为新功能添加测试
- 按需更新文档

### Commit 信息

使用清晰、描述性的 commit 信息：

```
feat: 添加 packed 编码支持
fix: 正确处理空指针
docs: 更新 API 文档
test: 添加大列表基准测试
```

## 有问题？

在 GitHub 上开启 issue 或 discussion。

## 许可证

通过贡献，你同意你的贡献将在 MIT 许可证下授权。
