#!/usr/bin/env bash
# upload-ipa.sh — Upload an App Store IPA and wait for processing.

set -euo pipefail

ENV_FILE="${ENV_FILE:-.asc/app.env}"
# shellcheck disable=SC1090
source "$ENV_FILE"

: "${APP_ID:?missing APP_ID}"

IPA_PATH="${IPA_PATH:-$(ls build/ipa/*.ipa 2>/dev/null | head -1)}"
if [[ -z "$IPA_PATH" || ! -f "$IPA_PATH" ]]; then
  echo "No IPA found at build/ipa/. Run scripts/archive-and-export.sh first."
  exit 1
fi

echo "==> Uploading $IPA_PATH to App Store Connect"
echo "    This does NOT submit for review. It just uploads + Apple's automated processing."

asc publish appstore \
  --app "$APP_ID" \
  --ipa "$IPA_PATH" \
  --wait \
  --confirm

# Mark release tracker
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MARK="$SKILL_DIR/release-mark.sh"
if [[ -x "$MARK" && -f ".asc/releases/README.md" ]]; then
  bash "$MARK" done "IPA uploaded to ASC" || true
  bash "$MARK" done "Build processing complete" || true
fi

echo ""
echo "==> Build uploaded. Next:"
echo "  - Check status: asc builds list --app $APP_ID"
echo "  - When build status = VALID, it's available to attach to a version"
echo "  - Continue manual work (screenshots, App Privacy, availability) in parallel"
