---
name: sl-ios-asset-prep
description: iOS/macOS 图片资源准备工作流。两条核心路径——(1) 照片/背景图：PNG → HEIC 压缩以减少包体积；(2) 图标资源：恢复或剪除背景以获得真实的透明 alpha 通道，再缩放到合适尺寸，最后正确放入 Xcode Asset Catalog。当用户提到 iOS 资源、HEIC 转换、PNG 透明背景、图标抠图、rembg、BiRefNet、Asset Catalog、App Thinning、包体积优化、图片色彩配置时使用此技能。
---

# iOS 资源准备工作流：HEIC 压缩 + 图标透明背景

针对 iOS/macOS 开发者的结构化指南。两条独立路径，根据资源类型选择。

---

## 决策树：我应该走哪条路径？

```
图片类型？
├── 背景图 / 照片 / 大插画（不需要透明背景）
│   └── 走「路径 A：HEIC 压缩」          → 体积减小 50-70%
│
└── 图标 / 贴纸 / 角色（需要透明背景）
    ├── 用 sips -g hasAlpha 检查是否真有 alpha 通道
    │   ├── hasAlpha: yes  → 走「路径 B：直接缩放 + 入 Asset Catalog」
    │   └── hasAlpha: no   → 走「路径 C：AI 抠图恢复 alpha」  ← 最常见的坑
    └── 永远不要用 HEIC 保存图标（actool 会破坏 alpha 通道）
```

---

## ⚠️ 最重要的一课：肉眼看到的「透明」不一定真透明

macOS 的预览（Preview）和 QuickLook 默认在白色背景上渲染图片。如果你的图标本身有白色背景，但**没有 alpha 通道**，你在预览里看到的依然像是透明的——因为白底叠在白底上视觉上无法区分。

但当你把这张「假透明」PNG 放到 iOS 模拟器或真机的非白色背景上，白色色块就会暴露出来。

**唯一可靠的检查方法**：

```bash
sips -g hasAlpha icon_example.png
# hasAlpha: yes  → 真有 alpha
# hasAlpha: no   → 没 alpha，是 RGB（不是 RGBA），需要重新抠图

# 也可以用 file 命令辅助验证：
file icon_example.png
# "8-bit/color RGB"      → 没有 alpha（colorType=2）
# "8-bit/color RGBA"     → 有 alpha（colorType=6）
```

**AI 生成图（DALL·E / Midjourney / SDXL）的常见陷阱**：这些工具往往输出白底 RGB，看起来像剪过背景，但实际上没有 alpha 通道。

---

## 路径 A：HEIC 压缩（用于背景图 / 照片 / 不透明插画）

### 适用场景

- 全屏背景图（onboarding、卡片底图、水彩背景）
- 不需要透明区域的大插画
- 包体积是首要顾虑

### 不适用场景

- ❌ **任何需要透明的图标**——Xcode 的 `actool` 在编译 Asset Catalog 时会丢弃 HEIC 的 alpha 辅助图层，最终在 App 里图标会被白底淹没
- ❌ 已经有矢量源（SVG/PDF）的图标——直接用矢量更好

### 快速方案

**Finder 快捷操作（最简单）**：
1. 选中所有 PNG
2. 右键 → 快捷操作 → 转换图像 → 格式 `HEIF (HEIC)`，大小 `实际大小`

**命令行（脚本化）**：
```bash
# 使用内置 sips（无需安装）
for f in *.png; do
  sips -s format heic "$f" --out "${f%.png}.heic"
done

# 或 ImageMagick（可调质量）
brew install imagemagick
mogrify -format heic -quality 85 *.png
```

也可使用本技能附带的 [scripts/batch-convert-heic.sh](scripts/batch-convert-heic.sh)。

### Asset Catalog 集成

1. 拖入 `Assets.xcassets`（**禁止**直接放项目根目录作为散落资源——老设备读不到）
2. Compression 默认 `Default`；如果渐变出现色彩断层（banding），改为 `Lossless`
3. App Thinning 会自动为不支持 HEIC 的老设备在云端转回 PNG，无需手动维护两套

---

## 路径 B：图标已经有真 alpha 通道

**检查**：`sips -g hasAlpha icon_x.png` → `yes`

**步骤**：
```bash
# 1. 缩放到 512x512（图标尺寸标准）
sips -z 512 512 icon_x.png --out icon_x_512.png

# 2. 验证 alpha 仍然存在（sips 偶尔会丢 alpha）
sips -g hasAlpha icon_x_512.png

# 3. 拖入 Assets.xcassets
```

完成。

---

## 路径 C：图标没有 alpha，需要 AI 抠图（最常见场景）

### 为什么用 rembg + BiRefNet 而不是其他方法

对水彩 / 插画类图标的实测对比：

| 方案 | 质量 | 备注 |
|---|---|---|
| **rembg + BiRefNet** | ★★★★★ | 当前 SOTA（2024-2026），保留水彩软边、半透明笔触、浅色高光。**首选。** |
| rembg + isnet-general-use | ★★★★½ | 上一代 SOTA，仍然优秀，模型更小 |
| Apple Vision `VNGenerateForegroundInstanceMaskRequest` | ★★★½ | 对照片极好；对插画偏二值化，软边丢失 |
| rembg + u2net（默认） | ★★★★ | 通用可用，BiRefNet 更好 |
| `ffmpeg colorkey` 色键抠图 | ★★ | **会把图标内部的浅色高光也抠掉**（白色容差会击穿浅黄高光），强烈不推荐用于插画 |
| Preview Instant Alpha 手工 | ★★★ | 单图可以，批量太慢 |

### 完整流程（脚本化）

#### 1. 安装 rembg（一次性）

```bash
python3 -m venv ~/.venv/rembg
~/.venv/rembg/bin/pip install "rembg[cli]" Pillow onnxruntime
```

首次运行 BiRefNet 会自动下载模型（约 200MB），之后缓存在 `~/.u2net/`。

#### 2. 单张测试

```bash
~/.venv/rembg/bin/rembg i \
  -m birefnet-general \
  -ae 5 \
  input.png \
  output.png

# -m  模型选择（birefnet-general 最强）
# -ae 5  alpha matting edge refinement，软化边缘
```

#### 3. 批量处理 + 缩放（推荐脚本：`prepare-icons.sh`）

见 [scripts/prepare-icons.sh](scripts/prepare-icons.sh)。

用法：
```bash
bash prepare-icons.sh <源目录> <输出目录> [尺寸=512]

# 示例：将设计稿目录里所有 icon_*.png 抠图 + 缩放到 512x512
bash prepare-icons.sh \
  /Users/me/Projects/design/icons \
  /Users/me/Projects/design/icons/transparent_512 \
  512
```

脚本会：
1. 验证 rembg venv 存在
2. 对每个 `icon_*.png` 跑 BiRefNet
3. 用 `sips -z` 缩放到目标尺寸
4. 输出真 RGBA 透明 PNG，每张约 100-250 KB（原图 1-2 MB）

#### 4. 替换 Asset Catalog 中的 PNG

如果你的 `.imageset` 名称与源文件名一一对应（例如源 `icon_alarm_clock.png` ↔ Asset `event_icon_alarm_clock.imageset`），可以批量替换：

```bash
SRC=/path/to/transparent_512
ASSETS=/path/to/YourApp/Assets.xcassets

cd "$ASSETS"
for d in event_icon_*.imageset; do
  name="${d%.imageset}"           # event_icon_alarm_clock
  short="${name#event_icon_}"     # alarm_clock
  src="$SRC/icon_${short}.png"
  if [ -f "$src" ]; then
    cp "$src" "$d/${name}.png"
    cat > "$d/Contents.json" <<EOF
{
  "images" : [
    { "filename" : "${name}.png", "idiom" : "universal" }
  ],
  "info" : { "author" : "xcode", "version" : 1 }
}
EOF
  fi
done
```

---

## 验证清单（Asset 进项目之前）

- [ ] 透明图标已用 `sips -g hasAlpha` 验证 `hasAlpha: yes`
- [ ] 没有把图标存为 HEIC（actool 会破坏 alpha）
- [ ] 图标尺寸合理（典型 512×512 已足够 @3x 显示）
- [ ] 所有资源在 `Assets.xcassets`，不在项目根目录散落
- [ ] 模拟器里在**非白色**背景下查看（白底测试会掩盖假透明问题）
- [ ] 广色域（Display P3）图片转换后用 `sips -g profile` 检查色彩配置未丢失

---

## 常见坑点速查

| 现象 | 原因 | 修复 |
|---|---|---|
| 模拟器里图标有白底，预览里看起来透明 | PNG 是 RGB（colorType=2），不是 RGBA | 走路径 C 抠图 |
| HEIC 图标在 App 里变成白底矩形 | actool 在编译时丢弃了 HEIC alpha | 换成透明 PNG |
| 抠完图标内部出现"洞" | 用了 ffmpeg colorkey，浅色高光被当成背景抠掉 | 改用 rembg + BiRefNet |
| 转换后颜色变暗/饱和度降低 | 色彩配置（P3）在转换中丢失 | 用 Finder 快捷操作或预览 App 转换，会保留 profile |
| 图标边缘有锯齿或白边晕 | 抠图算法对软边处理不好 | 用 BiRefNet + `-ae 5` 参数 |

---

## 参考

- [Apple Asset Catalog 文档](https://developer.apple.com/library/archive/documentation/Xcode/Reference/xcode5_build_system_guide/)
- [App Thinning 详解](https://developer.apple.com/library/archive/qa/qa1357/_index.html)
- [rembg GitHub](https://github.com/danielgatis/rembg)
- [BiRefNet 论文](https://arxiv.org/abs/2401.03407)
