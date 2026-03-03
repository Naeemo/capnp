# @naeemo/capnp 发布流程

## 版本发布步骤

### 1. 准备工作
- [ ] 确保所有测试通过：`npm test`
- [ ] 更新版本号：`package.json`
- [ ] 更新 `CHANGELOG.md`
- [ ] 提交所有更改到 main 分支

### 2. 创建 Git Tag
```bash
cd /root/.openclaw/workspace/capnp
git tag v0.x.x
git push origin v0.x.x
```

### 3. 创建 GitHub Release

#### 方式一：使用 GitHub API（推荐）

**创建 Release**:
```bash
# Token 从 git remote URL 提取或从 GitHub Settings > Developer settings > Tokens 获取
export GITHUB_TOKEN=$(git config --get remote.origin.url | grep -o 'github_pat_[^@]*')

curl -X POST \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/Naeemo/capnp/releases \
  -d '{
    "tag_name": "v0.x.x",
    "name": "v0.x.x - 版本标题",
    "body": "发布说明...",
    "draft": false,
    "prerelease": false
  }'
```

#### 方式二：手动创建
访问 https://github.com/Naeemo/capnp/releases/new

### 4. 自动触发 CI/CD
创建 Release 后自动触发 `.github/workflows/ci.yml` 中的 `publish` job：

```yaml
publish:
  needs: test
  runs-on: ubuntu-latest
  if: github.event_name == 'release'
  steps:
    - run: npm publish --access public
      env:
        NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### 5. 验证发布
- 检查 GitHub Actions: https://github.com/Naeemo/capnp/actions
- 验证 npm: `npm view @naeemo/capnp version`

---

## Token 管理

### GitHub Token
- **位置**: 已嵌入在 git remote URL 中
- **提取**: `git config --get remote.origin.url`

### 如果 Token 失效
1. 访问 https://github.com/settings/tokens
2. 生成新的 PAT (classic)，需要 `repo` 权限
3. 更新 git remote:
   ```bash
   git remote set-url origin https://Naeemo:NEW_TOKEN@github.com/Naeemo/capnp.git
   ```

---

## 注意事项

1. **不要手动 `npm publish`** - 由 CI 自动处理
2. **确保 NPM_TOKEN secret 已配置** - 仓库 Settings > Secrets
3. **版本号一致性** - package.json 和 git tag 必须匹配
4. **CHANGELOG 更新** - 每次发布前更新
5. **Token 安全** - 永远不要提交 token 到 git

---

## 发布历史

| 版本 | 日期 | 主要特性 |
|------|------|---------|
| v0.5.0 | 2026-03-02 | Level 4 RPC 完整、动态 Schema |
| v0.4.0 | 2026-03-02 | Level 3-4 RPC、Streaming API |
| v0.3.0 | 2026-03-02 | Level 0-2 RPC |
| v0.2.0 | 2026-03-02 | V3 Code Generator |
| v0.1.0 | 2026-02-28 | Initial Release |
