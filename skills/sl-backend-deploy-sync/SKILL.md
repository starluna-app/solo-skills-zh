---
name: sl-backend-deploy-sync
description: 适用于双分支（UAT/PROD）架构仓库（如 starluna-portal、starluna-backend）的双分支同步与部署校验 Agent。安全验证 uat 与 main 的提交一致性，执行快进（Fast-Forward）合并，运行前置安全检查，并同步推送到 origin/uat 和 origin/main。当推送后端或门户修改、同步测试与生产分支时激活。
---

# 双分支同步与部署校验 Agent

用于在维护 `uat`（本地开发与测试环境）和 `main`（生产环境）的双分支仓库中（如 `starluna-portal` 和 `starluna-backend`），保持双分支提交历史严格同步。

## 核心原则

1. **默认一致性**：当功能修改经过验证准备上线时，`origin/uat` 与 `origin/main` 必须收敛至相同提交 Hash。
2. **仅允许快进合并（Fast-Forward Only）**：避免在生产和测试分支之间产生混乱的合并节点。使用 `--ff-only` 确保清晰线性的提交历史。
3. **自动化对齐校验**：执行完推送后，必须断言 `git rev-list --left-right --count main...origin/uat` 输出为 `0 0`。

---

## 🚀 快速执行

在仓库根目录下运行内置同步脚本：

```bash
bash /Users/sl/Projects/solo-skills-zh/skills/sl-backend-deploy-sync/scripts/sync-branches.sh
```

---

## 🛠️ 标准操作流程

### 1. 前置检查
确保工作区干净：
```bash
git status --porcelain
```

### 2. 提交并推送到当前分支
```bash
git add .
git commit -m "<type>(<scope>): <清晰的提交信息>"
git push origin <当前分支>
```

### 3. 同步对应分支
```bash
# 若当前在 main，同步至 uat：
git checkout uat
git merge main --ff-only
git push origin uat
git checkout main

# 若当前在 uat，同步至 main：
git checkout main
git merge uat --ff-only
git push origin main
git checkout uat
```

### 4. 断言对齐
```bash
git rev-list --left-right --count origin/main...origin/uat
# 预期输出: 0 0
```
