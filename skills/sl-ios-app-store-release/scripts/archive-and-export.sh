#!/usr/bin/env bash
# archive-and-export.sh — Build a signed App Store IPA.
#
# Expects:
#   .asc/app.env populated (TEAM_ID, BUNDLE_ID, SCHEME, PROJECT)
#   ExportOptions.plist exists at repo root with method=app-store-connect

set -euo pipefail

ENV_FILE="${ENV_FILE:-.asc/app.env}"
# shellcheck disable=SC1090
source "$ENV_FILE"

: "${TEAM_ID:?missing TEAM_ID in $ENV_FILE}"
PROJECT="${PROJECT:-$(ls *.xcodeproj 2>/dev/null | head -1)}"
SCHEME="${SCHEME:-${PROJECT%.xcodeproj}}"

if [[ -z "$PROJECT" ]]; then
  echo "No .xcodeproj found. Set PROJECT env var or run from project root."
  exit 1
fi

ARCHIVE_PATH="build/$SCHEME.xcarchive"
EXPORT_PATH="build/ipa"
EXPORT_OPTIONS="${EXPORT_OPTIONS:-ExportOptions.plist}"

# ---- Sanity checks ----
if [[ ! -f "$EXPORT_OPTIONS" ]]; then
  echo "ExportOptions.plist not found. Create one with:"
  cat <<EOF

<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store-connect</string>
    <key>teamID</key>
    <string>$TEAM_ID</string>
    <key>destination</key>
    <string>export</string>
    <key>signingStyle</key>
    <string>automatic</string>
    <key>stripSwiftSymbols</key>
    <true/>
    <key>uploadSymbols</key>
    <true/>
</dict>
</plist>

EOF
  exit 1
fi

# ---- Check pbxproj for team consistency ----
echo "==> Checking pbxproj DEVELOPMENT_TEAM consistency"
TEAMS=$(grep "DEVELOPMENT_TEAM" "$PROJECT/project.pbxproj" | awk -F'= ' '{print $2}' | tr -d ';' | sort -u)
TEAM_COUNT=$(echo "$TEAMS" | wc -l | tr -d ' ')
if [[ "$TEAM_COUNT" != "1" ]]; then
  echo "!! pbxproj has $TEAM_COUNT different DEVELOPMENT_TEAM values:"
  echo "$TEAMS"
  echo ""
  echo "Run this to normalize (replace XXX with your real personal team ID):"
  echo "  sed -i '' 's/DEVELOPMENT_TEAM = XXX;/DEVELOPMENT_TEAM = $TEAM_ID;/g' $PROJECT/project.pbxproj"
  exit 1
fi
if [[ "$TEAMS" != "$TEAM_ID" ]]; then
  echo "!! pbxproj team ($TEAMS) ≠ TEAM_ID ($TEAM_ID)"
  exit 1
fi

# ---- Archive ----
echo "==> Archiving (this takes 3-10 minutes)"
rm -rf "$ARCHIVE_PATH" "$EXPORT_PATH"
xcodebuild -project "$PROJECT" -scheme "$SCHEME" \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE_PATH" \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  -allowProvisioningUpdates \
  archive 2>&1 | tail -5

if [[ ! -d "$ARCHIVE_PATH" ]]; then
  echo "!! archive failed"
  exit 1
fi

# ---- Verify team identifier in the signed binary ----
APP_PATH="$ARCHIVE_PATH/Products/Applications/$SCHEME.app"
echo ""
echo "==> Verifying signed team identifier"
SIGNED_TEAM=$(codesign -dv --verbose=4 "$APP_PATH" 2>&1 | awk -F= '/TeamIdentifier/{print $2}')
echo "    TeamIdentifier=$SIGNED_TEAM (expected $TEAM_ID)"
if [[ "$SIGNED_TEAM" != "$TEAM_ID" ]]; then
  echo "!! signed under wrong team — see references/signing-troubleshoot.md"
  exit 1
fi

# ---- Export IPA ----
echo ""
echo "==> Exporting App Store IPA"
# NOTE: we deliberately do NOT pass -authenticationKey* args; they require Admin
# API key role for cloud signing. Without them, xcodebuild uses the local Apple
# ID session (Xcode must be signed in).
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_PATH" \
  -exportOptionsPlist "$EXPORT_OPTIONS" \
  -allowProvisioningUpdates 2>&1 | tail -5

if ! ls "$EXPORT_PATH"/*.ipa 2>/dev/null; then
  echo "!! IPA export failed — see references/signing-troubleshoot.md"
  exit 1
fi

IPA_PATH=$(ls "$EXPORT_PATH"/*.ipa | head -1)
echo ""
echo "==> Success"
echo "IPA: $IPA_PATH"
echo "Size: $(du -h "$IPA_PATH" | cut -f1)"

# Mark release tracker
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MARK="$SKILL_DIR/release-mark.sh"
if [[ -x "$MARK" && -f ".asc/releases/README.md" ]]; then
  bash "$MARK" done "Archive succeeded" || true
  bash "$MARK" done "IPA exported" || true
fi

echo ""
echo "Next: bash scripts/upload-ipa.sh"
