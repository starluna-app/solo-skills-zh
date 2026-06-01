# ASO Checklist — App Store 搜索优化

每个新 app 上架前最少做这一份。

---

## 字段权重（Apple 算法已知部分）

按对搜索排名影响从大到小：

1. **App Record Name** — 最高权重
2. **Subtitle** — 次高
3. **Keywords**（开发者私有字段，用户看不到）
4. **In-App Purchase 名称**（如果有订阅产品）
5. **Description** — 最低，几乎不被索引（高转化率字段，不是高排名字段）
6. Promotional Text — 不被索引，但显示在 description 上面

**Apple 算法不在乎**：
- 截图标注里的文字
- App 内文案
- Reviews / Ratings 里的关键词（虽然有间接影响）
- App Privacy 字段

---

## 字段填写规则

### Name（30 字符）
- 格式：`<品牌>: <核心关键词组>`
- 例：`Luna Bee: Family Organizer`、`Notion: Notes & Tasks`、`Headspace: Sleep & Meditation`
- ❌ 不要堆关键词：`Luna Bee - Family - Kids - Routines - Hub`
- ❌ 不要骗 Apple：`Best Family App #1 Top Rated` 会被拒

### Subtitle（30 字符）
- 用和 Name 完全不同的关键词
- 例：`Plan Routines, Track Growth`（如果 Name 已有 "Family Organizer"）
- ❌ 不要重复 Name 的词：`Luna Bee: Family Organizer` + `Family Organizer & Hub` —— 浪费

### Keywords（100 字符，逗号分隔）
- ❌ 没空格：用 `kids,parenting,toddler`，不是 `kids, parenting, toddler`
- ❌ 不要重复 Name / Subtitle 里出现的词
- ❌ 不要用复数（Apple 自动匹配单复数）
- ❌ 不要用品类大词（"app"、"free"）
- ✅ 高意图、长尾、用户真搜的词
- ✅ 想象用户在搜索框输入什么——"chores tracker"、"family schedule" 比 "amazing" 强

### Promotional Text（170 字符）
- 不影响搜索，但显示在 description 顶部
- 用来放限时优惠、新功能、活动等可频繁更新的内容（不需要重新审核）

### Description（4000 字符）
- 用来转化（让看到的人下载），不是用来排名
- 前 2 行最重要——iOS 上 description 默认折叠，用户看不到"更多"
- 用 ALL CAPS 段标题（`HOME — Your family command center`）增加可扫描性
- 末尾必带：privacy policy URL + terms URL + subscription terms（如有订阅）

---

## 类别选择决策

Primary + Secondary，影响 App Store 推荐位 / 分类榜。

### 常见类别 → 适合的 app 类型

| 类别 | 典型 app |
|---|---|
| Productivity | 笔记、任务管理、日历、家庭组织、密码管理 |
| Lifestyle | 习惯、日记、家庭相册、生活方式追踪 |
| Education | K-12 学习内容、语言学习、词典、考试备考 |
| Health & Fitness | 运动、冥想、睡眠、健康追踪、医疗辅助 |
| Utilities | 计算器、单位换算、扫描、文件、工具类 |
| Photo & Video | 修图、滤镜、剪辑、相册 |
| Social Networking | 聊天、社交、社区 |
| Reference | 词典、地图、百科 |
| Business | B2B 工具、CRM、协作 |
| Finance | 记账、投资、银行、加密 |
| Entertainment | 视频、音乐、阅读、播客（非内容生成） |

### 决策原则
1. **看竞品的 primary 是什么**——同类应用扎堆在一个类别
2. **Family 类别要谨慎**：和"Made for Kids"挂钩，COPPA 合规要求大幅提升
3. **Education 也要谨慎**：如果 app 主要给家长用而非给孩子，更适合 Productivity / Lifestyle
4. **Secondary 选一个互补的**——不要选第二个相似类别

---

## 关键词竞争研究流程

```bash
# 1. 列出你的种子词
# kids, parenting, family, chores, habits, ...

# 2. 在 App Store 搜每个词，看：
#    - 排名前 5 的 app 谁
#    - 它们的 name / subtitle 用什么
#    - 评分数（>10K 说明竞争激烈）

# 3. 找到"高意图 + 中等竞争"的词放进你的 keywords / subtitle

# 4. ASO 工具（可选）
#    - Sensor Tower / data.ai：付费，重量级
#    - AppFollow / TheTool：中等
#    - 免费方法：搜索建议、自动补全、相关搜索
```

---

## Localization

如果你要做多语言：
- Name / Subtitle / Keywords 每种语言独立优化（不要直接翻译）
- 每种语言用本地用户实际搜的词
- 中文：简体（zh-Hans）和繁体（zh-Hant）分开
- 西语：墨西哥（es-MX）和西班牙（es-ES）分开
- 不建议机器翻译——本地 ASO 大词差很多

`asc metadata push` 支持多 locale，每个 `metadata/version/<v>/<locale>.json` 一个文件。

---

## 不要做的事

- ❌ 把竞品名塞到关键词里（"like Notion"、"alternative to Cozi"）—— 律函风险
- ❌ 滥用 Promotional Text 做关键词堆砌
- ❌ 反复改名想测试——每次改 ASO 排名会重新学习，几周才稳
- ❌ 假评论刷榜——Apple 检测+封号
