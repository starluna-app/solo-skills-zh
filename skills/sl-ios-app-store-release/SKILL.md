---
name: sl-ios-app-store-release
description: iOS App Store 完整发布流程，从一个 Xcode 项目到提交审核（Submit for Review）。带人在环（human-in-the-loop）的决策点 + 用 asc CLI 自动化能自动化的所有 metadata、分类、age rating、价格、审核信息推送，并驱动 xcodebuild archive → IPA 导出 → 上传到 App Store Connect。当用户提到 "发布到 App Store"、"上架 iOS 应用"、"App Store Connect"、"asc release"、"提交审核"、"submit for review"、"archive + upload"、"App Privacy"、"App Store 截图"、"TestFlight 发布"、"App Review 拒审" 时使用此技能。前置依赖：已加入 Apple Developer Program（个人或组织），且 asc CLI 已安装。
---

# iOS App Store 发布工作流（v1.0 首次发布 + 后续迭代）

把一个 Xcode 项目 ship 到 App Store 是 10+ 个独立子流程。这个 skill 把它拆成 7 个阶段，每个阶段都标明哪些可以自动化、哪些必须人工决策、哪些是 Apple 一定要的 web UI 才能做的。

---

## 🎯 这个 skill 的设计原则

1. **先收集再执行**：在动手前把所有关键值（bundle ID、品牌名、ASO 关键词、价格、territories）问清楚，避免中途回头改。
2. **能 API 推送就 API 推送**：metadata、分类、age rating、价格、审核联系信息——全部用 `asc` CLI，不点 Web UI。
3. **Human-in-the-loop 在该卡的地方卡**：截图、App Privacy 发布、territory 初始化、Submit for Review——这些 Claude 不主动做，等用户确认。
4. **首次发布的坑统一在这里记**：避免下一次又踩一遍 personal-team vs LLC team、Aries 命名、API key 角色不够等问题。
5. **每个 release 独立追踪**：每次发版用 `.asc/releases/<version>.md` 单独记录进度。Claude 只读"最新版本"那一份文件，旧版本归档不打扰。

---

## 📋 Release 进度追踪机制

**核心思路**：每个项目根目录有 `.asc/releases/` 文件夹，每次发版（v1.0、v1.1、v2.0...）都有一份独立的进度文件。一个 `README.md` 作为索引，标明"Latest"指向哪个版本。

```
<project>/.asc/
├── app.env                 # 项目配置 + ASC API auth
├── artifacts/              # archive、IPA 统一放这里
│   ├── <scheme>.xcarchive
│   └── <scheme>.ipa
└── releases/
    ├── README.md           # 索引：Latest = 1.0；列出所有历史 release
    ├── 1.0.md              # 首发的进度文件
    ├── 1.1.md              # 第二次发版的进度文件
    └── 2.0.md              # 大版本……
```

### 进度文件长什么样

每个 `<version>.md` 是带 frontmatter 的 markdown，正文是分阶段的 checkbox：

```markdown
---
version: 1.0
build: 1
started: 2026-05-25
status: in_progress
---

# Release 1.0

## Stage 3: Metadata + config (API push)
- [x] Metadata pushed (name, subtitle, description, keywords, URLs, promo)
- [x] Categories set
- [x] Age rating set
- [ ] Pricing schedule created
...

## Blockers / Notes

### 2026-05-25
- Renamed StarLuna → Luna Bee across codebase.

### 2026-05-27
- exportArchive Cloud signing error; worked around by dropping -authenticationKey* args.
```

### 三个辅助命令

```bash
# 初始化某个版本的进度文件（创建 .asc/releases/<v>.md + 更新 README.md）
bash scripts/release-init.sh 1.0

# 看最新 release 现在卡在哪
bash scripts/release-status.sh

# 标记某项完成 / 撤销 / 加一条 dated 备注
bash scripts/release-mark.sh done "Metadata pushed"
bash scripts/release-mark.sh undo "Build processing complete"
bash scripts/release-mark.sh note "API key was App Manager role, swapped to Admin"
```

### Claude 怎么用

1. **开始任何 release 工作前**先跑 `release-status.sh`——它输出最新 release 的进度 + 当前卡的位置 + 最近的备注
2. **绝不读旧版本的 .md 文件**——索引里的"Latest"才是当前关注的
3. **每完成一步**自动调 `release-mark.sh done "..."`，避免人工 sync
4. **遇到阻塞**用 `release-mark.sh note "..."`，给未来的自己留信息

下次发布 v1.1 时：跑 `release-init.sh 1.1` → README 自动把 Latest 指向 1.1 → Claude 从 1.1.md 起步，不会看到 1.0.md 的细节噪音。

---

## 阶段 0：前置检查（必须先做）

**问用户的 5 个关键问题**（如果还没答案，停下等用户回答）：

1. **Apple Developer Program 是否已加入？** Individual / Organization (LLC 等)
   - Org 需要 D-U-N-S 号（免费，1-14 天通过 Apple 入口申请）
   - 没加入就别动了，跳到 [references/zero-day-enrollment.md](references/zero-day-enrollment.md)

2. **Bundle ID 想用什么？** 全球唯一，永久不可改。
   - 命名建议：`<reverse-domain>.<product>.<platform>`，例如 `app.starluna.lunabee.ios`
   - 即使你拥有 `starluna.app` 域名，Apple 不会因此让你独占 `app.starluna.*` 命名空间——这个 ID 还可能被别人占用（罕见但发生过）
   - 即使重名也可以加 `.ios` 后缀解决

3. **品牌名 / ASO 策略**：
   - 主屏幕显示名（Display Name，~12 字符）vs App Store 名（30 字符）vs Subtitle（30 字符）vs Keywords（100 字符）——四个独立字段
   - 关键字不要重复（浪费字符预算）
   - 详见 [references/aso-checklist.md](references/aso-checklist.md)

4. **是否有订阅 / In-App Purchase？**
   - 有 → bundle ID 需要勾 In-App Purchase capability
   - StoreKit product ID 不必和 bundle ID 完全对齐，但建议放在同一命名空间下

5. **iPad 支持？暗黑模式支持？**
   - iPhone-only → `TARGETED_DEVICE_FAMILY = "1"`
   - Light-only → 不需要在 Asset Catalog 准备 dark variant

**还需要询问的次要决策**（可以推后）：
- 价格策略：免费 / 订阅 / 一次性付费
- 上架地区：所有国家 / 美国 only / 英语圈
- 第一次提交是否走 TestFlight 内测

---

## 阶段 1：工具 & 鉴权

```bash
# 安装 asc CLI（如果还没装）
brew install asc

# 创建 App Store Connect API Key
# https://appstoreconnect.apple.com/access/integrations/api
# 角色：Admin（推荐）或 Developer。⚠️ 不要用 App Manager——它没有
# Cloud Signing 权限，xcodebuild -exportArchive 会失败。
# 下载 .p8 文件（只能下一次）

# 把 .p8 放到安全位置
mkdir -p ~/.appstoreconnect
mv ~/Downloads/AuthKey_XXXXXXXXXX.p8 ~/.appstoreconnect/
chmod 600 ~/.appstoreconnect/AuthKey_*.p8

# 登录 asc
asc auth login --name "starluna" \
  --key-id "XXXXXXXXXX" \
  --issuer-id "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX" \
  --private-key "$HOME/.appstoreconnect/AuthKey_XXXXXXXXXX.p8" \
  --network

# 验证
asc auth status
asc apps list  # 应该能看到 apps，或空数组（app record 还没建）
```

**关键：API Key 必须是 Admin 角色**（如果选了 App Manager，后面 exportArchive 会因为 "Cloud signing permission error" 失败）。

---

## 阶段 2：Bundle ID + App Record

**bundle ID（Apple Developer Portal）和 App Record（App Store Connect）是两个独立的东西**。看 [references/bundle-id-vs-app-record.md](references/bundle-id-vs-app-record.md) 详解。

### 2.1 注册 Bundle ID（Web UI，不可自动化）

https://developer.apple.com/account/resources/identifiers/list → `+` → App IDs → Explicit

- Bundle ID: 你定的字符串
- Description: 内部标签，写 app 名即可（仅团队成员可见，不展示给用户）
- Capabilities **只勾你真用到的**：
  - ✅ Sign In with Apple（如果用 SIWA）
  - ✅ In-App Purchase（如果有订阅 / IAP）
  - ❌ Apple Pay Payment Processing — 这是给电商用的，不是订阅
  - ❌ Push Notifications — 没用就别开（开了 App Review 会问你为什么）

### 2.2 创建 App Record（Web UI，asc 不支持公共 API）

https://appstoreconnect.apple.com/apps → `+` → New App

- Platforms: iOS only（除非要做 macOS / tvOS / visionOS）
- Name: 你的 30 字符 App Store 名
- Primary Language: 选最大语种（一般 English (U.S.)）
- Bundle ID: 从下拉选刚注册的
- SKU: 永久不变的内部标识符，建议 `<product>-ios`（**不要加版本号**，例如 `LUNABEE-IOS`）
- Company Name: 法人主体名（例如 `StarLuna LLC`）—— App Store 上展示为 "Seller"

### 2.3 拿到 APP_ID

```bash
asc apps list --output table
# 保存到 .asc/app.env，后续命令复用
mkdir -p .asc && cat > .asc/app.env <<EOF
APP_ID=<from above>
BUNDLE_ID=<your-bundle-id>
EOF
```

---

## 阶段 3：Metadata + 配置（全部 API 自动化）

这一阶段一次性把 ~80% 的 App Store Connect 字段填好。用 [scripts/push-all-metadata.sh](scripts/push-all-metadata.sh)。

### 3.1 写本地 metadata 文件

```
metadata/
└── version/
    └── 1.0/
        ├── en-US/
        │   ├── name.txt          ≤30 chars
        │   ├── subtitle.txt      ≤30 chars
        │   ├── keywords.txt      ≤100 chars（逗号分隔，无空格）
        │   ├── description.txt   ≤4000 chars
        │   ├── promotional_text.txt  ≤170 chars
        │   ├── whats_new.txt     ≤4000 chars（首次发布无法编辑，可跳过）
        │   ├── support_url.txt
        │   ├── marketing_url.txt
        │   └── privacy_url.txt
        └── review.json           reviewer 联系方式 + demo 账号
```

### 3.2 转成 asc 的 canonical JSON 格式并 push

asc 用的是 JSON 格式（`metadata-asc/app-info/<locale>.json` + `metadata-asc/version/<v>/<locale>.json`）。脚本会做转换。

```bash
bash scripts/push-all-metadata.sh
```

执行的命令：
```bash
asc metadata push --app "$APP_ID" --version "1.0" --platform IOS --dir ./metadata-asc
asc categories set --app "$APP_ID" --primary <CATEGORY> --secondary <CATEGORY>
asc age-rating edit --app "$APP_ID" --all-none   # 然后按需 override
asc apps update --id "$APP_ID" --content-rights DOES_NOT_USE_THIRD_PARTY_CONTENT
asc versions update --version-id "$VERSION_ID" --copyright "2026 YourCompany LLC"
asc pricing schedule create --app "$APP_ID" --free --base-territory "United States" --start-date "$YESTERDAY"
asc review details-create --version-id "$VERSION_ID" --contact-first-name ... --demo-account-name ... --demo-account-password ...
```

**注意**：
- 首次发布 `whatsNew` 字段会被 API 拒（"cannot be edited at this time"）—— 留到 v1.1 再写
- 价格 schedule 的 `--start-date` 必须是过去时（用昨天）
- `--all-none` 把所有 age rating 项设为安全默认，会自动算出 4+ rating

### 3.3 类别选择决策

App Store 类别会直接影响推荐算法。常见家庭/生产力 app 的选择：

| App 类型 | Primary | Secondary |
|---|---|---|
| 家庭管理 / 育儿组织 | Productivity | Lifestyle |
| 儿童学习内容 | Education | Family（如果国家有这分类） |
| 家庭日程 / 待办 | Productivity | Lifestyle |
| 健身 / 习惯 | Health & Fitness | Lifestyle |
| AI 工具 | Productivity | Utilities |

---

## 阶段 4：版本号 + 签名 + Archive

**这里是首次发布最容易踩坑的地方**。详细排错见 [references/signing-troubleshoot.md](references/signing-troubleshoot.md)。

### 4.1 项目设置（手动 in Xcode）

1. 在 Xcode 打开 `.xcodeproj`
2. 选 target → Signing & Capabilities
3. Team 选 LLC / Organization team（**不是 Personal Team**）
4. ✅ Automatically manage signing

### 4.2 验证 `DEVELOPMENT_TEAM` 在 pbxproj 里只有一个值

```bash
grep -n "DEVELOPMENT_TEAM" path.xcodeproj/project.pbxproj | sort -u
# 应该只有一个 team ID，不要混着 personal team 和 LLC team
```

如果有 personal team 残留：
```bash
sed -i '' 's/DEVELOPMENT_TEAM = <personal-id>;/DEVELOPMENT_TEAM = <llc-id>;/g' \
  path.xcodeproj/project.pbxproj
```

### 4.3 Build number 安全检查（防止 "CFBundleVersion too low" 被拒）

**不要直接猜 build number**——从 ASC 拿 remote-safe 的下一个值：

```bash
source .asc/app.env

# 查看当前版本
asc xcode version view --project <scheme>.xcodeproj

# 从 ASC 获取下一个安全 build number
NEXT_BUILD=$(asc builds next-build-number \
  --app "$APP_ID" \
  --version "1.0" \
  --platform IOS \
  --output json | jq -r '.nextBuildNumber')

# 写入 project
asc xcode version edit --build-number "$NEXT_BUILD" --project <scheme>.xcodeproj

# 也可以手动 bump（仅在确认本地比 ASC 高时）
# asc xcode version bump --type build --project <scheme>.xcodeproj

asc xcode version view --project <scheme>.xcodeproj  # 确认
```

### 4.4 ExportOptions.plist

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store-connect</string>
    <key>teamID</key>
    <string><LLC_TEAM_ID></string>
    <key>destination</key>
    <string>export</string>
    <key>signingStyle</key>
    <string>automatic</string>
    <key>stripSwiftSymbols</key>
    <true/>
    <key>uploadSymbols</key>
    <true/>
</dict>
</plist>
```

### 4.5 Archive（优先用 `asc xcode archive`）

统一把 artifact 放到 `.asc/artifacts/`：

```bash
mkdir -p .asc/artifacts

asc xcode archive \
  --project <scheme>.xcodeproj \
  --scheme <scheme> \
  --configuration Release \
  --clean \
  --archive-path ".asc/artifacts/<scheme>.xcarchive" \
  --xcodebuild-flag=-destination \
  --xcodebuild-flag=generic/platform=iOS \
  --output json
```

### 4.6 Export IPA

```bash
asc xcode export \
  --archive-path ".asc/artifacts/<scheme>.xcarchive" \
  --export-options "ExportOptions.plist" \
  --ipa-path ".asc/artifacts/<scheme>.ipa" \
  --xcodebuild-flag=-allowProvisioningUpdates \
  --output json
```

**注意 export 认证路径要按错误分流**：
- `-authenticationKey*` 可以让 `xcodebuild` 访问 Developer Portal，但 API key 没有 cloud signing 权限时会报 `Cloud signing permission error`。
- Xcode Apple ID session 不可见或本机没有 distribution identity 时会报 `No Accounts` / `No signing certificate "iOS Distribution" found`。
- 不要把 archive 失败和 export 签名失败混在一起；archive 成功时，优先修本机 distribution cert/profile。

### 4.6.1 CLI 签名恢复：No Accounts / No iOS Distribution

触发条件：

```text
error: exportArchive No Accounts
error: exportArchive No signing certificate "iOS Distribution" found
```

或：

```text
error: exportArchive Cloud signing permission error
```

先查本机和 ASC：

```bash
security find-identity -v -p codesigning
asc certificates list --certificate-type IOS_DISTRIBUTION --output table
asc profiles list --profile-type IOS_APP_STORE --output table
```

如果没有可用 distribution cert/profile，用 asc 创建一套新的，导入 keychain：

```bash
mkdir -p .asc/signing-build

asc certificates create \
  --certificate-type IOS_DISTRIBUTION \
  --generate-csr \
  --common-name "CLI Distribution" \
  --organization "<LEGAL_ORG_NAME>" \
  --organizational-unit "<TEAM_ID>" \
  --country US \
  --key-out .asc/signing-build/ios_distribution.key \
  --csr-out .asc/signing-build/ios_distribution.csr \
  --output json --pretty | tee .asc/signing-build/certificate-create.json

node -e "const fs=require('fs'); const j=JSON.parse(fs.readFileSync('.asc/signing-build/certificate-create.json','utf8')); fs.writeFileSync('.asc/signing-build/ios_distribution.cer', Buffer.from(j.data.attributes.certificateContent,'base64')); fs.writeFileSync('.asc/signing-build/certificate-id.txt', j.data.id);"

security import .asc/signing-build/ios_distribution.key \
  -k "$HOME/Library/Keychains/login.keychain-db" \
  -T /usr/bin/codesign -T /usr/bin/security -T /usr/bin/xcodebuild
security import .asc/signing-build/ios_distribution.cer \
  -k "$HOME/Library/Keychains/login.keychain-db" \
  -T /usr/bin/codesign -T /usr/bin/security -T /usr/bin/xcodebuild
```

创建 App Store profile：

```bash
CERT_ID="$(cat .asc/signing-build/certificate-id.txt)"

asc profiles create \
  --name "<APP_NAME> App Store CLI $(date +%Y-%m-%d)" \
  --profile-type IOS_APP_STORE \
  --bundle "<BUNDLE_ID_RESOURCE_ID>" \
  --certificate "$CERT_ID" \
  --output json --pretty | tee .asc/signing-build/profile-create.json

node -e "const fs=require('fs'); const j=JSON.parse(fs.readFileSync('.asc/signing-build/profile-create.json','utf8')); fs.writeFileSync('.asc/signing-build/profile-id.txt', j.data.id); fs.writeFileSync('.asc/signing-build/profile-uuid.txt', j.data.attributes.uuid); fs.writeFileSync('.asc/signing-build/profile-name.txt', j.data.attributes.name);"

PROFILE_ID="$(cat .asc/signing-build/profile-id.txt)"
PROFILE_UUID="$(cat .asc/signing-build/profile-uuid.txt)"

asc profiles download --id "$PROFILE_ID" --output .asc/signing-build/appstore.mobileprovision
mkdir -p "$HOME/Library/MobileDevice/Provisioning Profiles" "$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"
cp .asc/signing-build/appstore.mobileprovision "$HOME/Library/MobileDevice/Provisioning Profiles/$PROFILE_UUID.mobileprovision"
cp .asc/signing-build/appstore.mobileprovision "$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles/$PROFILE_UUID.mobileprovision"
```

如果 automatic export 继续选择旧 profile，用 manual ExportOptions 指定 profile/cert：

```bash
PROFILE_NAME="$(cat .asc/signing-build/profile-name.txt)"
EXPORT_PLIST=.asc/signing-build/ExportOptions-manual.plist

/usr/libexec/PlistBuddy -c 'Clear dict' "$EXPORT_PLIST"
/usr/libexec/PlistBuddy -c 'Add :destination string export' "$EXPORT_PLIST"
/usr/libexec/PlistBuddy -c 'Add :method string app-store-connect' "$EXPORT_PLIST"
/usr/libexec/PlistBuddy -c 'Add :signingStyle string manual' "$EXPORT_PLIST"
/usr/libexec/PlistBuddy -c 'Add :signingCertificate string iPhone Distribution: <LEGAL_ORG_NAME> (<TEAM_ID>)' "$EXPORT_PLIST"
/usr/libexec/PlistBuddy -c 'Add :teamID string <TEAM_ID>' "$EXPORT_PLIST"
/usr/libexec/PlistBuddy -c 'Add :provisioningProfiles dict' "$EXPORT_PLIST"
/usr/libexec/PlistBuddy -c "Add :provisioningProfiles:<BUNDLE_ID> string $PROFILE_NAME" "$EXPORT_PLIST"
```

最后用这个 plist export。成功后删除 `.asc/signing-build`，不要把生成的 private key 留在 repo。

### 4.7 验证 archive 实际签名给哪个 team

```bash
codesign -dv --verbose=4 .asc/artifacts/<scheme>.xcarchive/Products/Applications/<scheme>.app 2>&1 \
  | grep -E "Authority|TeamIdentifier"
```

**TeamIdentifier 必须是 LLC team ID**。"Authority: Apple Development: <person name>" 是正常的——证书是以人命名的，但归属 LLC team（同一个 Apple ID 可同时是 Personal team 和 LLC team 成员）。

---

## 阶段 5：上传 IPA

### ⑤-A 仅发 TestFlight（日常迭代快速路径）

只需要内测，不走 App Store 审核时，用这条路：

```bash
source .asc/app.env

# 获取 TestFlight 群组 ID（首次需要）
asc beta-groups list --app "$APP_ID" --output table

# 上传并直接分发给测试群组
asc publish testflight \
  --app "$APP_ID" \
  --ipa ".asc/artifacts/<scheme>.ipa" \
  --group "<GROUP_ID>" \
  --wait \
  --poll-interval 30s \
  --timeout 90m \
  --output json
```

完成后即可在 TestFlight 通知到测试人员。**到此结束，不需要继续到阶段 6/7。**

---

### ⑤-B 发 App Store（正式上架路径）

```bash
asc publish appstore \
  --app "$APP_ID" \
  --ipa ".asc/artifacts/<scheme>.ipa" \
  --wait \
  --poll-interval 30s \
  --timeout 90m \
  --output json
```

`--wait` 让命令阻塞直到 build 处理完成（`VALID` 状态）。通常 30-60 分钟。

**不会触发审核**——只是把 binary 推到 Apple 后台开始 automated check。

如果只想上传并手动 attach 到版本：

```bash
asc builds upload \
  --app "$APP_ID" \
  --ipa ".asc/artifacts/<scheme>.ipa" \
  --wait \
  --poll-interval 30s

asc builds list --app "$APP_ID" --output table
asc versions attach-build --version-id "$VERSION_ID" --build "$BUILD_ID"
```

确认 App Store version 选中的 build：

```bash
TOKEN="$(asc auth token --confirm)"
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.appstoreconnect.apple.com/v1/appStoreVersions/$VERSION_ID/build"
```

期间可以并行做：
- 截图采集（阶段 6）
- App Privacy 调查问卷（阶段 6）
- Territory availability 引导（阶段 6）

### 5.1 上传后清理过期 build（可选，每次 release 后做一次）

```bash
# 预览将要过期的 build（dry-run）
asc builds expire-all --app "$APP_ID" --older-than 90d --dry-run

# 确认后执行
asc builds expire-all --app "$APP_ID" --older-than 90d --confirm
```

---

## 阶段 6：人工必须做的 4 件事（Web UI only）

Apple 公共 API 不提供这些，必须在 ASC web UI 完成。

### 6.1 App Availability（territories）

https://appstoreconnect.apple.com/apps/$APP_ID/distribution/pricing → Availability

- 首次必须 web UI 引导一次（之后才能用 `asc pricing availability edit`）
- 选 territories，决定是否 auto-include new territories

### 6.2 App Privacy 问卷

https://appstoreconnect.apple.com/apps/$APP_ID/appPrivacy

参考本地 `metadata/privacy.json`（基于代码 audit 的答案）。逐项勾选，**最后点 Publish**——草稿状态会卡审核。

### 6.3 截图

至少 1 组 6.9″ iPhone（1290×2796）截图，3-10 张。

参考 [references/screenshot-plan.md](references/screenshot-plan.md) 的拍摄顺序。

```bash
# 可以用 asc 批量上传
asc screenshots upload --app "$APP_ID" --version "1.0" --device IPHONE_69 --dir ./screenshots/ios-69
```

### 6.4 In-App Purchases（如果有）

ASC web UI 创建订阅 group、subscription product、价格、本地化、审核截图。CLI 有部分 API（`asc iap ...`, `asc subscriptions ...`），但首次创建建议 web UI。

---

## 阶段 7：Submit for Review（人工确认 + API）

⚠️ **这一步永远不要自动执行**。Claude 应该 ASK USER 确认后才提交。

### 7.1 Final validate

```bash
asc validate --app "$APP_ID" --version "1.0" --platform IOS --strict --output table
```

确认 0 个 error。如果还有 error：
- `build.required.missing` → 阶段 5 还没成功
- `availability.missing` → 阶段 6.1 没做
- `screenshots.required.any` → 阶段 6.3 没做
- `privacy.publish_state.unverified` → 阶段 6.2 没 Publish

### 7.2 Submit

```bash
# Dry-run 预览
asc review submit --app "$APP_ID" --version "1.0" --build "$BUILD_ID" --dry-run --output table

# 真正提交
asc review submit --app "$APP_ID" --version "1.0" --build "$BUILD_ID" --confirm
```

### 7.3 监控

```bash
asc status --app "$APP_ID"
asc submit status --version-id "$VERSION_ID"
```

审核通常 24-48 小时。被拒就修复后再 submit。

---

## 跨阶段的踩坑清单（来自实战）

详细看 [references/common-pitfalls.md](references/common-pitfalls.md)：

- ❌ App icon PNG 带 alpha channel → 自动拒
- ❌ App icon 512×512 → 必须 1024×1024
- ❌ 关键词总字符数超 100 → push 失败
- ❌ 首次发布写了 `whatsNew` → API 拒
- ❌ 价格 schedule 用未来 start date → API 拒
- ❌ Personal team 和 LLC team 在 pbxproj 里混着 → 签名乱掉
- ❌ API key 是 App Manager 角色 → exportArchive 报 Cloud signing error
- ❌ Bundle ID 已被注册（即使你拥有域名）→ 改用 `.ios` 后缀
- ❌ `UIFileSharingEnabled = YES` 而你没用 → 不必要的权限暴露
- ❌ AI 助手有花名（Aries 之类）但实际产品名是别的 → 文案不一致风险
- ❌ 直接猜 build number → 可能 "CFBundleVersion too low" 被拒，用 `asc builds next-build-number` 代替
- ❌ IPA 放在 `build/` 而非 `.asc/artifacts/` → 和进度追踪路径不一致，容易混淆

---

## Skill 怎么用（给 Claude / 操作员）

1. **首次执行该 skill**：从阶段 0 开始，每个阶段都和用户对齐
2. **后续迭代 TestFlight**（最常见）：阶段 4（build number 安全检查 → archive → export）→ 阶段 5-A（publish testflight）→ 完成
3. **后续 App Store release** (v1.1, v1.2...)：跳过阶段 1-2（已就绪），从阶段 3 重新生成 metadata，阶段 4-5-B 重新 archive + upload，阶段 6 通常只需要 update screenshots + 写 whatsNew（这次能写了）
4. **遇到错误**：先查 `references/common-pitfalls.md`；命令报错先看 `asc <command> --help`
5. **Submit 前**：必须人工确认。不要在 batch 脚本里自动 `asc review submit`。
