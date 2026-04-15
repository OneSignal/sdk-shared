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

# ── Colors / logging ─────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── Defaults ──────────────────────────────────────────────────────────────────
APPIUM_PORT="${APPIUM_PORT:-4723}"
SKIP_BUILD=false
SKIP_DEVICE=false
SKIP_RESET=false
SPEC="tests/specs/**/*.spec.ts"

# ── Parse args ────────────────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --platform=*)  PLATFORM="${arg#--platform=}" ;;
    --sdk=*)       SDK_TYPE="${arg#--sdk=}" ;;
    --device=*)    DEVICE="${arg#--device=}" ;;
    --skip)        SKIP_BUILD=true; SKIP_DEVICE=true; SKIP_RESET=true ;;
    --skip-build)  SKIP_BUILD=true ;;
    --skip-device) SKIP_DEVICE=true ;;
    --skip-reset)  SKIP_RESET=true ;;
    --spec=*)      SPEC="${arg#--spec=}" ;;
    --help|-h)
      cat <<USAGE
Usage: $0 [OPTIONS]

Builds the app (if needed), starts Appium + simulator/emulator,
and runs E2E tests locally.

PLATFORM and SDK are prompted interactively when not provided
via flags or env vars.

Options:
  --platform=P     ios | android
  --sdk=S          flutter | react-native
  --device=NAME    Device/simulator/AVD name (default: iPhone 17 / Samsung Galaxy S26)
  --skip           Skip build, device launch, and app reset (rerun tests only)
  --skip-build     Skip app build (reuse existing)
  --skip-device    Skip simulator/emulator launch
  --skip-reset     Keep existing app data
  --spec=GLOB      Spec glob (default: tests/specs/**/*.spec.ts)
  -h, --help       Show this help

Env vars (set in .env or export):
  APP_PATH           Path to .app/.apk (auto-detected if not set)
  BUNDLE_ID          Bundle/package id (default: com.onesignal.example)
  ONESIGNAL_APP_ID   OneSignal app ID (written to demo app .env)
  ONESIGNAL_API_KEY  OneSignal REST API key (written to demo app .env)
  FLUTTER_DIR        Flutter SDK repo root (default: ../../OneSignal-Flutter-SDK)
  RN_DIR             React Native SDK repo root (default: ../../react-native-onesignal)
  OS_VERSION         Platform version (default: 26.2 / 16)
  IOS_SIMULATOR      iOS simulator name (default: iPhone 17)
  IOS_RUNTIME        simctl runtime id (default: iOS-26-2)
  APPIUM_PORT        Appium port (default: 4723)
USAGE
      exit 0
      ;;
    *) warn "Unknown option: $arg (ignored)" ;;
  esac
done

# ── Prompt for required vars if not set ───────────────────────────────────────
prompt_choice() {
  local var_name="$1" prompt_text="$2"
  shift 2
  local options=("$@")

  if [[ -n "${!var_name:-}" ]]; then
    return
  fi

  echo ""
  echo -e "${GREEN}${prompt_text}${NC}"
  local i=1
  for opt in "${options[@]}"; do
    echo "  $i) $opt"
    i=$((i + 1))
  done

  local choice
  while true; do
    read -rp "> " choice
    if [[ "$choice" =~ ^[0-9]+$ ]] && (( choice >= 1 && choice <= ${#options[@]} )); then
      printf -v "$var_name" '%s' "${options[$((choice - 1))]}"
      return
    fi
    echo "  Invalid choice. Enter a number 1-${#options[@]}."
  done
}

prompt_choice PLATFORM "Select platform:" ios android
prompt_choice SDK_TYPE "Select SDK type:" flutter react-native

case "$PLATFORM" in
  ios|android) ;;
  *) error "PLATFORM must be 'ios' or 'android', got '$PLATFORM'" ;;
esac

case "$SDK_TYPE" in
  flutter|react-native) ;;
  *) error "SDK_TYPE must be 'flutter' or 'react-native', got '$SDK_TYPE'" ;;
esac

BUNDLE_ID="${BUNDLE_ID:-com.onesignal.example}"

if [[ "$SDK_TYPE" == "flutter" ]]; then
  FLUTTER_DIR="${FLUTTER_DIR:-$SDK_ROOT/OneSignal-Flutter-SDK}"
  [[ -d "$FLUTTER_DIR" ]] || error "Flutter SDK not found at $FLUTTER_DIR — set FLUTTER_DIR in .env"
  DEMO_DIR="$FLUTTER_DIR/examples/demo"
  if [[ "$PLATFORM" == "ios" ]]; then
    APP_PATH="${APP_PATH:-$DEMO_DIR/build/ios/iphonesimulator/Runner.app}"
  else
    APP_PATH="${APP_PATH:-$DEMO_DIR/build/app/outputs/flutter-apk/app-debug.apk}"
  fi
elif [[ "$SDK_TYPE" == "react-native" ]]; then
  RN_DIR="${RN_DIR:-$SDK_ROOT/react-native-onesignal}"
  [[ -d "$RN_DIR" ]] || error "React Native SDK not found at $RN_DIR — set RN_DIR in .env"
  DEMO_DIR="$RN_DIR/examples/demo"
  if [[ "$PLATFORM" == "ios" ]]; then
    APP_PATH="${APP_PATH:-$DEMO_DIR/ios/build/Build/Products/Debug-iphonesimulator/demo.app}"
  else
    APP_PATH="${APP_PATH:-$DEMO_DIR/android/app/build/outputs/apk/debug/app-debug.apk}"
  fi
fi

# ── Platform defaults ────────────────────────────────────────────────────────
if [[ "$PLATFORM" == "ios" ]]; then
  DEVICE="${DEVICE:-iPhone 17}"
  OS_VERSION="${OS_VERSION:-26.2}"
  IOS_SIMULATOR="${IOS_SIMULATOR:-$DEVICE}"
  IOS_RUNTIME="${IOS_RUNTIME:-iOS-26-2}"
else
  DEVICE="${DEVICE:-Samsung Galaxy S26}"
  OS_VERSION="${OS_VERSION:-16}"
  AVD_NAME="${AVD_NAME:-${DEVICE// /_}}"
fi

# ── 1. Build app ─────────────────────────────────────────────────────────────
build_flutter_ios() {
  if [[ -n "${ONESIGNAL_APP_ID:-}" && -n "${ONESIGNAL_API_KEY:-}" ]]; then
    info "Writing .env for demo app..."
    cat > "$DEMO_DIR/.env" <<EOF
ONESIGNAL_APP_ID=$ONESIGNAL_APP_ID
ONESIGNAL_API_KEY=$ONESIGNAL_API_KEY
E2E_MODE=true
EOF
  else
    warn "ONESIGNAL_APP_ID / ONESIGNAL_API_KEY not set — skipping demo .env"
  fi

  info "Installing Flutter dependencies..."
  (cd "$FLUTTER_DIR" && flutter pub get)

  info "Installing CocoaPods..."
  (cd "$DEMO_DIR/ios" && pod install)

  info "Building debug .app for simulator (this may take a few minutes)..."
  (cd "$DEMO_DIR" && flutter build ios --simulator --debug)

  [[ -d "$APP_PATH" ]] || error ".app not found after build at $APP_PATH"
  info "App built: $APP_PATH"
}

build_flutter_android() {
  if [[ -n "${ONESIGNAL_APP_ID:-}" && -n "${ONESIGNAL_API_KEY:-}" ]]; then
    info "Writing .env for demo app..."
    cat > "$DEMO_DIR/.env" <<EOF
ONESIGNAL_APP_ID=$ONESIGNAL_APP_ID
ONESIGNAL_API_KEY=$ONESIGNAL_API_KEY
E2E_MODE=true
EOF
  else
    warn "ONESIGNAL_APP_ID / ONESIGNAL_API_KEY not set — skipping demo .env"
  fi

  info "Installing Flutter dependencies..."
  (cd "$FLUTTER_DIR" && flutter pub get)

  info "Building debug APK (this may take a few minutes)..."
  (cd "$DEMO_DIR" && flutter build apk --debug)

  [[ -f "$APP_PATH" ]] || error ".apk not found after build at $APP_PATH"
  info "App built: $APP_PATH"
}

write_rn_demo_env() {
  if [[ -n "${ONESIGNAL_APP_ID:-}" && -n "${ONESIGNAL_API_KEY:-}" ]]; then
    info "Writing .env for demo app..."
    cat > "$DEMO_DIR/.env" <<EOF
ONESIGNAL_APP_ID=$ONESIGNAL_APP_ID
ONESIGNAL_API_KEY=$ONESIGNAL_API_KEY
E2E_MODE=true
EOF
  else
    warn "ONESIGNAL_APP_ID / ONESIGNAL_API_KEY not set — skipping demo .env"
  fi
}

setup_rn_sdk() {
  info "Building React Native SDK & packing tarball..."
  (cd "$RN_DIR" && bun run build)
  (cd "$RN_DIR" && rm -f react-native-onesignal*.tgz && bun pm pack && mv react-native-onesignal-*.tgz react-native-onesignal.tgz)

  info "Installing demo dependencies..."
  (cd "$DEMO_DIR" && bun pm cache rm && bun remove react-native-onesignal && bun add file:../../react-native-onesignal.tgz)
}

build_rn_ios() {
  write_rn_demo_env
  setup_rn_sdk

  info "Installing CocoaPods..."
  (cd "$DEMO_DIR/ios" && pod install)

  info "Building debug .app for simulator (this may take a few minutes)..."
  (cd "$DEMO_DIR/ios" && xcodebuild \
    -workspace demo.xcworkspace \
    -scheme demo \
    -configuration Debug \
    -sdk iphonesimulator \
    -derivedDataPath build \
    CODE_SIGN_IDENTITY="" \
    CODE_SIGNING_REQUIRED=NO \
    CODE_SIGNING_ALLOWED=NO)

  [[ -d "$APP_PATH" ]] || error ".app not found after build at $APP_PATH"
  info "App built: $APP_PATH"
}

build_rn_android() {
  write_rn_demo_env
  setup_rn_sdk

  info "Building debug APK (this may take a few minutes)..."
  (cd "$DEMO_DIR/android" && ./gradlew assembleDebug)

  [[ -f "$APP_PATH" ]] || error ".apk not found after build at $APP_PATH"
  info "App built: $APP_PATH"
}

build_app() {
  if [[ "$SKIP_BUILD" == true ]]; then
    if [[ "$PLATFORM" == "ios" && ! -d "$APP_PATH" ]] || [[ "$PLATFORM" == "android" && ! -f "$APP_PATH" ]]; then
      error "No app found at $APP_PATH — cannot skip build"
    fi
    info "Skipping build (--skip-build), using existing app"
    return
  fi

  if [[ "$SDK_TYPE" == "flutter" ]]; then
    if [[ "$PLATFORM" == "ios" ]]; then
      build_flutter_ios
    else
      build_flutter_android
    fi
  elif [[ "$SDK_TYPE" == "react-native" ]]; then
    if [[ "$PLATFORM" == "ios" ]]; then
      build_rn_ios
    else
      build_rn_android
    fi
  fi
}

# ── 2. Start device ──────────────────────────────────────────────────────────
start_ios_simulator() {
  if xcrun simctl list devices booted 2>/dev/null | grep -q "Booted"; then
    info "Simulator already running"
    return
  fi

  local udid
  udid=$(xcrun simctl list devices available -j \
    | python3 -c "
import json, sys
data = json.load(sys.stdin)
for runtime, devices in data['devices'].items():
    if '$IOS_RUNTIME' in runtime:
        for d in devices:
            if d['name'] == '$IOS_SIMULATOR' and d['isAvailable']:
                print(d['udid']); sys.exit(0)
" 2>/dev/null || true)

  if [[ -z "$udid" ]]; then
    error "Simulator '$IOS_SIMULATOR' ($IOS_RUNTIME) not found. Run: xcrun simctl list devices available"
  fi

  info "Booting simulator '$IOS_SIMULATOR' ($udid)..."
  xcrun simctl boot "$udid" 2>/dev/null || true
  open -a Simulator

  info "Waiting for simulator..."
  local retries=0
  while ! xcrun simctl list devices booted 2>/dev/null | grep -q "Booted"; do
    retries=$((retries + 1))
    [[ $retries -gt 60 ]] && error "Simulator failed to boot after 60s"
    sleep 1
  done
  info "Simulator ready"
}

start_android_emulator() {
  if adb devices 2>/dev/null | grep -q "emulator-"; then
    info "Emulator already running"
    return
  fi

  info "Starting emulator '$AVD_NAME'..."
  emulator -avd "$AVD_NAME" -no-audio -no-boot-anim &

  info "Waiting for emulator to boot..."
  adb wait-for-device
  local boot=""
  while [[ "$boot" != "1" ]]; do
    boot=$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)
    sleep 2
  done
  info "Emulator booted"
}

start_device() {
  if [[ "$SKIP_DEVICE" == true ]]; then
    info "Skipping device launch (--skip-device)"
    return
  fi

  if [[ "$PLATFORM" == "ios" ]]; then
    start_ios_simulator
  else
    start_android_emulator
  fi
}

# ── 2. Start Appium ──────────────────────────────────────────────────────────
start_appium() {
  if curl -s "http://localhost:$APPIUM_PORT/status" | grep -q '"ready":true' 2>/dev/null; then
    info "Appium already running on port $APPIUM_PORT"
    return
  fi

  info "Starting Appium on port $APPIUM_PORT..."
  appium --port "$APPIUM_PORT" --log-level error &
  local pid=$!

  local retries=0
  while ! curl -s "http://localhost:$APPIUM_PORT/status" | grep -q '"ready":true' 2>/dev/null; do
    retries=$((retries + 1))
    [[ $retries -gt 30 ]] && error "Appium failed to start after 30s"
    sleep 1
  done
  info "Appium ready (pid $pid)"
}

# ── 3. Reset app ─────────────────────────────────────────────────────────────
reset_app() {
  if [[ "$SKIP_RESET" == true ]]; then
    info "Skipping app reset (--skip-reset)"
    return
  fi

  if [[ "$PLATFORM" == "ios" ]]; then
    local bundle="${BUNDLE_ID:-}"
    if [[ -z "$bundle" ]]; then
      info "No BUNDLE_ID set — skipping reset"
      return
    fi
    if xcrun simctl listapps booted 2>/dev/null | grep -q "$bundle"; then
      info "Uninstalling $bundle..."
      xcrun simctl uninstall booted "$bundle" 2>/dev/null || true
    else
      info "App not installed — nothing to reset"
    fi
  else
    local package="${BUNDLE_ID:-}"
    if [[ -z "$package" ]]; then
      info "No BUNDLE_ID set — skipping reset"
      return
    fi
    if adb shell pm list packages 2>/dev/null | grep -q "$package"; then
      info "Uninstalling $package..."
      adb uninstall "$package" 2>/dev/null || true
    else
      info "App not installed — nothing to reset"
    fi
  fi
}

# ── 4. Run tests ─────────────────────────────────────────────────────────────
run_tests() {
  cd "$APPIUM_DIR"
  info "Installing test dependencies..."
  bun i

  local conf="wdio.${PLATFORM}.conf.ts"
  info "Running tests (conf: $conf, spec: $SPEC)..."

  SDK_TYPE="$SDK_TYPE" \
  PLATFORM="$PLATFORM" \
  APP_PATH="$APP_PATH" \
  DEVICE="$DEVICE" \
  OS_VERSION="$OS_VERSION" \
  BUNDLE_ID="${BUNDLE_ID:-}" \
  ONESIGNAL_APP_ID="${ONESIGNAL_APP_ID:-}" \
  ONESIGNAL_API_KEY="${ONESIGNAL_API_KEY:-}" \
  bunx wdio run "$conf" --spec "$SPEC"
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
  info "=== OneSignal E2E — $SDK_TYPE / $PLATFORM ==="
  echo ""

  build_app
  start_device
  start_appium
  reset_app
  run_tests

  echo ""
  info "=== Done ==="
}

main
