#!/usr/bin/env bash
# preflight-questions.sh — Collect values needed for an iOS App Store release.
#
# Usage:
#   bash scripts/preflight-questions.sh [.asc/app.env]
#
# Reads existing values from the target env file (default: .asc/app.env)
# and prompts only for missing ones. Writes back the same file.
#
# Designed to be sourced by Claude (or any orchestrator) before any other
# release step. Quits early if Developer Program enrollment is "no".

set -euo pipefail

ENV_FILE="${1:-.asc/app.env}"
mkdir -p "$(dirname "$ENV_FILE")"
touch "$ENV_FILE"

# Load existing values into shell variables.
# shellcheck disable=SC1090
source "$ENV_FILE" 2>/dev/null || true

ask() {
  local var="$1"
  local prompt="$2"
  local default="${3:-}"
  local current="${!var:-}"

  if [[ -n "$current" ]]; then
    echo "  [keep] $var = $current"
    return
  fi

  read -r -p "  $prompt${default:+ [$default]}: " value
  value="${value:-$default}"

  printf '%s=%q\n' "$var" "$value" >> "$ENV_FILE"
  export "$var=$value"
}

echo "==> iOS App Store release preflight"
echo "Reading/writing: $ENV_FILE"
echo ""

# --- Hard preconditions ---
echo "1) Apple Developer Program enrolled? (individual/org/no)"
read -r -p "  enrolled: " ENROLLED
if [[ "$ENROLLED" == "no" ]]; then
  echo ""
  echo "Stop. Enroll first at https://developer.apple.com/programs/enroll/"
  echo "Organization requires D-U-N-S number (free, request via Apple's portal)."
  exit 1
fi
echo "ENROLLED_TYPE=$ENROLLED" >> "$ENV_FILE"

# --- Identity ---
echo ""
echo "2) Identity"
ask APP_ID            "App Store Connect APP_ID (from \`asc apps list\`; leave blank if not created yet)"
ask BUNDLE_ID         "Bundle ID (e.g. app.starluna.lunabee.ios)"
ask TEAM_ID           "Developer Team ID (10-char alphanumeric, your LLC team)"
ask COMPANY_NAME      "Company / Seller name (legal entity, e.g. StarLuna LLC)"

# --- App Store listing ---
echo ""
echo "3) App Store listing"
ask APP_STORE_NAME    "App Store Name (≤30 chars, e.g. 'Luna Bee: Family Organizer')"
ask SUBTITLE          "Subtitle (≤30 chars, different keywords from name)"
ask DISPLAY_NAME      "Home screen Display Name (short brand, e.g. 'Luna Bee')"
ask SKU               "SKU (permanent, no version, e.g. LUNABEE-IOS)"
ask PRIMARY_CATEGORY  "Primary App Store Category (PRODUCTIVITY, LIFESTYLE, EDUCATION, ...)" "PRODUCTIVITY"
ask SECONDARY_CATEGORY "Secondary Category (same enum)" "LIFESTYLE"
ask SUPPORT_URL       "Support URL" "https://your.app/help"
ask MARKETING_URL     "Marketing URL" "https://your.app"
ask PRIVACY_URL       "Privacy Policy URL" "https://your.app/privacy"

# --- Review contact ---
echo ""
echo "4) Reviewer contact (Apple may actually call)"
ask CONTACT_FIRST     "First name"
ask CONTACT_LAST      "Last name"
ask CONTACT_EMAIL     "Email"
ask CONTACT_PHONE     "Phone (E.164 format, e.g. +1 555 123 4567)"
ask DEMO_EMAIL        "Demo account email (or 'none')"
ask DEMO_PASSWORD     "Demo account password (or 'none')"

# --- Pricing / availability ---
echo ""
echo "5) Pricing & availability"
ask PRICING_MODEL     "Pricing model (free / paid)" "free"
ask BASE_TERRITORY    "Base territory for pricing" "United States"
ask TERRITORIES       "Territories: 'all' or comma-separated (e.g. 'US' or 'US,CA,UK,AU,IE')" "US"

# --- API key (for non-interactive flows) ---
echo ""
echo "6) ASC API key (for asc CLI)"
ask ASC_KEY_NAME      "asc auth profile name" "default"
ask ASC_KEY_ID        "API Key ID (10 chars)"
ask ASC_ISSUER_ID     "Issuer ID (UUID)"
ask ASC_KEY_PATH      "Absolute path to .p8 file" "$HOME/.appstoreconnect/AuthKey_XXXXXXXXXX.p8"
ask ASC_KEY_ROLE      "API Key role (Admin / Developer / App Manager) — Admin needed for cloud signing" "Admin"

echo ""
echo "==> Done. Values saved to $ENV_FILE"
echo ""
echo "Next steps (in order):"
echo "  1) Register bundle ID at developer.apple.com if not done"
echo "  2) Create app record at appstoreconnect.apple.com if not done"
echo "  3) bash scripts/asc-auth.sh         # log into asc CLI"
echo "  4) bash scripts/push-all-metadata.sh # push all metadata via API"
echo "  5) bash scripts/archive-and-export.sh # build IPA"
echo "  6) bash scripts/upload-ipa.sh        # upload + wait for processing"
echo "  7) (manual) Screenshots + App Privacy + Territories in ASC web UI"
echo "  8) bash scripts/validate-readiness.sh  # confirm 0 errors before submit"
echo "  9) (manual confirm) bash scripts/submit-for-review.sh"
