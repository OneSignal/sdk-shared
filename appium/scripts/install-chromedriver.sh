#!/usr/bin/env bash
# install-chromedriver.sh
#
# Pre-downloads a Chromedriver binary that matches the Chrome major version
# of the connected Android device's system WebView, and places it where
# appium-chromedriver expects to find it. This avoids the in-test
# autodownload path (which we have observed hanging silently for >90s and
# breaking IAM tests).
#
# Behaviour:
#   1. Detects host OS/arch (mac-arm64, mac-x64, linux64).
#   2. Reads the Android device's WebView Chrome version via adb. Falls back
#      to an explicit version via $CHROMEDRIVER_VERSION when no device is
#      connected (useful for CI image prep).
#   3. Looks up the matching Chromedriver build from the Chrome-for-Testing
#      JSON manifest.
#   4. Skips work when a binary at the expected major version is already
#      cached, unless --force is passed.
#
# Usage:
#   install-chromedriver.sh            # auto-detect from adb
#   install-chromedriver.sh --force    # always re-download
#   CHROMEDRIVER_VERSION=148 install-chromedriver.sh   # skip adb, pin major
set -euo pipefail

FORCE=false
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=true ;;
    -h|--help)
      sed -n '2,24p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown arg: $arg" >&2
      exit 2
      ;;
  esac
done

log()  { echo "[install-chromedriver] $*"; }
fail() { echo "[install-chromedriver][ERROR] $*" >&2; exit 1; }

# ── Host platform ────────────────────────────────────────────────────────────
case "$(uname -s)" in
  Darwin)
    case "$(uname -m)" in
      arm64)  PLATFORM_KEY=mac-arm64 ;;
      x86_64) PLATFORM_KEY=mac-x64 ;;
      *) fail "Unsupported macOS arch: $(uname -m)" ;;
    esac
    APPIUM_OS_DIR=mac
    ;;
  Linux)
    case "$(uname -m)" in
      x86_64) PLATFORM_KEY=linux64 ;;
      *) fail "Unsupported Linux arch: $(uname -m)" ;;
    esac
    APPIUM_OS_DIR=linux
    ;;
  *) fail "Unsupported host OS: $(uname -s)" ;;
esac

# ── Locate the appium-chromedriver cache the uiautomator2 driver uses ───────
DRIVER_DIR="${APPIUM_HOME:-$HOME/.appium}/node_modules/appium-uiautomator2-driver"
CD_DIR="$DRIVER_DIR/node_modules/appium-chromedriver/chromedriver/$APPIUM_OS_DIR"
[[ -d "$DRIVER_DIR" ]] || fail "uiautomator2 driver not found at $DRIVER_DIR — install it with 'appium driver install uiautomator2' first."
mkdir -p "$CD_DIR"

# ── Resolve target Chrome major version ──────────────────────────────────────
TARGET_VERSION="${CHROMEDRIVER_VERSION:-}"
if [[ -z "$TARGET_VERSION" ]]; then
  command -v adb >/dev/null || fail "adb not on PATH and CHROMEDRIVER_VERSION not set."
  WV_VERSION="$(adb shell dumpsys package com.google.android.webview 2>/dev/null \
    | awk -F= '/versionName=/{print $2; exit}' \
    | tr -d '\r')"
  if [[ -z "$WV_VERSION" ]]; then
    WV_VERSION="$(adb shell dumpsys package com.android.webview 2>/dev/null \
      | awk -F= '/versionName=/{print $2; exit}' \
      | tr -d '\r')"
  fi
  [[ -n "$WV_VERSION" ]] || fail "Could not read Android System WebView version via adb. Connect a device or set CHROMEDRIVER_VERSION."
  TARGET_VERSION="${WV_VERSION%%.*}"
fi

# ── Skip silently if a matching binary is already cached ─────────────────────
# The common case on every run: nothing to do. Logging here would be pure
# noise. We only speak up when actual download/install work is required.
EXISTING=""
if [[ -x "$CD_DIR/chromedriver" ]]; then
  EXISTING="$("$CD_DIR/chromedriver" --version 2>/dev/null | awk '{print $2}' | head -1 || true)"
fi
if [[ "$FORCE" != true && -n "$EXISTING" && "${EXISTING%%.*}" == "$TARGET_VERSION" ]]; then
  exit 0
fi

log "Detected Android System WebView Chrome ${WV_VERSION:-$TARGET_VERSION.x} (major $TARGET_VERSION); cache miss, installing."

# ── Resolve a download URL for $TARGET_VERSION.x from Chrome-for-Testing ────
# We stage the manifest in a file and pass its path to python as argv. Piping
# curl into `python3 -` while also feeding the script via a heredoc collides
# on stdin: the heredoc wins, python reads its script from stdin, and the
# subsequent json.load(sys.stdin) sees EOF.
MANIFEST_URL=https://googlechromelabs.github.io/chrome-for-testing/known-good-versions-with-downloads.json
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
MANIFEST_JSON="$TMP/manifest.json"

log "Resolving Chromedriver for Chrome $TARGET_VERSION.x ($PLATFORM_KEY) from Chrome-for-Testing manifest..."
curl -fsSL --max-time 30 -o "$MANIFEST_JSON" "$MANIFEST_URL" \
  || fail "Failed to download Chrome-for-Testing manifest from $MANIFEST_URL"

DL_URL="$(python3 - "$TARGET_VERSION" "$PLATFORM_KEY" "$MANIFEST_JSON" <<'PY'
import json, sys
target_major, platform_key, manifest_path = sys.argv[1], sys.argv[2], sys.argv[3]
with open(manifest_path) as f:
    data = json.load(f)
match = None
for v in data.get("versions", []):
    if v["version"].startswith(target_major + "."):
        for d in (v.get("downloads") or {}).get("chromedriver") or []:
            if d.get("platform") == platform_key:
                match = (v["version"], d["url"])
if not match:
    sys.exit(f"No Chromedriver for Chrome {target_major}.x on {platform_key}")
print(match[1])
PY
)"

[[ -n "$DL_URL" ]] || fail "Empty download URL resolved."
log "Downloading $DL_URL"

curl -fSL --max-time 180 -o "$TMP/chromedriver.zip" "$DL_URL"
unzip -q "$TMP/chromedriver.zip" -d "$TMP"

BIN="$(find "$TMP" -type f -name chromedriver -perm +111 2>/dev/null | head -1)"
[[ -n "$BIN" ]] || BIN="$(find "$TMP" -type f -name chromedriver | head -1)"
[[ -n "$BIN" ]] || fail "chromedriver binary not found in downloaded zip"

mv -f "$BIN" "$CD_DIR/chromedriver"
chmod +x "$CD_DIR/chromedriver"
# Clear macOS quarantine flag so Gatekeeper doesn't block execution.
xattr -d com.apple.quarantine "$CD_DIR/chromedriver" 2>/dev/null || true

INSTALLED_VERSION="$("$CD_DIR/chromedriver" --version 2>/dev/null | awk '{print $2}')"
log "Installed Chromedriver $INSTALLED_VERSION at $CD_DIR/chromedriver"
