#!/usr/bin/env python3
"""Convert one or more images into a single PDF.

The order of image paths is the order of PDF pages. When --input-dir is used,
images are natural-sorted so image-2 comes before image-10.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


SUPPORTED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff"}


def natural_key(path: Path) -> list[object]:
    parts = re.split(r"(\d+)", path.name.lower())
    return [int(part) if part.isdigit() else part for part in parts]


def collect_images(input_dir: Path | None, explicit_images: list[Path]) -> list[Path]:
    if input_dir and explicit_images:
        raise SystemExit("Use either --input-dir or explicit image paths, not both.")

    if input_dir:
        if not input_dir.is_dir():
            raise SystemExit(f"Input directory does not exist: {input_dir}")
        images = [
            path
            for path in input_dir.iterdir()
            if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS
        ]
        return sorted(images, key=natural_key)

    return explicit_images


def validate_paths(images: list[Path], output: Path, overwrite: bool) -> None:
    if not images:
        raise SystemExit("No input images found.")

    for image in images:
        if not image.is_file():
            raise SystemExit(f"Input image does not exist: {image}")
        if image.suffix.lower() not in SUPPORTED_EXTENSIONS:
            raise SystemExit(f"Unsupported image extension: {image}")

    if output.exists() and not overwrite:
        raise SystemExit(f"Output already exists: {output}. Pass --overwrite to replace it.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Convert images into a single PDF.")
    parser.add_argument("images", nargs="*", type=Path, help="Input images in page order.")
    parser.add_argument("--input-dir", type=Path, help="Directory of images to natural-sort.")
    parser.add_argument("--output", required=True, type=Path, help="Output PDF path.")
    parser.add_argument("--overwrite", action="store_true", help="Replace existing output PDF.")
    args = parser.parse_args()

    try:
        import img2pdf
    except ImportError as exc:
        raise SystemExit(
            "Missing dependency: img2pdf. Install it with `python -m pip install img2pdf`."
        ) from exc

    images = collect_images(args.input_dir, args.images)
    validate_paths(images, args.output, args.overwrite)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("wb") as output_file:
        output_file.write(img2pdf.convert([str(image) for image in images]))

    print(f"Wrote {args.output} ({len(images)} page{'s' if len(images) != 1 else ''})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
