---
name: auto-pr-merger
description: 自动拉取开启的 Pull Requests，运行 lint 和 format，在 main 分支上执行 rebase 并尝试解决基本冲突。如果没有发现问题，则自动将其合并到 main 分支。当用户说“合并所有 PR”、“处理 PR”、“自动 rebase 并合并”时触发此技能。
---
# 自动 PR 合并助手 (Auto PR Merger)

此技能为 AI Agent 提供了一套系统化的工作流，使其能够像工程师一样，自动化审查并合并代码仓库中开启的 Pull Requests (PRs)。

## 核心工作流

当该技能被触发时，请严格按照以下步骤依次执行：

### 1. 获取 Open PR 列表
使用 GitHub CLI (`gh pr list`) 获取当前仓库中所有状态为 open 的 PR。如果没有开启的 PR，告知用户并结束任务。

### 2. 逐一处理 PR
对列表中的每个 PR 循环执行以下操作：

#### 2.1 检出 PR 分支
- 在本地检出该 PR 对应的分支 (`gh pr checkout <pr-number>`)。

#### 2.2 Rebase 到 main 分支
- 拉取最新的 `main` 分支代码 (`git fetch origin main`)。
- 将当前 PR 分支 rebase 到 `main` 分支之上 (`git rebase origin/main`)。

#### 2.3 解决基本冲突
- 如果 rebase 过程中产生冲突，请尝试自动解决基本冲突（依靠你对代码的理解）。
- **如果冲突过于复杂或不确定如何安全解决**：请终止 rebase (`git rebase --abort`)，在 PR 下留言说明存在复杂冲突需要人工介入，并跳过此 PR，继续处理下一个。

#### 2.4 运行 Lint 与格式化
- 识别项目使用的包管理器和构建工具（如 npm, yarn, cargo 等）。
- 运行项目中配置的 lint 和 format 脚本（例如 `npm run lint`, `npm run format` 等）。
- 如果检查失败，尝试自动修复（例如添加 `--fix` 参数）。
- 修复后提交更改，如果仍有无法自动修复的严重错误，则将修改推送到 PR，并在 PR 下留言报错信息，跳过此 PR。

#### 2.5 运行测试（强烈推荐）
- 如果项目中存在单元测试配置，请运行它们（如 `npm test`）。
- 如果测试失败，在 PR 下附上错误日志并留言，跳过该 PR。

#### 2.6 合并 PR
- 如果上述所有步骤（Rebase、Lint、Format、Test）都成功通过，强制推送到远程分支 (`git push --force-with-lease`)。
- 使用 GitHub CLI 将该 PR 合并到 `main` 分支，并删除原分支 (`gh pr merge <pr-number> --rebase --delete-branch`)。

### 3. 输出汇总报告
处理完所有开启的 PR 后，给用户输出一份简短的 Markdown 报告：
- **成功合并的 PR**：列出编号和标题。
- **跳过的 PR**：列出编号、标题及跳过原因（冲突、Lint 失败、测试失败等）。
