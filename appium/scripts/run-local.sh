#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APPIUM_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SDK_ROOT="$(cd "$APPIUM_DIR/../.." && pwd)"

# ── Load .env if present ─────────────────────────────────────────────────────
if [[ -f "$SCRIPT_DIR/.env" ]]; then
  set -a
  source "$SCRIPT_DIR/.env"
  set +a
fi

RUN_LOCAL_LIB_DIR="$SCRIPT_DIR/run-local"
source "$RUN_LOCAL_LIB_DIR/common.sh"
source "$RUN_LOCAL_LIB_DIR/config.sh"
source "$RUN_LOCAL_LIB_DIR/sdk-artifacts.sh"
source "$RUN_LOCAL_LIB_DIR/build.sh"
source "$RUN_LOCAL_LIB_DIR/runtime.sh"

configure_runner "$@"

# ── 4. Run tests ─────────────────────────────────────────────────────────────
run_tests() {
  cd "$APPIUM_DIR"
  info "Installing test dependencies..."
  vp install

  local conf="wdio.${PLATFORM}.conf.ts"
  # Only forward --spec when the user explicitly overrode it. Passing --spec
  # to wdio re-expands the glob into one runner per file (~10-30s of session
  # setup each on iOS) and bypasses the grouped specs in the conf.
  local -a wdio_args=("$conf")
  if [[ -n "$SPEC" ]]; then
    # Normalize bare fragments like `--spec=12_` into a recursive glob so
    # wdio's ConfigParser globs to a real file instead of substring-matching
    # the conf's specs array and emitting "pattern X did not match any file".
    # Pre-existing paths and globs pass through untouched.
    case "$SPEC" in
      */*|*\**|*\?*|*\[*) ;;
      *) [[ -e "$SPEC" ]] || SPEC="**/${SPEC}*.spec.ts" ;;
    esac
    info "Running tests (conf: $conf, spec: $SPEC)..."
    wdio_args+=(--spec "$SPEC")
  else
    info "Running tests (conf: $conf, spec: <conf default>)..."
  fi

  # Force local mode even if BROWSERSTACK_* is exported globally (e.g. in ~/.zshrc).
  # wdio.shared.conf.ts switches to the BrowserStack hub when BROWSERSTACK_USERNAME is set.
  env -u BROWSERSTACK_USERNAME -u BROWSERSTACK_ACCESS_KEY \
    SDK_TYPE="$SDK_TYPE" \
    PLATFORM="$PLATFORM" \
    APP_PATH="$APP_PATH" \
    DEVICE="$DEVICE" \
    OS_VERSION="$OS_VERSION" \
    BUNDLE_ID="${BUNDLE_ID:-}" \
    ONESIGNAL_APP_ID="${ONESIGNAL_APP_ID:-}" \
    ONESIGNAL_API_KEY="${ONESIGNAL_API_KEY:-}" \
    APPIUM_PORT="$APPIUM_PORT" \
    WDA_LOCAL_PORT="${WDA_LOCAL_PORT:-}" \
    SYSTEM_PORT="${SYSTEM_PORT:-}" \
    UDID="${UDID:-}" \
    XCODE_TEAM_ID="${XCODE_TEAM_ID:-}" \
    XCODE_SIGNING_ID="${XCODE_SIGNING_ID:-}" \
    vpx wdio run "${wdio_args[@]}"
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
  info "=== OneSignal E2E — $SDK_TYPE / $PLATFORM ==="
  echo ""

  build_app
  prepare_runtime
  run_tests

  echo ""
  info "=== Done ==="
}

main
