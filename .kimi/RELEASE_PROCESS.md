# @naeemo/capnp 发布流程

## 版本发布步骤

### 1. 准备工作
- 确保所有测试通过
- 更新版本号 (`package.json`)
- 更新 `CHANGELOG.md`
- 提交所有更改到 main 分支

### 2. 创建 Git Tag
```bash
git tag v0.4.0
git push origin v0.4.0
```

### 3. 创建 GitHub Release

#### 方式一：使用 GitHub API（推荐）

**获取 GitHub Token**:
```bash
cd /root/.openclaw/workspace/capnp-ts
export GITHUB_TOKEN=$(git config --get remote.origin.url | sed 's/.*github_pat_/github_pat_/' | sed 's/@.*//')
```

**创建 Release**:
```bash
curl -X POST \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/Naeemo/capnp/releases \
  -d '{
    "tag_name": "v0.4.0",
    "name": "v0.4.0 - 版本标题",
    "body": "发布说明...",
    "draft": false,
    "prerelease": false
  }'
```

#### 方式二：手动创建
访问 https://github.com/Naeemo/capnp/releases/new?tag=v0.4.0

填写信息后点击 "Publish release"

### 4. 自动触发 CI/CD
创建 Release 后会自动触发 `.github/workflows/ci.yml` 中的 `publish` job：

```yaml
publish:
  needs: test
  runs-on: ubuntu-latest
  if: github.event_name == 'release'  # 仅在 release 事件时触发
  steps:
    # ... 安装依赖、构建
    - run: npm publish --access public
      env:
        NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### 5. 验证发布
- 检查 GitHub Actions 运行状态: https://github.com/Naeemo/capnp/actions
- 验证 npm 包已更新: `npm view @naeemo/capnp version`

## Token 管理

### GitHub Token 位置
- **存储**: `.kimi/SECRETS.md` (已添加到 .gitignore，不会提交)
- **来源**: 项目 git config (remote.origin.url)
- **提取命令**:
  ```bash
  git config --get remote.origin.url | sed 's/.*github_pat_/github_pat_/' | sed 's/@.*//'
  ```

### 如果 Token 失效
1. 访问 https://github.com/settings/tokens
2. 生成新的 Personal Access Token (classic)
3. 权限: `repo` 和 `workflow`
4. 更新 git remote URL:
   ```bash
   git remote set-url origin https://Naeemo:NEW_TOKEN@github.com/Naeemo/capnp.git
   ```

## 当前 CI 配置

文件: `.github/workflows/ci.yml`

触发条件:
- push 到 main 分支
- pull_request 到 main 分支
- release 创建事件

publish job 依赖:
- test job 成功
- 事件类型为 release

## 注意事项

1. **不要手动运行 `npm publish`** - 由 CI 自动处理
2. **确保 NPM_TOKEN secret 已配置** - 在仓库 Settings > Secrets 中
3. **版本号一致性** - package.json 和 git tag 必须匹配
4. **CHANGELOG 更新** - 每次发布前更新 CHANGELOG.md
5. **Token 安全** - 永远不要提交 token 到 git

## 发布历史

| 版本 | 日期 | 主要特性 |
|------|------|---------|
| v0.4.0 | 2026-03-02 | Level 3-4 RPC, Streaming API |
| v0.3.0 | 2026-03-02 | Level 0-2 RPC |
| v0.2.0 | 2026-03-02 | V3 Code Generator |
| v0.1.0 | 2026-02-28 | Initial Release |
