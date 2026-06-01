#!/usr/bin/env bash
# submit-for-review.sh — Submit a prepared version for App Store review.
#
# ⚠️ HUMAN-IN-THE-LOOP REQUIRED.
#   Always run scripts/validate-readiness.sh first.
#   This script will prompt for explicit confirmation before submitting.

set -euo pipefail

ENV_FILE="${ENV_FILE:-.asc/app.env}"
# shellcheck disable=SC1090
source "$ENV_FILE"

: "${APP_ID:?missing APP_ID}"
VERSION="${VERSION:-1.0}"

echo "==> Pre-submit validation"
ERRORS=$(asc validate --app "$APP_ID" --version "$VERSION" --platform IOS --strict --output table 2>&1 | grep -cE "^│ error" || true)
if [[ "$ERRORS" -gt 0 ]]; then
  echo "!! $ERRORS errors remain. Run scripts/validate-readiness.sh for details."
  exit 1
fi

# Find latest build
BUILD_ID=$(asc builds list --app "$APP_ID" --output json 2>/dev/null \
  | jq -r '.data | map(select(.attributes.processingState=="VALID")) | sort_by(.attributes.uploadedDate) | last | .id')
if [[ -z "$BUILD_ID" || "$BUILD_ID" == "null" ]]; then
  echo "!! No VALID build found. Upload first or wait for processing."
  exit 1
fi
echo "  using build: $BUILD_ID"

# Dry run
echo ""
echo "==> Dry-run preview"
asc review submit --app "$APP_ID" --version "$VERSION" --build "$BUILD_ID" --dry-run --output table 2>&1 | tail -20

# Confirm
echo ""
echo "============================================================"
echo "  About to submit version $VERSION for Apple App Store review."
echo "  Apple reviewers typically respond in 24-48 hours."
echo "  Once submitted, the version is locked until review completes."
echo "============================================================"
read -r -p "Type 'submit' to proceed: " CONFIRM
if [[ "$CONFIRM" != "submit" ]]; then
  echo "Cancelled."
  exit 0
fi

asc review submit --app "$APP_ID" --version "$VERSION" --build "$BUILD_ID" --confirm

echo ""
echo "==> Submitted. Watch status with:"
echo "  asc status --app $APP_ID"
echo "  asc submit status --version-id $(asc versions list --app $APP_ID --output json | jq -r --arg v $VERSION '.data[] | select(.attributes.versionString==$v) | .id')"
