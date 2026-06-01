#!/usr/bin/env bash
# release-status.sh — Show progress of the latest release.
#
# Usage:  bash scripts/release-status.sh

set -euo pipefail

DIR=".asc/releases"
README="$DIR/README.md"

if [[ ! -f "$README" ]]; then
  echo "No release tracker found. Run: bash scripts/release-init.sh <version>"
  exit 0
fi

LATEST=$(grep -E '^Latest:' "$README" | sed -E 's/.*\*\*([^*]+)\*\*.*/\1/')
if [[ -z "$LATEST" ]]; then
  echo "Couldn't parse Latest from $README"
  exit 1
fi

FILE="$DIR/$LATEST.md"
if [[ ! -f "$FILE" ]]; then
  echo "Latest pointed to $LATEST but $FILE missing."
  exit 1
fi

echo "========================================"
echo "  Latest release: $LATEST"
echo "  File: $FILE"
echo "========================================"
echo ""

# Per-stage progress summary
awk '
  /^## Stage / { if (stage) printf "  %s: %d/%d done%s\n", stage, done_n, total_n, (done_n==total_n ? " ✅" : ""); stage=$0; sub(/^## /, "", stage); done_n=0; total_n=0; next }
  /^- \[x\]/ { done_n++; total_n++; next }
  /^- \[ \]/ { total_n++; next }
  END { if (stage) printf "  %s: %d/%d done%s\n", stage, done_n, total_n, (done_n==total_n ? " ✅" : "") }
' "$FILE"

echo ""
echo "Open items in current stage (first stage with unchecked items):"
awk '
  /^## Stage / { stage=$0; sub(/^## /, "", stage) }
  /^- \[ \]/ {
    if (!found_stage) { print "  [" stage "]"; found_stage=1 }
    print "  " $0
  }
' "$FILE" | head -10

echo ""
echo "Recent notes:"
tail -20 "$FILE" | sed 's/^/  /'
