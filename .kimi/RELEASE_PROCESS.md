# @naeemo/capnp 发布流程（详细版）

**最后更新**: 2026-03-05  
**血泪教训**: 漏 push main 分支会导致 CI 发布旧版本！

---

## 前置检查清单（必须逐项确认）

### 1. 代码状态检查
```bash
# 检查当前分支和状态
git branch              # 必须在 main 分支
git status              # 必须是 clean 状态
git log --oneline -3    # 确认最后一次 commit 正确
```

### 2. 测试检查（本地）
```bash
# 所有测试必须通过
npm test
# 预期结果: Test Files 全部 passed
```

### 3. 类型检查
```bash
npm run typecheck
# 预期结果: 无错误
```

### 4. 版本号确认
```bash
# 检查 package.json
grep '"version"' package.json
# 预期结果: 新版本号，例如 "0.9.1"
```

---

## 详细发布步骤（不要跳过任何一步）

### 步骤 1: 确认所有代码已 commit
```bash
git add -A
git commit -m "chore(release): vX.Y.Z - 发布说明"
```

### 步骤 2: **推送 main 分支到远程（关键！）**
```bash
# ⚠️ 这一步经常被遗漏！⚠️
git push origin main

# 验证 push 成功
git log --oneline origin/main -1
# 确认显示的 commit hash 和本地一致
```

### 步骤 3: 创建 Git Tag
```bash
# 删除本地旧 tag（如果有）
git tag -d v0.9.1 2>/dev/null

# 创建新 tag
git tag v0.9.1

# 验证 tag 创建
git tag | grep v0.9.1
```

### 步骤 4: **推送 Tag 到远程（关键！）**
```bash
# 强制推送 tag（因为可能已经存在）
git push origin v0.9.1 --force

# 验证 tag 推送成功
git ls-remote --tags origin | grep v0.9.1
```

### 步骤 5: 创建 GitHub Release（触发 CI）

使用 `gh` CLI（已认证）：
```bash
gh release create v0.9.1 \
  --title "v0.9.1 - 版本标题" \
  --notes "## What's New
  - 特性 1
  - 特性 2" \
  --target main
```

或使用 GitHub API：
```bash
export GITHUB_TOKEN=$(git config --get remote.origin.url | grep -o 'github_pat_[^@]*')

curl -X POST \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/Naeemo/capnp/releases \
  -d '{
    "tag_name": "v0.9.1",
    "name": "v0.9.1 - 版本标题",
    "body": "## What'\''s New\n- 特性 1\n- 特性 2",
    "draft": false,
    "prerelease": false
  }'
```

### 步骤 6: 监控 CI/CD 运行
```bash
# 查看最近运行
gh run list --limit 5

# 持续监控（每 10 秒刷新）
watch -n 10 'gh run list --limit 3'

# 查看详细日志（替换 ID）
gh run view 22703810305 --log
```

---

## 验证发布成功

### 1. 检查 GitHub Actions
- 访问: https://github.com/Naeemo/capnp/actions
- 确认 CI/CD workflow 全部绿色 ✓

### 2. 检查 npm 发布
```bash
# 等待 2-3 分钟后检查
npm view @naeemo/capnp version
# 应该显示新版本号
```

### 3. 检查 GitHub Release
- 访问: https://github.com/Naeemo/capnp/releases
- 确认新版本在列表中

---

## 常见错误及修复

### 错误 1: `pnpm-lock.yaml not up to date`
**原因**: package.json 改了但 lock 文件没更新  
**修复**:
```bash
pnpm install
git add pnpm-lock.yaml
git commit -m "fix: update pnpm-lock.yaml"
git push origin main
```

### 错误 2: `Property 'xxx' does not exist on type 'xxx'`
**原因**: TypeScript 类型错误  
**修复**:
```bash
npm run typecheck  # 本地先修复所有类型错误
# 修复后 commit push
```

### 错误 3: `You cannot publish over the previously published versions`
**原因**: npm 上已有相同版本号  
**修复**:
```bash
# 检查当前版本
grep '"version"' package.json

# 如果已发布，升级版本号
# 手动编辑 package.json 或使用 npm version
npm version patch  # 或 minor, major

# 然后重新走完整流程
```

### 错误 4: CI 运行但发布的是旧代码
**原因**: 忘了 push main 分支！  
**修复**:
```bash
# 立即 push
git push origin main

# 删除并重新创建 tag
git tag -d v0.9.1
git push origin :refs/tags/v0.9.1  # 删除远程 tag
git tag v0.9.1
git push origin v0.9.1 --force

# 重新触发 release
gh release delete v0.9.1 -y
gh release create v0.9.1 --title "..." --notes "..."
```

---

## 一键脚本（备用）

```bash
#!/bin/bash
set -e

VERSION="$1"
if [ -z "$VERSION" ]; then
    echo "Usage: $0 <version>"
    echo "Example: $0 0.9.1"
    exit 1
fi

echo "=== 发布 v$VERSION ==="

# 1. 测试
echo "Running tests..."
npm test

# 2. 类型检查
echo "Type checking..."
npm run typecheck

# 3. 确保 clean
echo "Checking git status..."
if [ -n "$(git status --porcelain)" ]; then
    echo "Error: Uncommitted changes!"
    exit 1
fi

# 4. 更新版本号（手动确认）
echo "Current version:"
grep '"version"' package.json
echo "Update version to $VERSION in package.json, then press enter"
read

# 5. Commit
git add package.json
git commit -m "chore(release): v$VERSION"

# 6. **Push main（关键！）**
echo "Pushing main branch..."
git push origin main

# 7. Tag
git tag -d "v$VERSION" 2>/dev/null || true
git tag "v$VERSION"
git push origin "v$VERSION" --force

# 8. Release
echo "Creating GitHub Release..."
gh release create "v$VERSION" \
    --title "v$VERSION" \
    --notes "Release v$VERSION"

echo "=== Done! Monitor at https://github.com/Naeemo/capnp/actions ==="
```

---

## 关键记忆点

1. **Push main 分支** → 这是最容易漏的！
2. **创建 Tag** → 对应 release 版本
3. **Push Tag** → 触发 CI/CD
4. **创建 GitHub Release** → 正式触发 publish job
5. **验证 npm** → 最后确认

**记住**: 修改 package.json 版本后，一定要 `git push origin main`！

---

*血泪教训: 2026-03-05 发布 v0.9.1 时，连续 4 次忘记 push main 分支*
