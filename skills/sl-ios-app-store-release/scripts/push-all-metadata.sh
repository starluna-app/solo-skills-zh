#!/usr/bin/env bash
# push-all-metadata.sh — Push everything API-pushable to App Store Connect.
#
# Reads values from .asc/app.env (run preflight-questions.sh first).
# Expects metadata/version/$VERSION/$LOCALE/ to contain canonical .txt files.

set -euo pipefail

ENV_FILE="${ENV_FILE:-.asc/app.env}"
# shellcheck disable=SC1090
source "$ENV_FILE"

: "${APP_ID:?missing APP_ID}"
: "${PRIMARY_CATEGORY:?missing PRIMARY_CATEGORY}"
: "${SECONDARY_CATEGORY:?missing SECONDARY_CATEGORY}"
: "${COMPANY_NAME:?missing COMPANY_NAME}"
: "${CONTACT_FIRST:?missing CONTACT_FIRST}"
: "${CONTACT_LAST:?missing CONTACT_LAST}"
: "${CONTACT_EMAIL:?missing CONTACT_EMAIL}"
: "${CONTACT_PHONE:?missing CONTACT_PHONE}"

VERSION="${VERSION:-1.0}"
LOCALE="${LOCALE:-en-US}"
METADATA_DIR="${METADATA_DIR:-./metadata}"
ASC_DIR="${ASC_DIR:-./metadata-asc}"

# ---- 1) Convert .txt → canonical JSON for asc ----
echo "==> Converting $METADATA_DIR/version/$VERSION/$LOCALE → $ASC_DIR/"
mkdir -p "$ASC_DIR/app-info" "$ASC_DIR/version/$VERSION"

read_or_empty() { [[ -f "$1" ]] && cat "$1" || echo ""; }
APP_NAME=$(read_or_empty "$METADATA_DIR/version/$VERSION/$LOCALE/name.txt")
SUBTITLE=$(read_or_empty "$METADATA_DIR/version/$VERSION/$LOCALE/subtitle.txt")
PRIVACY_URL_F=$(read_or_empty "$METADATA_DIR/version/$VERSION/$LOCALE/privacy_url.txt")
SUPPORT_URL_F=$(read_or_empty "$METADATA_DIR/version/$VERSION/$LOCALE/support_url.txt")
MARKETING_URL_F=$(read_or_empty "$METADATA_DIR/version/$VERSION/$LOCALE/marketing_url.txt")
KEYWORDS=$(read_or_empty "$METADATA_DIR/version/$VERSION/$LOCALE/keywords.txt")
PROMO=$(read_or_empty "$METADATA_DIR/version/$VERSION/$LOCALE/promotional_text.txt")
DESC_FILE="$METADATA_DIR/version/$VERSION/$LOCALE/description.txt"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required (brew install jq)"; exit 1
fi

jq -n \
  --arg name "$APP_NAME" \
  --arg subtitle "$SUBTITLE" \
  --arg privacyPolicyUrl "$PRIVACY_URL_F" \
  '{name: $name, subtitle: $subtitle, privacyPolicyUrl: $privacyPolicyUrl}' \
  > "$ASC_DIR/app-info/$LOCALE.json"

DESC=$(jq -Rs . < "$DESC_FILE")
jq -n \
  --argjson description "$DESC" \
  --arg keywords "$KEYWORDS" \
  --arg marketingUrl "$MARKETING_URL_F" \
  --arg promotionalText "$PROMO" \
  --arg supportUrl "$SUPPORT_URL_F" \
  '{
    description: $description,
    keywords: $keywords,
    marketingUrl: $marketingUrl,
    promotionalText: $promotionalText,
    supportUrl: $supportUrl
  }' \
  > "$ASC_DIR/version/$VERSION/$LOCALE.json"

# NOTE: whatsNew intentionally omitted for first release (Apple rejects it).
# Add it back for v1.1+:
#   --arg whatsNew "$(cat metadata/version/$VERSION/$LOCALE/whats_new.txt)"
#   ... and include in the object above

echo "    canonical files written"

# ---- 2) Push metadata ----
echo "==> Pushing localizations to ASC"
asc metadata push --app "$APP_ID" --version "$VERSION" --platform IOS --dir "$ASC_DIR" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('  applied:', d.get('applied')); print('  adds:', len(d.get('adds',[])))"

# ---- 3) Categories ----
echo "==> Setting categories: $PRIMARY_CATEGORY / $SECONDARY_CATEGORY"
asc categories set --app "$APP_ID" --primary "$PRIMARY_CATEGORY" --secondary "$SECONDARY_CATEGORY" \
  > /dev/null && echo "    OK"

# ---- 4) Content rights ----
echo "==> Content rights → DOES_NOT_USE_THIRD_PARTY_CONTENT"
asc apps update --id "$APP_ID" --content-rights DOES_NOT_USE_THIRD_PARTY_CONTENT > /dev/null && echo "    OK"

# ---- 5) Age rating (safe default: all NONE → 4+) ----
echo "==> Age rating → all NONE (4+)"
asc age-rating edit --app "$APP_ID" --all-none > /dev/null && echo "    OK"

# ---- 6) Pricing (free baseline) ----
if [[ "${PRICING_MODEL:-free}" == "free" ]]; then
  YESTERDAY=$(date -v-1d +%Y-%m-%d 2>/dev/null || date -d "yesterday" +%Y-%m-%d)
  echo "==> Free pricing schedule (start $YESTERDAY, base ${BASE_TERRITORY:-United States})"
  if asc pricing schedule view --app "$APP_ID" --output json 2>/dev/null | grep -q '"id"'; then
    echo "    pricing schedule exists; skipping create"
  else
    asc pricing schedule create --app "$APP_ID" --free --base-territory "${BASE_TERRITORY:-United States}" --start-date "$YESTERDAY" > /dev/null && echo "    OK"
  fi
else
  echo "==> Paid pricing — manual setup in ASC (script doesn't handle price points yet)"
fi

# ---- 7) Copyright ----
VERSION_ID=$(asc versions list --app "$APP_ID" --output json 2>/dev/null | jq -r --arg v "$VERSION" '.data[] | select(.attributes.versionString==$v) | .id' | head -1)
if [[ -n "$VERSION_ID" ]]; then
  echo "==> Copyright → 2026 $COMPANY_NAME"
  YEAR=$(date +%Y)
  asc versions update --version-id "$VERSION_ID" --copyright "$YEAR $COMPANY_NAME" > /dev/null && echo "    OK"
else
  echo "    !! couldn't resolve VERSION_ID for $VERSION; skipping copyright"
fi

# ---- 8) Review contact + demo creds ----
echo "==> Review contact details"
# Try create first, fall back to update if already exists
DETAIL_OUT=$(asc review details-create \
  --version-id "$VERSION_ID" \
  --contact-first-name "$CONTACT_FIRST" \
  --contact-last-name "$CONTACT_LAST" \
  --contact-email "$CONTACT_EMAIL" \
  --contact-phone "$CONTACT_PHONE" \
  --notes "${REVIEW_NOTES:-Test the app using the demo credentials on the auth screen.}" 2>&1) || true

DETAIL_ID=$(echo "$DETAIL_OUT" | python3 -c "import sys,json;
try: print(json.loads(sys.stdin.read())['data']['id'])
except: pass" 2>/dev/null || true)

if [[ -z "$DETAIL_ID" ]]; then
  # fetch existing
  DETAIL_ID=$(asc review details-for-version --version-id "$VERSION_ID" --output json 2>/dev/null | jq -r '.data.id // .data[0].id' 2>/dev/null || true)
fi

if [[ -n "$DETAIL_ID" && "${DEMO_EMAIL:-none}" != "none" ]]; then
  echo "==> Demo account → $DEMO_EMAIL"
  asc review details-update --id "$DETAIL_ID" \
    --demo-account-required=true \
    --demo-account-name "$DEMO_EMAIL" \
    --demo-account-password "$DEMO_PASSWORD" > /dev/null && echo "    OK"
fi

# ---- 9) Mark release tracker ----
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MARK="$SKILL_DIR/release-mark.sh"
if [[ -x "$MARK" && -f ".asc/releases/README.md" ]]; then
  bash "$MARK" done "Metadata pushed (name, subtitle, description, keywords, URLs, promo)" || true
  bash "$MARK" done "Categories set" || true
  bash "$MARK" done "Age rating set" || true
  bash "$MARK" done "Content rights declared" || true
  bash "$MARK" done "Copyright set" || true
  bash "$MARK" done "Pricing schedule created" || true
  [[ -n "${DETAIL_ID:-}" ]] && bash "$MARK" done "Review contact details set" || true
  [[ "${DEMO_EMAIL:-none}" != "none" ]] && bash "$MARK" done "Demo account configured" || true
fi

# ---- 10) Final validate ----
echo ""
echo "==> Current validation state:"
asc validate --app "$APP_ID" --version "$VERSION" --platform IOS --output table 2>&1 \
  | grep -cE "^│ (error|warning)" || true
echo "(use scripts/validate-readiness.sh for full report)"
