#!/usr/bin/env bash
set -euo pipefail

# sync-branches.sh — Safely synchronizes and pushes changes across dual-branch repos (uat <-> main)
#
# Usage:
#   ./scripts/sync-branches.sh [source_branch] [target_branch]
#

REPO_DIR="${PWD}"
CURRENT_BRANCH=$(git branch --show-current)

SOURCE="${1:-$CURRENT_BRANCH}"
if [ "$SOURCE" = "main" ]; then
  TARGET="${2:-uat}"
elif [ "$SOURCE" = "uat" ]; then
  TARGET="${2:-main}"
else
  TARGET="${2:-}"
fi

if [ -z "$TARGET" ]; then
  echo "❌ Error: Could not determine target branch. Specify: ./sync-branches.sh <source> <target>"
  exit 1
fi

echo "🔄 Dual-Branch Synchronization Pipeline"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📂 Repository:   $REPO_DIR"
echo "🌿 Source:       $SOURCE"
echo "🎯 Target:       $TARGET"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. Check working directory clean
if ! git diff-index --quiet HEAD --; then
  echo "❌ Error: Working tree has uncommitted changes. Please commit or stash first."
  exit 1
fi

# 2. Fetch latest remotes
echo "📡 Fetching origin..."
git fetch origin

# 3. Push source to remote
echo "🚀 Pushing $SOURCE to origin/$SOURCE..."
git push origin "$SOURCE"

# 4. Checkout target branch and merge
echo "🔀 Switching to $TARGET and fast-forwarding..."
git checkout "$TARGET"
git merge "$SOURCE" --ff-only

# 5. Push target to remote
echo "🚀 Pushing $TARGET to origin/$TARGET..."
git push origin "$TARGET"

# 6. Switch back to original branch
git checkout "$CURRENT_BRANCH"

# 7. Verify parity
COUNTS=$(git rev-list --left-right --count "origin/$SOURCE...origin/$TARGET")
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$COUNTS" = "0	0" ]; then
  echo "✅ Success! Both origin/$SOURCE and origin/$TARGET are 100% in sync."
else
  echo "⚠️ Warning: Parity check returned: $COUNTS (Expected: 0 0)"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
