# 内部 TestFlight 迭代

只在用户要求内部 TestFlight build、上传或分发时使用本路径。不要把它扩展为 App Store metadata、截图、审核或提交工作。

## 成功标准

1. 同一执行上下文能读取 ASC credential，且能查询目标 app；
2. ASC 返回版本对应的安全 next build number；
3. archive、IPA 和签名 team/bundle ID 已本地验证；
4. 上传指定 build，加入目标 internal beta group；
5. ASC 返回该 build `processingState: VALID`。

`Uploaded to Apple` 只是第 4 步上传入口成功，不是第 5 步。

## 默认路径

```bash
# 从项目根目录、同一个将执行发布的 Terminal 运行
bash <skill-path>/scripts/testflight-preflight.sh <MARKETING_VERSION>

# 按项目的真实 source of truth 更新 build number；不要只改生成文件。
# 用 asc xcode archive/export 生成带版本和 build 的确定路径。
asc xcode archive --project <project>.xcodeproj --scheme <scheme> \
  --configuration Release --clean \
  --archive-path .asc/artifacts/<scheme>-<version>-<build>.xcarchive \
  --xcodebuild-flag=-destination --xcodebuild-flag=generic/platform=iOS

asc xcode export \
  --archive-path .asc/artifacts/<scheme>-<version>-<build>.xcarchive \
  --export-options ExportOptions.plist \
  --ipa-path .asc/artifacts/<scheme>-<version>-<build>.ipa

asc publish testflight --app "$APP_ID" \
  --ipa .asc/artifacts/<scheme>-<version>-<build>.ipa \
  --group "<internal beta group>" --wait --poll-interval 30s --timeout 90m
```

先用 `xcodebuildmcp` 发现 project/scheme，并只做必要的编译验证。不要将 simulator build 说成 archive 或 TestFlight 验证。

## 故障分流

### `asc` 显示 credentials missing

在**将执行发布的同一终端**依次运行：

```bash
asc auth status
asc builds next-build-number --app "$APP_ID" --version "<version>" --output json
```

若其中一个失败，报告为该执行上下文无法访问 credential。不要根据另一个 Terminal、agent、CI 或 GUI 的结果判断 `.p8` 丢失；不要先新建 API key。

### `errSecInternalComponent` 或 embedded-framework `CodeSign` 失败

先在相同终端运行：

```bash
security unlock-keychain "$HOME/Library/Keychains/login.keychain-db"
```

输入 macOS 登录密码，随后以**相同 archive 命令和相同 signing 配置**重试一次。该命令只解锁已存在的 keychain，不创建或替换 credential。

仅当重试仍失败时，才检查 `security find-identity -v -p codesigning`、profile 和 team/bundle 的对应关系。不要自动生成、撤销或删除 certificates/profiles。

### 上传完成但尚未 `VALID`

继续轮询 ASC。报告“已上传”与“TestFlight 可安装”两个不同状态；后者要求 `VALID` 和正确 beta group。

### Firebase/gRPC missing dSYM warnings

记录 warning 和 UUID；不要把它当作 upload failure。只有 Apple 将 binary 标记为 invalid 或 processing failed 才阻断 TestFlight。
