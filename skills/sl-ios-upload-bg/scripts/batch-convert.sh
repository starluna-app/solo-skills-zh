#!/bin/bash

# iOS 项目图片批量转 HEIC
# 用法：bash batch-convert.sh [目录] [质量:0-100，默认85]
#
# 示例：
#   bash batch-convert.sh                    # 当前目录，质量 85
#   bash batch-convert.sh ./Assets 90        # 指定目录和质量
#   bash batch-convert.sh ./Assets/Icons 100 # 无损转换

SOURCE_DIR="${1:-.}"
QUALITY="${2:-85}"

# 检查 ImageMagick 是否已安装
if ! command -v magick &> /dev/null; then
    echo "❌ ImageMagick 未安装"
    echo "请先运行: brew install imagemagick"
    exit 1
fi

# 检查目录是否存在
if [ ! -d "$SOURCE_DIR" ]; then
    echo "❌ 目录不存在: $SOURCE_DIR"
    exit 1
fi

echo "📦 iOS 图片批量转换工具"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📂 源目录: $SOURCE_DIR"
echo "🎨 质量等级: $QUALITY (0-100, 85推荐)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

COUNT=0
FAILED=0

for png_file in "$SOURCE_DIR"/*.png; do
    if [ -f "$png_file" ]; then
        filename=$(basename "$png_file")
        heic_file="${png_file%.png}.heic"
        heic_filename=$(basename "$heic_file")

        echo -n "⏳ 转换: $filename ... "

        if magick "$png_file" -quality "$QUALITY" "$heic_file" 2>/dev/null; then
            # 获取文件大小用于对比
            png_size=$(du -h "$png_file" | cut -f1)
            heic_size=$(du -h "$heic_file" | cut -f1)
            echo "✅ ($png_size → $heic_size)"
            COUNT=$((COUNT + 1))
        else
            echo "❌ 失败"
            FAILED=$((FAILED + 1))
        fi
    fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $COUNT -eq 0 ]; then
    if [ $FAILED -eq 0 ]; then
        echo "⚠️  未找到 PNG 文件"
    else
        echo "❌ 转换失败: $FAILED 张"
    fi
    exit 1
else
    echo "✅ 完成！"
    echo "   成功转换: $COUNT 张"
    if [ $FAILED -gt 0 ]; then
        echo "   失败: $FAILED 张"
    fi
fi

echo ""
echo "💡 下一步："
echo "   1. 检查生成的 .heic 文件"
echo "   2. 拖入 Xcode Assets.xcassets"
echo "   3. 删除原始 .png 文件（可选）"
