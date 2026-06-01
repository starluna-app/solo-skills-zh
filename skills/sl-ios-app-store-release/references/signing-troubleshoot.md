# 签名 & Provisioning 故障排除

iOS 签名机制复杂，首次发布几乎一定踩坑。这里是常见症状 → 排查 → 修复。

---

## 名词速查

| 名词 | 是什么 |
|---|---|
| **Apple ID** | 个人账号（邮箱 + 密码） |
| **Personal Team** | 每个 Apple ID 自动有的免费团队，用于开发，无法发布 App Store |
| **Developer Program Team** | 付费的 Individual 或 Organization 团队，可发布 |
| **Certificate**（证书） | 安装在 Mac keychain 里的签名密钥。按 Apple Development / Apple Distribution 分类 |
| **Provisioning Profile**（描述文件） | 把 cert + bundle ID + capabilities 绑定的文件 |
| **Cloud Signing** | Xcode 通过 Apple API 自动创建 cert + profile 的能力 |

---

## 关键事实

1. **Apple Development cert 是按 Apple ID 命名的，不是按团队**
   - 同一张 Apple Development cert 可同时在 Personal Team 和 LLC Team 下使用
   - 命名如 "Apple Development: <你的名字>" 不代表它属于个人团队

2. **TeamIdentifier 才是签名归属的真实标识**
   - 看 `codesign -dv --verbose=4 <app>` 输出里的 `TeamIdentifier=XXX`
   - 这个 ID 必须是你的发布团队 ID

3. **App Store 发布必须用 Apple Distribution cert，不是 Apple Development**
   - Apple Development：开发期签名，能在自己设备上跑
   - Apple Distribution：发布期签名，能上 App Store / TestFlight
   - 自动签名时 Xcode 会按需生成 Distribution，但需要 Apple ID 有团队 admin/holder 权限

4. **Personal Team 永远无法创建 Apple Distribution 证书**
   - 只能创建 Development，且 profile 7 天过期
   - 如果 Xcode 选错了 Personal Team，archive 后 exportArchive 一定会失败

---

## 症状 → 修复表

### 症状 A：archive 成功但 exportArchive 报 "No profiles found"

```
error: exportArchive No profiles for 'app.xxx.yyy' were found
```

**可能原因**：
1. ExportOptions.plist 里的 teamID 和 archive 的实际 team 不匹配
2. Apple Developer Portal 还没创建 Distribution profile（首次发布常见）
3. 本地 keychain 没有 Apple Distribution cert

**修复**：
```bash
# 验证 archive 实际签名给哪个 team
codesign -dv --verbose=4 build/<scheme>.xcarchive/Products/Applications/<scheme>.app 2>&1 | grep TeamIdentifier

# 验证 ExportOptions.plist teamID 是否一致
cat ExportOptions.plist | grep -A1 teamID

# 让 exportArchive 用 cloud signing 自动创建 Distribution cert（需要 Xcode 已登录 Apple ID）
xcodebuild -exportArchive \
  -archivePath build/<scheme>.xcarchive \
  -exportPath build/ipa \
  -exportOptionsPlist ExportOptions.plist \
  -allowProvisioningUpdates
# 注意：不传 -authenticationKey* 参数；让它走 Apple ID 会话
```

---

### 症状 B：exportArchive 报 "Cloud signing permission error"

```
error: exportArchive Cloud signing permission error
```

**原因**：你传了 `-authenticationKey*` 参数，但 API key 的角色（Role）权限不够。App Manager 角色不能 cloud sign，只有 Admin / Developer 角色可以。

**修复 2 选 1**：
- 去 https://appstoreconnect.apple.com/access/integrations/api 重新生成 API key，选 **Admin** 角色
- 或者把 exportArchive 命令里的 `-authenticationKey*` 三个参数去掉，让它走 Xcode 已登录的 Apple ID

---

### 症状 C："Team has no devices from which to generate a provisioning profile"

```
Your team has no devices from which to generate a provisioning profile.
```

**原因**：Xcode 自动管理签名时，同时试图创建 Development profile 和 Distribution profile。Development profile 需要至少注册一台设备。

**修复**：插上你的 iPhone，解锁，信任电脑——Xcode 自动注册。或者去 https://developer.apple.com/account/resources/devices/add 手动加 UDID。

**注意**：这个错误**不阻止 archive**——archive 用 Distribution profile，Development profile 缺失只影响真机调试。如果你只想 ship 不想调试，可以忽略这个错。

---

### 症状 D：archive log 显示 personal team 的 cert，不是 LLC

```
Signing Identity: "Apple Development: <你的名字> (xxxxx)"
Provisioning Profile: "iOS Team Provisioning Profile: app.xxx.yyy"
```

**先验证 TeamIdentifier**：
```bash
codesign -dv --verbose=4 build/<scheme>.xcarchive/Products/Applications/<scheme>.app 2>&1 | grep TeamIdentifier
```

- 如果 `TeamIdentifier=<你的LLC ID>` → **没事，cert 命名只是按人**
- 如果 `TeamIdentifier=<personal team ID>` → 真的签错了

**真签错时的修复**：
```bash
# 1. 检查 pbxproj 里 DEVELOPMENT_TEAM
grep -n "DEVELOPMENT_TEAM" path.xcodeproj/project.pbxproj
# 应该只有 LLC team ID

# 2. 检查本地 provisioning profiles
for p in ~/Library/Developer/Xcode/UserData/Provisioning\ Profiles/*.mobileprovision; do
  echo "=== $(basename $p) ==="
  security cms -D -i "$p" | grep -A1 -E "<key>(TeamName|Name)</key>"
done

# 3. 删除 personal team 的 profile
rm ~/Library/Developer/Xcode/UserData/Provisioning\ Profiles/<bad-uuid>.mobileprovision

# 4. 重新 archive
rm -rf build/<scheme>.xcarchive
xcodebuild ... archive
```

---

### 症状 E：Xcode 提示"conflicting provisioning settings"

```
error: <target> has conflicting provisioning settings. <target> is automatically signed,
but code signing identity <X> has been manually specified.
```

**原因**：你同时设了 `CODE_SIGN_STYLE=Automatic` 和 `CODE_SIGN_IDENTITY=具体某证书`。这两个是互斥的。

**修复**：去掉 `CODE_SIGN_IDENTITY=` 那一行。让自动管理只用 generic `Apple Development`。

---

### 症状 F：上传到 ASC 后 binary 处理失败

ASC 邮件说 "The build is invalid" 或具体 issue：

| 错误 | 原因 | 修复 |
|---|---|---|
| Missing required icon (1024×1024) | App icon 没填或不对 | 检查 AppIcon.appiconset/Contents.json 和图片 |
| Invalid icon format (alpha channel) | PNG 带透明 | sips -s format png --no-write-alpha source.png --out clean.png |
| Missing Info.plist Required Architectures | 只 build 了 simulator | 用 `generic/platform=iOS` archive |
| ITMS-90683 missing Usage Description | NSCameraUsageDescription 等没填 | pbxproj 里加 INFOPLIST_KEY_NSCameraUsageDescription |
| ITMS-90683 missing encryption export | 没声明 | INFOPLIST_KEY_ITSAppUsesNonExemptEncryption = NO |

---

## 干净重建（核选项）

如果各种乱了，按这个顺序重置：

```bash
# 1. 清掉 Xcode build 缓存
rm -rf ~/Library/Developer/Xcode/DerivedData/<project>-*

# 2. 清掉本地 provisioning profiles（Xcode 会按需重新拉）
rm -rf ~/Library/Developer/Xcode/UserData/Provisioning\ Profiles/*

# 3. 检查 keychain 里多余的 cert（可选——风险大，先备份）
security find-identity -v -p codesigning
# 如果有过期 / 团队冲突的 cert，去 Keychain Access 手动删

# 4. 在 Xcode Settings → Accounts，确认登录的 Apple ID 和团队都对

# 5. 重新 archive，让 -allowProvisioningUpdates 自动重建一切
```
