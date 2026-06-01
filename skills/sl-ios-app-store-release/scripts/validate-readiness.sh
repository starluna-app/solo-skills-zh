#!/usr/bin/env bash
# validate-readiness.sh — Show what's left before submission.

set -euo pipefail

ENV_FILE="${ENV_FILE:-.asc/app.env}"
# shellcheck disable=SC1090
source "$ENV_FILE"

: "${APP_ID:?missing APP_ID}"
VERSION="${VERSION:-1.0}"

echo "==> Running asc validate"
asc validate --app "$APP_ID" --version "$VERSION" --platform IOS --strict --output table 2>&1 \
  | grep -E "^│ (error|warning|info)" || echo "    no issues"

echo ""
echo "==> Manual web UI checks Apple's API can't verify:"
echo "  [ ] App Privacy published: https://appstoreconnect.apple.com/apps/$APP_ID/appPrivacy"
echo "  [ ] App availability set: https://appstoreconnect.apple.com/apps/$APP_ID/distribution/pricing"
echo "  [ ] Screenshots uploaded for at least 6.9\" iPhone: https://appstoreconnect.apple.com/apps/$APP_ID/distribution"
echo "  [ ] Subscriptions / IAPs configured (if any): https://appstoreconnect.apple.com/apps/$APP_ID/distribution/subscriptions"
echo ""
echo "When validate shows 0 errors AND all 4 web UI items are confirmed:"
echo "  bash scripts/submit-for-review.sh"
