# iOS Release 实战踩坑清单

每一条都对应一次实际被卡住的经历。按发生频率排序。

---

## 1. Bundle ID `app.xxx.yyy` is not available

**症状**：在 Developer Portal 注册 bundle ID 时报错 "An App ID with Identifier 'xxx' is not available".

**原因**：Apple bundle ID 是全球唯一，**不验证域名所有权**。任何开发者都可注册；删除后永久占用；很容易冲突。

**修复**：加后缀，如 `app.your.product` → `app.your.product.ios`。

---

## 2. exportArchive: Cloud signing permission error

**症状**：archive 成功，但 exportArchive 报 "Team xxx does not have permission to create iOS App Store provisioning profiles".

**原因**：API key 角色是 App Manager（默认建议但不够）。Cloud signing 需要 Admin 或 Developer 角色。

**修复二选一**：
- 重新生成 API key，选 **Admin** 角色
- exportArchive 时不传 `-authenticationKey*` 参数，让它走 Xcode 已登录的 Apple ID 会话

---

## 3. Signing log 显示 "Apple Development: <人名>" 让人以为签错团队

**症状**：archive log 显示 `Signing Identity: "Apple Development: MIAONAN CAI"`，但你想要的是 StarLuna LLC 团队。

**真相**：Apple Development 证书是按**人**命名的，不是按团队。同一个 Apple ID 可以是 N 个团队成员，所有团队下都用同一张证书。

**验证签名实际归属哪个团队**：
```bash
codesign -dv --verbose=4 build/<scheme>.xcarchive/Products/Applications/<scheme>.app 2>&1 \
  | grep TeamIdentifier
# 看 TeamIdentifier=<TEAM_ID>，对比你预期的 LLC team ID
```

如果 TeamIdentifier 是 LLC team——没问题，继续。

---

## 4. Personal team 残留在 pbxproj

**症状**：项目里有些 build configs 是 personal team，有些是 LLC team，签名混乱。

**原因**：项目最早在 personal team 下创建，enrollment 后只在 target 层面切到 LLC，project 层面还是 personal。

**检查**：
```bash
grep -n "DEVELOPMENT_TEAM" path.xcodeproj/project.pbxproj | sort -u
```
应该只有一个 team ID。

**修复**：
```bash
sed -i '' 's/DEVELOPMENT_TEAM = <personal>;/DEVELOPMENT_TEAM = <llc>;/g' \
  path.xcodeproj/project.pbxproj
```

---

## 5. Provisioning Profile 残留

**症状**：archive 时 Xcode 仍然挑 personal team 的 provisioning profile，即使 DEVELOPMENT_TEAM 已切。

**原因**：本地 `~/Library/Developer/Xcode/UserData/Provisioning Profiles/` 还存着 personal team 的 profile 文件。

**修复**：定位并删除（保留 LLC team 的）：
```bash
for p in ~/Library/Developer/Xcode/UserData/Provisioning\ Profiles/*.mobileprovision; do
  echo "=== $(basename $p) ==="
  security cms -D -i "$p" | grep -A1 -E "<key>(TeamName|Name)</key>"
done

# 删 personal team 的：
rm ~/Library/Developer/Xcode/UserData/Provisioning\ Profiles/<uuid>.mobileprovision
```

---

## 6. App icon 1024×1024 必须，且不能有 alpha

**症状**：App Store validation 拒绝 icon。

**修复**：
```bash
sips -z 1024 1024 source.png --out icon.png
# RGB only（无 alpha）；如果源图有 alpha，先 flatten 到不透明背景
```

`Contents.json` 里要把 size 写成 `"1024x1024"`。

---

## 7. 关键词总字符数超 100

**症状**：`asc metadata push` 失败或写入截断。

**修复**：
```bash
wc -c < metadata/version/1.0/en-US/keywords.txt  # 必须 ≤100
```
不要重复 name / subtitle 里出现过的词——浪费字符预算。

---

## 8. 首次发布写 whatsNew → API 拒

**症状**：`asc metadata push` 报 "Attribute 'whatsNew' cannot be edited at this time".

**原因**：whatsNew 只能在更新版本（v1.1+）写。首次发布该字段不可编辑。

**修复**：从 metadata JSON 里删除 `whatsNew` 字段，下次 push。

---

## 9. 价格 schedule start-date 在未来 → API 拒

**症状**：`asc pricing schedule create --start-date 2026-05-27` 报 "start date X in the future".

**修复**：用昨天：
```bash
YESTERDAY=$(date -v-1d +%Y-%m-%d)
asc pricing schedule create --app $APP_ID --free --base-territory "United States" --start-date $YESTERDAY
```

---

## 10. App Privacy 草稿状态卡审核

**症状**：所有问题答完，submission 时仍报错。

**原因**：App Privacy 答完后必须**手动 Publish**。草稿状态不算完成。

**修复**：https://appstoreconnect.apple.com/apps/$APP_ID/appPrivacy 顶部 "Publish" 按钮。

---

## 11. Review 联系电话格式被拒

**症状**：`asc review details-create --contact-phone "+1 555 0100"` 报 "phone number must be in valid format".

**修复**：用真实电话 + 国家码：`"+1 978 328 3078"`。Apple 真的会打。

---

## 12. Reviewer 看不到 demo 账号

**症状**：自己代码里有 demo 凭据按钮，但 reviewer 报 "couldn't sign in".

**修复**：API 提供 demo 凭据，不光写 notes：
```bash
asc review details-update --id $DETAIL_ID \
  --demo-account-required=true \
  --demo-account-name "parent@example.app" \
  --demo-account-password "demo"
```

---

## 13. UIFileSharingEnabled = YES 但未使用

**症状**：用户能在 iOS 文件 app 里看到你的 Documents 目录，但你的产品并没设计这功能。

**原因**：Info.plist 默认开了，没人关。

**修复**：从 pbxproj 删掉 `INFOPLIST_KEY_UIFileSharingEnabled` 和 `INFOPLIST_KEY_LSSupportsOpeningDocumentsInPlace`。

---

## 14. AI 助手花名 ≠ 产品名 → 文案混乱

**症状**：产品叫 "Luna Bee"，但代码里到处写 "Aries AI assistant"。App Store description 出现 Aries 让用户困惑。

**修复**：
- 麦克风权限文案：用产品名 + "AI assistant" 通用词，不要花名
- App Store description 不暴露内部代号
- 如果一定要给 AI 起名，**全代码统一一致**（grep `<花名>` 应全是用户文案，非内部 type name）

---

## 15. Bundle ID 注册时把不必要的 capabilities 都打勾

**症状**：审核时 reviewer 问"你为什么有 HealthKit 权限"。

**原因**：开发者按"看着像能用"勾的，没真用代码触发。

**修复**：Bundle ID capabilities 只勾真正用到的：
- ✅ Sign In with Apple（用了 SIWA）
- ✅ In-App Purchase（有 IAP / 订阅）
- ❌ Apple Pay Payment Processing（电商专用，不是 IAP）
- ❌ Push Notifications（没集成 APNs 别开）
- ❌ HealthKit, HomeKit, CloudKit 等（没用别开）

---

## 16. Auto-renewable subscription 一直 Missing Metadata，但 UI 里少数国家都有价格

**症状**：
- `Monetization → Subscriptions → <Subscription>` 显示 `Missing Metadata`
- Availability 明确只选了 launch countries（例如 USA/CAN/GBR/AUS/NZL）
- Subscription Prices 也显示这些国家的价格都存在
- App version 的 `In-App Purchases and Subscriptions` section 不出现，无法 attach 首审订阅

**原因**：首审路径可能要求完整 comparable price table。ASC UI 的可见价格列表只显示当前
Availability 国家，容易让人以为价格完整；但 Apple submit/review backend 仍可能认为其他
countries/regions 缺少 price records。

**修复**：
1. 打开 `Monetization → Subscriptions → <Subscription> → Subscription Prices`
2. 用目标 base territory/price（例如 United States / $20.00）
3. 点击 **Recalculate prices for all countries or regions**
4. 保存/确认 Apple 生成的 comparable prices
5. 不要改变 Availability；仍然只选 launch countries
6. 等 subscription 状态变成 **Ready to Submit**
7. 回到 app version 页面，在 `In-App Purchases and Subscriptions` section 里 attach subscription/group

**不要误修**：
- 不要去 `Monetization → In-App Purchases` 新建 consumable/non-consumable；自动续期订阅不在那里。
- 不要把 paywall review screenshot 上传到 `Image (Optional)`。Optional image 是 App Store promotion / offer-code / win-back 用图，不是审核截图。
