#!/usr/bin/env bash
# release-mark.sh — Mark a checkbox done/undone in the latest release file.
#
# Usage:
#   bash scripts/release-mark.sh done "Metadata pushed"
#   bash scripts/release-mark.sh undo "Build processing complete"
#   bash scripts/release-mark.sh note "exportArchive failed because <reason>"

set -euo pipefail

ACTION="${1:?action: done | undo | note}"
TEXT="${2:?text}"

DIR=".asc/releases"
README="$DIR/README.md"
[[ -f "$README" ]] || { echo "No tracker. Run release-init.sh first."; exit 1; }

LATEST=$(grep -E '^Latest:' "$README" | sed -E 's/.*\*\*([^*]+)\*\*.*/\1/')
FILE="$DIR/$LATEST.md"
[[ -f "$FILE" ]] || { echo "Latest file missing: $FILE"; exit 1; }

case "$ACTION" in
  done)
    # Find line containing TEXT and flip [ ] → [x]
    if grep -qF -- "- [ ] $TEXT" "$FILE"; then
      sed -i '' "s|- \[ \] $TEXT|- [x] $TEXT|" "$FILE"
      echo "✓ marked: $TEXT"
    elif grep -qF -- "[x] $TEXT" "$FILE"; then
      echo "(already done) $TEXT"
    else
      # Fuzzy match: find first unchecked line containing TEXT
      LINE=$(grep -nF -- "$TEXT" "$FILE" | grep -F -- "[ ]" | head -1 | cut -d: -f1 || true)
      if [[ -n "$LINE" ]]; then
        sed -i '' "${LINE}s|\[ \]|\[x\]|" "$FILE"
        echo "✓ marked (fuzzy): line $LINE"
      else
        echo "!! couldn't find: $TEXT"
        exit 1
      fi
    fi
    ;;
  undo)
    if grep -qF -- "- [x] $TEXT" "$FILE"; then
      sed -i '' "s|- \[x\] $TEXT|- [ ] $TEXT|" "$FILE"
      echo "✗ unmarked: $TEXT"
    else
      echo "!! not currently marked done: $TEXT"
      exit 1
    fi
    ;;
  note)
    DATE=$(date +%Y-%m-%d)
    # Find or append a dated heading under Blockers / Notes
    if ! grep -qE "^### $DATE\$" "$FILE"; then
      printf '\n### %s\n' "$DATE" >> "$FILE"
    fi
    printf -- '- %s\n' "$TEXT" >> "$FILE"
    echo "✎ noted under ### $DATE"
    ;;
  *)
    echo "Unknown action: $ACTION (use done | undo | note)"
    exit 1
    ;;
esac
