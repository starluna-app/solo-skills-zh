---
name: sl_image-to-pdf
description: 将一张或多张图片转换成 PDF。支持把 image-1、image-2、image-3 等多张图片按顺序合并为一个多页 PDF；第一页对应第一张图片，第二页对应第二张图片，依此类推。当用户提到 image to PDF、图片转 PDF、多图合并 PDF、PNG/JPG 转 PDF、把多张图做成一个 PDF 时使用。
---

# Image to PDF

把一张或多张图片转换成 PDF。默认目标是稳定、可重复、少损耗：优先使用 `img2pdf`，因为它会把图片嵌入 PDF，避免不必要的重新栅格化。

## 默认工作流

1. 确认输入图片路径和输出 PDF 路径。
2. 如果用户给的是目录，按自然排序读取图片文件，例如：
   - `image-1.png`
   - `image-2.png`
   - `image-3.png`
3. 使用本技能脚本生成单个 PDF。
4. 验证页数、文件类型和输出路径。

## 脚本

优先使用：

```bash
python skills/sl_image-to-pdf/scripts/images_to_pdf.py \
  --output output.pdf \
  image-1.png image-2.png image-3.png
```

目录输入：

```bash
python skills/sl_image-to-pdf/scripts/images_to_pdf.py \
  --output output.pdf \
  --input-dir ./images
```

上面的目录模式会把目录中的图片按自然排序合并成一个 PDF，所以 `image-1.png` 是第 1 页，`image-2.png` 是第 2 页，`image-3.png` 是第 3 页。

## 支持格式

默认支持：

- `.png`
- `.jpg`
- `.jpeg`
- `.webp`
- `.tif`
- `.tiff`

如果 `img2pdf` 无法直接处理某个格式，先用 Pillow 或 ImageMagick 转成 PNG/JPEG，再重新运行脚本。

## 依赖

如果缺少 `img2pdf`：

```bash
python -m pip install img2pdf
```

不要把依赖安装到项目里，除非用户明确要求。优先使用当前环境、虚拟环境，或用户已有的 Python 工具链。

## 质量检查

生成后运行：

```bash
file output.pdf
```

如果有 `pdfinfo`：

```bash
pdfinfo output.pdf | rg '^Pages:'
```

没有 `pdfinfo` 时，可以用 Python 检查页数：

```bash
python - <<'PY'
from pypdf import PdfReader
reader = PdfReader("output.pdf")
print(len(reader.pages))
PY
```

如果没有 `pypdf`，只要 `img2pdf` 命令成功并且 `file` 显示 PDF，通常已经足够；除非用户明确要求页数验证。

## 注意事项

- 多图转单个 PDF 时，输入顺序就是页序。
- 用户提供显式文件列表时，不要重新排序，尊重用户给出的顺序。
- 用户提供目录时，使用自然排序，而不是普通字典序，避免 `image-10.png` 排到 `image-2.png` 前面。
- 不要覆盖已有 PDF，除非用户明确同意。默认改用新文件名或询问用户。
- 对打印资源，保留原图尺寸和比例；不要擅自裁切、拉伸或压缩。
