#!/usr/bin/env bash
# release-init.sh — Create a per-release progress file.
#
# Usage:  bash scripts/release-init.sh 1.0 [build=1]
#
# Writes to:
#   .asc/releases/<version>.md   — progress file with checkboxes
#   .asc/releases/README.md      — index pointing to latest

set -euo pipefail

VERSION="${1:?version required, e.g. 1.0}"
BUILD="${2:-1}"
DATE=$(date +%Y-%m-%d)

DIR=".asc/releases"
mkdir -p "$DIR"

FILE="$DIR/$VERSION.md"
if [[ -f "$FILE" ]]; then
  echo "Already exists: $FILE"
  exit 0
fi

cat > "$FILE" <<EOF
---
version: $VERSION
build: $BUILD
started: $DATE
status: in_progress
---

# Release $VERSION

## Stage 0: Preflight
- [ ] Apple Developer Program enrolled
- [ ] Bundle ID decided + registered
- [ ] App name / ASO bundle decided
- [ ] Bundle ID capabilities: Sign In with Apple, In-App Purchase (as needed)

## Stage 1: Tooling & auth
- [ ] asc CLI installed
- [ ] API key created (Admin role for full automation)
- [ ] asc auth login successful

## Stage 2: Bundle ID + App Record
- [ ] Bundle ID registered in Developer Portal
- [ ] App record created in ASC (APP_ID captured in .asc/app.env)

## Stage 3: Metadata + config (API push)
- [ ] Metadata pushed (name, subtitle, description, keywords, URLs, promo)
- [ ] Categories set
- [ ] Age rating set
- [ ] Content rights declared
- [ ] Copyright set
- [ ] Pricing schedule created
- [ ] Review contact details set
- [ ] Demo account configured

## Stage 4: Signing & Archive
- [ ] Project settings audited (iPad/dark mode/icon/permission strings)
- [ ] DEVELOPMENT_TEAM normalized in pbxproj
- [ ] Archive succeeded
- [ ] IPA exported

## Stage 5: Upload
- [ ] IPA uploaded to ASC
- [ ] Build processing complete (VALID)
- [ ] Build attached to version

## Stage 6: Manual web UI items
- [ ] Territory availability bootstrapped
- [ ] App Privacy questionnaire completed + Published
- [ ] Screenshots uploaded (6.9″ iPhone, ≥3)
- [ ] Subscription / IAP products configured (if applicable)

## Stage 7: Submit for Review
- [ ] Final asc validate shows 0 errors
- [ ] Human confirmation
- [ ] Submitted

## Blockers / Notes

### $DATE
- Release file created.
EOF

# Update README index — keep it simple, markdown table
README="$DIR/README.md"
if [[ ! -f "$README" ]]; then
  cat > "$README" <<EOF
# Release tracker

Latest: **$VERSION**

| Version | Build | Started | Status | File |
|---------|-------|---------|--------|------|
| $VERSION | $BUILD | $DATE | in_progress | [$VERSION.md]($VERSION.md) |
EOF
else
  # Insert new row at top of table, update Latest pointer
  perl -i -pe "s|^Latest: \\*\\*[^*]+\\*\\*|Latest: **$VERSION**|" "$README"
  # Insert after table header row (the |---|---| line)
  awk -v row="| $VERSION | $BUILD | $DATE | in_progress | [$VERSION.md]($VERSION.md) |" '
    /^\|-+\|/ && !inserted { print; print row; inserted=1; next }
    { print }
  ' "$README" > "$README.tmp" && mv "$README.tmp" "$README"
fi

echo "Created $FILE"
echo "Updated $README (Latest = $VERSION)"
