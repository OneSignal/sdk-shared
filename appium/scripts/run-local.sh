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
  --sdk=S          flutter | react-native | cordova
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
  CORDOVA_DIR        Cordova SDK repo root (default: ../../OneSignal-Cordova-SDK)
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
prompt_choice SDK_TYPE "Select SDK type:" flutter react-native cordova

case "$PLATFORM" in
  ios|android) ;;
  *) error "PLATFORM must be 'ios' or 'android', got '$PLATFORM'" ;;
esac

case "$SDK_TYPE" in
  flutter|react-native|cordova) ;;
  *) error "SDK_TYPE must be 'flutter', 'react-native', or 'cordova', got '$SDK_TYPE'" ;;
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
    APP_PATH="${APP_PATH:-$DEMO_DIR/ios/build/Build/Products/Release-iphonesimulator/demo.app}"
  else
    APP_PATH="${APP_PATH:-$DEMO_DIR/android/app/build/outputs/apk/release/app-release.apk}"
  fi
elif [[ "$SDK_TYPE" == "cordova" ]]; then
  CORDOVA_DIR="${CORDOVA_DIR:-$SDK_ROOT/OneSignal-Cordova-SDK}"
  [[ -d "$CORDOVA_DIR" ]] || error "Cordova SDK not found at $CORDOVA_DIR — set CORDOVA_DIR in .env"
  DEMO_DIR="$CORDOVA_DIR/examples/demo"
  if [[ "$PLATFORM" == "ios" ]]; then
    APP_PATH="${APP_PATH:-$DEMO_DIR/ios/App/build/Build/Products/Release-iphonesimulator/App.app}"
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
  DEVICE="${DEVICE:-Android 16}"
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

  # info "Installing CocoaPods..."
  # (cd "$DEMO_DIR/ios" && pod install)

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
  local stamp="$RN_DIR/.rn-sdk-source.stamp"
  local installed_dir="$DEMO_DIR/node_modules/react-native-onesignal"
  local tarball="$RN_DIR/react-native-onesignal.tgz"

  local src_hash
  src_hash=$(find "$RN_DIR/src" "$RN_DIR/ios" "$RN_DIR/android" \
                  "$RN_DIR/package.json" "$RN_DIR/tsconfig.json" \
                  "$RN_DIR"/*.podspec \
             -type f 2>/dev/null \
             | sort \
             | xargs shasum 2>/dev/null \
             | shasum \
             | awk '{print $1}')

  if [[ -d "$installed_dir" ]] && [[ -f "$stamp" ]] && [[ "$(cat "$stamp")" == "$src_hash" ]]; then
    info "RN SDK source unchanged, skipping rebuild"
    return
  fi

  info "Building React Native SDK & packing tarball..."
  (cd "$RN_DIR" && bun run build)
  (cd "$RN_DIR" && rm -f react-native-onesignal*.tgz && bun pm pack && mv react-native-onesignal-*.tgz react-native-onesignal.tgz)

  if [[ ! -d "$installed_dir" ]]; then
    info "First install — running bun add to register tarball in lockfile..."
    (cd "$DEMO_DIR" && bun add file:../../react-native-onesignal.tgz)
  else
    info "Extracting tarball into demo's node_modules (respects package.json files)..."
    rm -rf "$installed_dir"/*
    rm -rf "$installed_dir"/.[!.]* 2>/dev/null || true
    tar -xzf "$tarball" -C "$installed_dir" --strip-components=1
  fi

  echo "$src_hash" > "$stamp"
}

build_rn_ios() {
  write_rn_demo_env
  setup_rn_sdk

  local lock="$DEMO_DIR/ios/Podfile.lock"
  local stamp="$DEMO_DIR/ios/build/.podfile.lock.stamp"
  if [[ ! -f "$lock" ]] || [[ ! -f "$stamp" ]] || ! cmp -s "$lock" "$stamp"; then
    info "Installing CocoaPods..."
    (cd "$DEMO_DIR/ios" && pod install)
    mkdir -p "$(dirname "$stamp")"
    cp "$lock" "$stamp" 2>/dev/null || true
  else
    info "Pods up to date, skipping pod install"
  fi

  info "Building release .app for simulator (self-contained, no Metro required)..."
  (cd "$DEMO_DIR/ios" && xcodebuild \
    -workspace demo.xcworkspace \
    -scheme demo \
    -configuration Release \
    -sdk iphonesimulator \
    -derivedDataPath build \
    -quiet \
    ONLY_ACTIVE_ARCH=YES \
    ENABLE_USER_SCRIPT_SANDBOXING=NO \
    COMPILER_INDEX_STORE_ENABLE=NO \
    SWIFT_INDEX_STORE_ENABLE=NO \
    CODE_SIGN_IDENTITY="-" \
    CODE_SIGNING_ALLOWED=YES)

  [[ -d "$APP_PATH" ]] || error ".app not found after build at $APP_PATH"
  info "App built: $APP_PATH"
}

build_rn_android() {
  write_rn_demo_env
  setup_rn_sdk

  info "Building release APK (self-contained, no Metro required)..."
  (cd "$DEMO_DIR/android" && ./gradlew assembleRelease)

  [[ -f "$APP_PATH" ]] || error ".apk not found after build at $APP_PATH"
  info "App built: $APP_PATH"
}

write_cordova_demo_env() {
  if [[ -n "${ONESIGNAL_APP_ID:-}" && -n "${ONESIGNAL_API_KEY:-}" ]]; then
    info "Writing .env for demo app..."
    cat > "$DEMO_DIR/.env" <<EOF
VITE_ONESIGNAL_APP_ID=$ONESIGNAL_APP_ID
VITE_ONESIGNAL_API_KEY=$ONESIGNAL_API_KEY
VITE_E2E_MODE=true
EOF
  else
    warn "ONESIGNAL_APP_ID / ONESIGNAL_API_KEY not set — skipping demo .env"
  fi
}

setup_cordova_sdk() {
  local stamp="$CORDOVA_DIR/.cordova-sdk-source.stamp"
  local installed_dir="$DEMO_DIR/node_modules/onesignal-cordova-plugin"
  local tarball="$CORDOVA_DIR/onesignal-cordova-plugin.tgz"

  CORDOVA_SDK_SRC_HASH=$(find "$CORDOVA_DIR/src" "$CORDOVA_DIR/www" \
                              "$CORDOVA_DIR/package.json" "$CORDOVA_DIR/plugin.xml" \
                              "$CORDOVA_DIR/build-extras-onesignal.gradle" \
                         -type f 2>/dev/null \
                         | sort \
                         | xargs shasum 2>/dev/null \
                         | shasum \
                         | awk '{print $1}')

  if [[ -d "$installed_dir" ]] && [[ -f "$stamp" ]] && [[ "$(cat "$stamp")" == "$CORDOVA_SDK_SRC_HASH" ]]; then
    info "Cordova SDK source unchanged, skipping rebuild"
    return
  fi

  info "Building Cordova plugin & packing tarball..."
  (cd "$CORDOVA_DIR" && bun run build)
  (cd "$CORDOVA_DIR" && rm -f onesignal-cordova-plugin*.tgz && bun pm pack && mv onesignal-cordova-plugin-*.tgz onesignal-cordova-plugin.tgz)

  if [[ ! -d "$installed_dir" ]]; then
    info "First install — running bun add to register tarball in lockfile..."
    (cd "$DEMO_DIR" && bun add file:../../onesignal-cordova-plugin.tgz)
  else
    info "Extracting tarball into demo's node_modules (respects package.json files)..."
    rm -rf "$installed_dir"/*
    rm -rf "$installed_dir"/.[!.]* 2>/dev/null || true
    tar -xzf "$tarball" -C "$installed_dir" --strip-components=1
  fi

  echo "$CORDOVA_SDK_SRC_HASH" > "$stamp"
}

# Hash of everything that affects `cap sync <platform>` output. Used to skip
# the (slow) sync — which internally runs `pod install` + `xcodebuild clean`
# on iOS, and Gradle plugin wiring on Android — when nothing relevant changed.
#
# We deliberately hash the web bundle *sources* (src/, index.html, configs,
# lockfile) instead of `dist/`. Vite's legacy plugin emits content-hashed
# chunk filenames whose order/hashes can drift slightly between identical
# builds, which would invalidate the stamp on every run.
cap_sync_inputs_hash() {
  local platform_dir="$1"  # ios/App | android
  local content_hash
  content_hash=$(find "$DEMO_DIR/src" "$DEMO_DIR/index.html" \
                      "$DEMO_DIR/capacitor.config.ts" "$DEMO_DIR/vite.config.ts" \
                      "$DEMO_DIR/package.json" "$DEMO_DIR/bun.lock" \
                      "$DEMO_DIR/$platform_dir" \
                 -type f \
                 ! -path "*/node_modules/*" \
                 ! -path "*/Pods/*" \
                 ! -path "*/build/*" \
                 ! -path "*/DerivedData/*" \
                 ! -path "*/xcuserdata/*" \
                 \( -name "Podfile" -o -name "build.gradle" \
                    -o -name "*.ts" -o -name "*.tsx" \
                    -o -name "*.json" -o -name "*.html" -o -name "*.js" \
                    -o -name "*.css" -o -name "*.svg" -o -name "*.xml" \
                    -o -name "*.lock" \) \
                 2>/dev/null \
                 | sort \
                 | xargs shasum 2>/dev/null \
                 | shasum \
                 | awk '{print $1}')
  # Tie to plugin source so plugin changes always trigger a re-sync.
  echo "${content_hash}-${CORDOVA_SDK_SRC_HASH:-none}"
}

build_cordova_ios() {
  write_cordova_demo_env
  setup_cordova_sdk

  info "Building web bundle (vite)..."
  (cd "$DEMO_DIR" && bun run build)

  local sync_stamp="$DEMO_DIR/ios/App/build/.cap-sync.stamp"
  local sync_hash
  sync_hash=$(cap_sync_inputs_hash "ios/App")
  if [[ -d "$DEMO_DIR/ios/App/App/public" ]] && [[ -f "$sync_stamp" ]] && [[ "$(cat "$sync_stamp")" == "$sync_hash" ]]; then
    info "Capacitor sync inputs unchanged, skipping cap sync"
  else
    # Capacitor's Cordova plugin generator runs `xcodebuild -project App.xcodeproj clean`
    # during `cap sync`. Modern Xcode refuses to clean a dir that lacks the
    # `com.apple.xcode.CreatedByBuildSystem` xattr (safety check). Our prior xcodebuild
    # creates `ios/App/build/` without that xattr, so subsequent syncs fail unless we
    # stamp it. Pre-create + tag here so the next sync's clean is always allowed.
    mkdir -p "$DEMO_DIR/ios/App/build"
    xattr -w com.apple.xcode.CreatedByBuildSystem true "$DEMO_DIR/ios/App/build" 2>/dev/null || true

    info "Syncing Capacitor (also installs/updates Pods)..."
    (cd "$DEMO_DIR" && bunx cap sync ios)
    mkdir -p "$(dirname "$sync_stamp")"
    echo "$sync_hash" > "$sync_stamp"
  fi

  info "Building release .app for simulator..."
  (cd "$DEMO_DIR/ios/App" && xcodebuild \
    -workspace App.xcworkspace \
    -scheme App \
    -configuration Release \
    -sdk iphonesimulator \
    -derivedDataPath build \
    -quiet \
    ONLY_ACTIVE_ARCH=YES \
    ENABLE_USER_SCRIPT_SANDBOXING=NO \
    COMPILER_INDEX_STORE_ENABLE=NO \
    SWIFT_INDEX_STORE_ENABLE=NO \
    CODE_SIGN_IDENTITY="-" \
    CODE_SIGNING_ALLOWED=YES)

  [[ -d "$APP_PATH" ]] || error ".app not found after build at $APP_PATH"
  info "App built: $APP_PATH"
}

build_cordova_android() {
  write_cordova_demo_env
  setup_cordova_sdk

  info "Building web bundle (vite)..."
  (cd "$DEMO_DIR" && bun run build)

  local sync_stamp="$DEMO_DIR/android/build/.cap-sync.stamp"
  local sync_hash
  sync_hash=$(cap_sync_inputs_hash "android")
  if [[ -d "$DEMO_DIR/android/app/src/main/assets/public" ]] && [[ -f "$sync_stamp" ]] && [[ "$(cat "$sync_stamp")" == "$sync_hash" ]]; then
    info "Capacitor sync inputs unchanged, skipping cap sync"
  else
    info "Syncing Capacitor..."
    (cd "$DEMO_DIR" && bunx cap sync android)
    mkdir -p "$(dirname "$sync_stamp")"
    echo "$sync_hash" > "$sync_stamp"
  fi

  info "Building debug APK (release has no signing config)..."
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
  elif [[ "$SDK_TYPE" == "cordova" ]]; then
    if [[ "$PLATFORM" == "ios" ]]; then
      build_cordova_ios
    else
      build_cordova_android
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

  local emulator_log="/tmp/emulator-${AVD_NAME}.log"
  info "Starting emulator '$AVD_NAME' (logs: $emulator_log)..."
  emulator -avd "$AVD_NAME" -no-audio -no-boot-anim \
    >"$emulator_log" 2>&1 &

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
