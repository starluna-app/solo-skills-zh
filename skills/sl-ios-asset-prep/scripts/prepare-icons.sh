#!/bin/bash
#
# prepare-icons.sh — iOS 图标透明背景批量处理
#
# 工作流：
#   1. 用 rembg + BiRefNet 抠图（恢复真 alpha 通道）
#   2. 用 sips 缩放到目标尺寸（默认 512×512）
#   3. 输出 RGBA 透明 PNG，可直接放入 Xcode Assets.xcassets
#
# 用法：
#   bash prepare-icons.sh <源目录> <输出目录> [尺寸=512] [文件名前缀=icon_]
#
# 示例：
#   bash prepare-icons.sh ./design/icons ./design/icons/transparent_512
#   bash prepare-icons.sh ./raw ./out 1024 sticker_
#
# 前置安装（一次性）：
#   python3 -m venv ~/.venv/rembg
#   ~/.venv/rembg/bin/pip install "rembg[cli]" Pillow onnxruntime

set -e

SRC_DIR="${1:-}"
OUT_DIR="${2:-}"
SIZE="${3:-512}"
PREFIX="${4:-icon_}"

REMBG_BIN="${REMBG_BIN:-$HOME/.venv/rembg/bin/rembg}"
MODEL="${MODEL:-birefnet-general}"
EDGE_REFINE="${EDGE_REFINE:-5}"

# ---- 参数校验 ----
if [ -z "$SRC_DIR" ] || [ -z "$OUT_DIR" ]; then
  echo "用法: bash $(basename "$0") <源目录> <输出目录> [尺寸=512] [前缀=icon_]"
  exit 1
fi

if [ ! -d "$SRC_DIR" ]; then
  echo "❌ 源目录不存在: $SRC_DIR"
  exit 1
fi

if [ ! -x "$REMBG_BIN" ]; then
  echo "❌ 找不到 rembg: $REMBG_BIN"
  echo ""
  echo "请先安装："
  echo "  python3 -m venv ~/.venv/rembg"
  echo "  ~/.venv/rembg/bin/pip install \"rembg[cli]\" Pillow onnxruntime"
  echo ""
  echo "或设置 REMBG_BIN 指向你的 rembg 可执行文件。"
  exit 1
fi

mkdir -p "$OUT_DIR"

echo "🎨 iOS 图标准备流水线"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📂 源目录:   $SRC_DIR"
echo "📂 输出目录: $OUT_DIR"
echo "📏 尺寸:     ${SIZE}×${SIZE}"
echo "🏷  前缀:     ${PREFIX}*.png"
echo "🤖 模型:     $MODEL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

OK=0
FAIL=0
SKIP=0

shopt -s nullglob
for src in "$SRC_DIR"/${PREFIX}*.png; do
  base=$(basename "$src")
  # 规范化文件名：空格 → 下划线（修复像 "icon_yoga pose.png" 这种）
  out_name="${base// /_}"
  out="$OUT_DIR/$out_name"

  # 已处理且较新则跳过
  if [ -f "$out" ] && [ "$out" -nt "$src" ]; then
    echo "⏭  跳过（已存在）: $base"
    SKIP=$((SKIP + 1))
    continue
  fi

  echo -n "🔧 $base ... "

  if "$REMBG_BIN" i -m "$MODEL" -ae "$EDGE_REFINE" "$src" "$out" 2>/dev/null \
     && sips -z "$SIZE" "$SIZE" "$out" --out "$out" >/dev/null 2>&1; then
    # 验证 alpha
    if sips -g hasAlpha "$out" 2>/dev/null | grep -q "hasAlpha: yes"; then
      size=$(du -h "$out" | cut -f1)
      echo "✅ ($size, RGBA)"
      OK=$((OK + 1))
    else
      echo "⚠️  生成成功但 alpha 丢失"
      FAIL=$((FAIL + 1))
    fi
  else
    echo "❌ 失败"
    FAIL=$((FAIL + 1))
  fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ 成功: $OK   ⏭  跳过: $SKIP   ❌ 失败: $FAIL"
echo ""

if [ "$OK" -eq 0 ] && [ "$SKIP" -eq 0 ]; then
  echo "⚠️  没找到匹配 ${PREFIX}*.png 的文件"
  exit 1
fi

echo "💡 下一步："
echo "  1. 用 Preview 在深色背景下检查抠图质量"
echo "  2. 复制到 Xcode Assets.xcassets 的对应 .imageset 目录"
echo "  3. 同步更新每个 .imageset 的 Contents.json（参考 SKILL.md 第 4 步）"
