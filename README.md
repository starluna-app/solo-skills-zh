# 🚀 solo-skills-zh

![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)
![npm version](https://img.shields.io/badge/npm-v1.0.0-green.svg)

> **为一人公司（Solopreneur）和独立开发者（Indie Hacker）打造的开箱即用 AI Skill/Agent 库。**

`solo-skills-zh` 提供了一系列专为独立创业者设计的 AI 自动化技能。无论是竞品调研、跨平台文案生成，还是 YouTube 频道策划，你都可以通过终端直接调用，或者将它们无缝集成到你最喜欢的 AI IDE（如 Cursor、Windsurf）和 AI 助手（如 Claude Code、Gemini CLI）中。

## ✨ 核心特性

* **⚡️ 零配置运行**：无需繁琐的安装，直接通过 `npx` 即可在终端随时唤起。
* **🌍 中文支持**：所有技能均提供高质量中文（`zh-CN`）版本，适配中文语境下的 AI Agent。
* **🛠️ 专为独立开发者定制**：聚焦于“一人公司”的高频痛点（产品运营、全栈开发、市场营销、自动化工作流）。
* **📖 开源友好**：基于 Apache 2.0 协议，自由使用、修改和商用。

---

## 💻 官方验证支持的工具

以下 AI 客户端和 IDE 已通过官方测试，能够完美支持本库中的技能：

- **Gemini CLI**
- **Claude Code**
- **Cursor**
- **Windsurf**
- **Aider**

*注：如果您在其他工具中成功使用了本库的技能，欢迎提交 Issue 告诉我们！*

---

## 📦 安装与卸载

### 1. Claude Code & Gemini CLI (强烈推荐)
你可以直接将本库的技能添加到你的本地 Agent 技能目录中。

**安装 / 更新:**
```bash
# 适用于 Gemini CLI
npx skills add starluna-app/solo-skills/skills/youtube-channel-planner

# 适用于 Claude Code（安装在项目目录下）
# 或者手动将 SKILL.md 复制到项目的 .claude/skills/ 目录中。
```

**卸载:**
要移除某个技能，只需进入你的 `~/.gemini/skills/` 或项目内的 `.claude/skills/` 目录，删除对应的文件夹即可。

### 2. 作为独立 CLI 使用 (通过 npx)
无需全局安装，在任何终端中输入以下命令即可运行：
```bash
npx solo-skills
```


## 🧰 包含的 Skills 示例

目前内置了以下开箱即用的独立开发者必备套件：

| Skill 命令 | 描述 | 应用场景 |
| :--- | :--- | :--- |
| `youtube-channel-planner` | YouTube 频道创建策划 (AI 驱动版)，利用 NotebookLM 构建高信息密度的自动化内容频道 | 创作者经济与自媒体变现 |
| `social-writer` | 将一段核心产品更新转化为 Xiaohongshu、Reddit 等多平台适配文案 | 宣发与社区增长 |
| `market-research` | 输入一个利基市场(Niche)，自动检索并总结该领域的最新竞品动态 | 早期点子验证 |
| `seo-optimizer` | 分析 Markdown/HTML 内容，提取长尾关键词并优化页面结构 | 流量获取与转化 |

---

## 💖 赞助 (Sponsorship)

如果 `solo-skills` 帮你节省了时间、加速了点子验证，或是为你的“一人公司”带来了收入，请考虑赞助本项目！你的支持是我们持续维护并探索新自动化工作流的动力。

*   [通过 GitHub Sponsors 赞助我们 🌟](https://github.com/sponsors/starluna-app)

## 📄 许可证 & 归属

本项目基于 **Apache License 2.0** 协议开源 - 详情请查看 [LICENSE](LICENSE) 文件。

---
**由 [StarLuna LLC](https://starluna.app) 倾力打造**
*为教育创新和独立创造者构建下一代工具与平台。*