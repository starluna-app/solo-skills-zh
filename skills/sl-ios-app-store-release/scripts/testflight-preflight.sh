#!/usr/bin/env bash
# testflight-preflight.sh — Read-only preflight for an internal TestFlight iteration.
# Run this in the same terminal/process that will archive and publish the build.

set -euo pipefail

usage() {
  echo "Usage: $0 <marketing-version> [env-file]"
  echo "Example: $0 1.0 .asc/app.env"
}

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage
  exit 64
fi

MARKETING_VERSION="$1"
ENV_FILE="${2:-.asc/app.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "FAIL: environment file not found: $ENV_FILE"
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

: "${APP_ID:?missing APP_ID in $ENV_FILE}"
: "${BUNDLE_ID:?missing BUNDLE_ID in $ENV_FILE}"
: "${SCHEME:?missing SCHEME in $ENV_FILE}"

TEAM_ID="${TEAM_ID:-${DEVELOPMENT_TEAM:-}}"
PROJECT="${PROJECT:-$(find . -maxdepth 1 -name '*.xcodeproj' -print -quit)}"
KEYCHAIN_PATH="${KEYCHAIN_PATH:-$HOME/Library/Keychains/login.keychain-db}"

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "FAIL: required command not found: $1"
    exit 1
  }
}

for command_name in asc security; do
  require_command "$command_name"
done

TTY_CONTEXT="$(tty 2>/dev/null || true)"
if [[ -z "$TTY_CONTEXT" || "$TTY_CONTEXT" == "not a tty" ]]; then
  TTY_CONTEXT="non-interactive"
fi

echo "==> Internal TestFlight preflight"
echo "    app=$APP_ID bundle=$BUNDLE_ID scheme=$SCHEME version=$MARKETING_VERSION"
echo "    context=$TTY_CONTEXT"

echo "==> Checking login keychain access"
if ! security show-keychain-info "$KEYCHAIN_PATH" >/dev/null 2>&1; then
  cat <<EOF
FAIL: the login keychain is unavailable or locked in this execution context.

Run this command in this same terminal, enter the macOS login password, then rerun preflight:
  security unlock-keychain "$KEYCHAIN_PATH"
EOF
  exit 1
fi

echo "==> Checking App Store Connect authentication in this same context"
if ! asc auth status; then
  cat <<'EOF'
FAIL: asc cannot read its credentials here.
Do not assume the API key or .p8 is missing. First rerun this script from the terminal
that normally releases the app. Re-register credentials only after that same terminal fails.
EOF
  exit 1
fi

echo "==> Checking ASC app identity and next safe build number"
if ! asc apps view --id "$APP_ID" --output json >/dev/null; then
  cat <<'EOF'
FAIL: asc authentication exists but cannot query this app from this execution context.
Check the active profile/role and retry here; do not create a replacement API key yet.
EOF
  exit 1
fi

NEXT_BUILD="$(asc builds next-build-number --app "$APP_ID" --version "$MARKETING_VERSION" --platform IOS --output json | jq -r '.nextBuildNumber')"
if [[ -z "$NEXT_BUILD" || "$NEXT_BUILD" == "null" ]]; then
  echo "FAIL: ASC did not return a next build number. Do not guess one."
  exit 1
fi
echo "    ASC nextBuildNumber=$NEXT_BUILD"

echo "==> Checking locally available code-signing identities"
IDENTITIES="$(security find-identity -v -p codesigning 2>/dev/null || true)"
if ! grep -Eq 'Apple Distribution|iPhone Distribution' <<<"$IDENTITIES"; then
  cat <<'EOF'
FAIL: no Apple Distribution identity is available to this process.
Inspect the existing signing setup before creating or revoking certificates.
EOF
  exit 1
fi
echo "$IDENTITIES" | grep -E 'Apple Distribution|iPhone Distribution' || true

if [[ -n "$TEAM_ID" ]]; then
  echo "    expectedTeam=$TEAM_ID"
fi
if [[ -n "$PROJECT" ]]; then
  echo "    project=$PROJECT"
fi

echo "PASS: preflight completed. Use next build $NEXT_BUILD only after updating the project's true build-number source."
