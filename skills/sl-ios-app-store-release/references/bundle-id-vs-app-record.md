# Bundle ID vs App Record vs Display Name — 命名层次详解

iOS 应用涉及 6 个名字字段，每个的作用、限制、可见性不同。新手最常混淆。

---

## 6 个名字字段一览

| 字段 | 来源 | 用户可见？ | 可编辑？ | 限制 |
|---|---|---|---|---|
| **Bundle ID** | Developer Portal + Xcode | ❌ | 一旦上架永不可改 | 全球唯一，反向 DNS 格式 |
| **App Record Name** (App Store 名) | App Store Connect | ✅ App Store 列表 / 搜索 | 每版本可改 | ≤30 字符 |
| **Subtitle** | App Store Connect | ✅ App Store 列表 | 每版本可改 | ≤30 字符 |
| **Display Name** (CFBundleDisplayName) | Xcode build setting | ✅ 主屏幕图标下 | 每版本可改 | ≤12 字符前不被截断 |
| **Bundle ID Description** | Developer Portal | ❌ | 随时可改 | 仅团队成员可见 |
| **Company Name** (Seller) | Developer enrollment | ✅ App Store "Seller" 字段 | 走 Apple 客服改 | 法人主体名 |

---

## 关键区分

### Bundle ID ≠ App Record

- **Bundle ID** 是技术标识符。Apple 后端用来认你的 app 是哪一个。生成密钥、配对推送、认 IAP、回调 OAuth、签名校验都靠它。
- **App Record** 是 App Store Connect 里的"产品页"对象。包含截图、描述、价格、版本、审核状态。
- 关系：1 个 Bundle ID 对应 1 个 App Record。但你**先**注册 Bundle ID（在 Developer Portal），**后**创建 App Record（在 App Store Connect），后者从下拉菜单引用前者。

### App Record Name ≠ Display Name

经典 Zillow 模式：
- App Store 列表里显示：**"Zillow Real Estate & Rentals"**（App Record Name，30 字符）
- 主屏幕图标下显示：**"Zillow"**（Display Name，简洁品牌）

为什么这样设计？
- App Store 搜索算法看 App Record Name + Subtitle 里的关键词
- 主屏幕字数有限，长名字会被截断成 "Zillow R…"
- 用户在 App Store 看到长名字（搜索曝光），装上后看到短品牌（无杂音）

**ASO 最佳实践**：
- App Record Name = `<品牌>: <核心价值/品类关键词>`（25 字符内最稳）
- Display Name = `<品牌>` only
- Subtitle = 完全不同的关键词组合（不和 Name 重叠）

### Bundle ID Description 是"内部标签"

注册 Bundle ID 时 Apple 让填 Description。这个字段：
- 只在 Developer Portal 的 Identifiers 列表里给团队成员看
- 不展示给终端用户
- 不影响 App Store
- 可以随时改

如果你有 widget / share extension / watch companion 等多个 bundle ID，Description 用来快速分辨：
```
app.starluna.lunabee.ios         → "Luna Bee"
app.starluna.lunabee.ios.widget  → "Luna Bee Widget"
app.starluna.lunabee.ios.share   → "Luna Bee Share Extension"
```

单 target app → 写 app 名即可。

### Company Name = Seller，绑定 enrollment

- App Store 产品页底部 "Information" 里有 "Seller: XXX"
- 这个字段来自你的 Apple Developer Program enrollment
- Individual enrollment → 你的法定姓名
- Organization enrollment → LLC / Inc. 名（D-U-N-S 验证过的）
- 想改 → 走 Apple 客服走流程，不是开发者可改的

---

## SKU — 不是名字，但也在这套字段里

**SKU** = 永久不变的内部标识符，仅在你的 ASC 报表里出现。

- ❌ 不要加版本号（`-v1`、`-2.0`）
- ❌ 不要变（一个 app 一个 SKU，永久）
- ✅ 推荐 `<product>-<platform>`，如 `LUNABEE-IOS`

如果你以后做了第二个 app，那个 app 有自己的 SKU。

---

## 实际命名表（以 Luna Bee 为例）

| 字段 | 值 |
|---|---|
| Bundle ID | `app.starluna.lunabee.ios` |
| Bundle ID Description | `Luna Bee` |
| App Record Name | `Luna Bee: Family Organizer` |
| Subtitle | `Plan Routines, Track Growth` |
| Display Name (CFBundleDisplayName) | `Luna Bee` |
| Company Name (Seller) | `StarLuna LLC` |
| SKU | `LUNABEE-IOS` |

---

## 改名场景速查

| 想改什么 | 怎么改 | 代价 |
|---|---|---|
| 主屏幕图标下的名字 | Xcode `CFBundleDisplayName` build setting | 下个版本生效，零代价 |
| App Store 搜索结果显示名 | ASC web UI 或 `asc metadata push` 改 name 字段 | 下个版本生效，零代价 |
| Subtitle / Keywords | `asc metadata push` | 下个版本生效，零代价 |
| Bundle ID | 不能改。要"改"只能：发新 app（用户重新下载、订阅丢失） | 非常贵 |
| Seller 名（LLC 改名等） | 联系 Apple 客服走流程 | 中等代价，~2 周 |
