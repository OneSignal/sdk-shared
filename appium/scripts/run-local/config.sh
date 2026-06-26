#!/usr/bin/env bash

configure_runner() {
  # ── Defaults ──────────────────────────────────────────────────────────────────
  APPIUM_PORT="${APPIUM_PORT:-4723}"
  WDA_LOCAL_PORT="${WDA_LOCAL_PORT:-}"
  SYSTEM_PORT="${SYSTEM_PORT:-}"
  SKIP_BUILD=false
  SKIP_DEVICE=false
  SKIP_RESET=false
  SPEC=""
  QUIET=false
  PODS_DEMO=false
  ANDROID_CHANNEL_ID=7ec2ece9-c538-4656-9516-1316f48a005c
  IOS_REAL_DEVICE=false
  UDID="${UDID:-}"

  # ── Parse args ────────────────────────────────────────────────────────────────
  for arg in "$@"; do
    case "$arg" in
      --platform=*)     PLATFORM="${arg#--platform=}" ;;
      --sdk=*)          SDK_TYPE="${arg#--sdk=}" ;;
      --device=*)       DEVICE="${arg#--device=}" ;;
      --device-real)    IOS_REAL_DEVICE=true; SKIP_DEVICE=true ;;
      --udid=*)         UDID="${arg#--udid=}" ;;
      --appium-port=*)  APPIUM_PORT="${arg#--appium-port=}" ;;
      --wda-local-port=*) WDA_LOCAL_PORT="${arg#--wda-local-port=}" ;;
      --system-port=*)  SYSTEM_PORT="${arg#--system-port=}" ;;
      --skip)           SKIP_BUILD=true; SKIP_DEVICE=true; SKIP_RESET=true ;;
      --skip-build)     SKIP_BUILD=true ;;
      --skip-device)    SKIP_DEVICE=true ;;
      --skip-reset)     SKIP_RESET=true ;;
      --pods)           PODS_DEMO=true ;;
      --spec=*)         SPEC="${arg#--spec=}" ;;
      --quiet|-q)       QUIET=true ;;
      --help|-h)
        cat <<USAGE
Usage: $0 [OPTIONS]

Builds the app (if needed), starts Appium + simulator/emulator,
and runs E2E tests locally.

PLATFORM and SDK are prompted interactively when not provided
via flags or env vars.

Options:
  --platform=P        ios | android
  --sdk=S             flutter | react-native | cordova | capacitor | dotnet | expo | unity | android | ios
                      android = native Android (OneSignal-Android-SDK/examples/demo);
                      skips with exit 0 when --platform=ios.
                      ios = native iOS (OneSignal-iOS-SDK/examples/demo);
                      skips with exit 0 when --platform=android.
  --device=NAME       Device/simulator/AVD name (default: iPhone 17 / Samsung Galaxy S26)
  --appium-port=N     Appium server port (default: 4723). Use unique values when
                      running multiple sessions in parallel on the same host.
  --system-port=N     UiAutomator2 systemPort (Android only). Required when
                      running 2+ Android sessions in parallel; pick distinct
                      values per session (e.g. 8200, 8201).
  --skip              Skip build, device launch, and app reset (rerun tests only)
  --skip-build        Skip app build (reuse existing)
  --skip-device       Skip simulator/emulator launch
  --skip-reset        Keep existing app data
  --pods              Use examples/demo-pods instead of examples/demo for
                      flutter, cordova, and capacitor SDKs
  --device-real       Build & run against a physical iPhone (requires --udid
                      and XCODE_TEAM_ID). Implies --skip-device. iOS only.
                      Supported SDKs: cordova, capacitor, react-native, expo.
  --udid=ID           Physical device UDID (xcrun devicectl list devices).
                      Required by --device-real; also accepted via UDID env.
  --spec=GLOB         Spec glob (default: all specs grouped into one session)
  -q, --quiet         Hide [INFO] log lines
  -h, --help          Show this help

Env vars (set in .env or export):
  APP_PATH           Path to .app/.apk (auto-detected if not set)
  BUNDLE_ID          Bundle/package id (default: com.onesignal.example)
  ONESIGNAL_APP_ID   OneSignal app ID (written to demo app .env)
  ONESIGNAL_API_KEY  OneSignal REST API key (written to demo app .env)
  FLUTTER_DIR        Flutter SDK repo root (default: ../../OneSignal-Flutter-SDK)
  RN_DIR             React Native SDK repo root (default: ../../react-native-onesignal)
  CORDOVA_DIR        Cordova SDK repo root (default: ../../OneSignal-Cordova-SDK)
  CAPACITOR_DIR      Capacitor SDK repo root (default: ../../OneSignal-Capacitor-SDK)
  EXPO_DIR           Expo plugin repo root (default: ../../onesignal-expo-plugin)
  DOTNET_DIR         .NET MAUI SDK repo root (default: ../../DotNet/OneSignal-DotNet-SDK)
  DOTNET_TFM         .NET target framework moniker base (default: net10.0)
  DOTNET_ANDROID_ABI .NET Android ABI to pack (default: host arch)
  DOTNET_ANDROID_RID .NET Android runtime identifier (derived from ABI)
  UNITY_DIR          Unity SDK repo root (default: ../../OneSignal-Unity-SDK)
  UNITY_PATH         Path to Unity Editor binary
                     (default: /Applications/Unity/Hub/Editor/6000.4.6f1/Unity.app/Contents/MacOS/Unity)
  UNITY_IOS_SIM_ARCH Unity iOS simulator arch (default: host arch)
  ANDROID_DIR        Native Android SDK repo root (default: ../../OneSignal-Android-SDK)
  ANDROID_FLAVOR     Native Android product flavor (default: gms; also: huawei)
  ANDROID_BUILD_TYPE Native Android build type (default: debug; also: release)
  IOS_DIR            Native iOS SDK repo root (default: ../../OneSignal-iOS-SDK)
  IOS_NATIVE_PROJECT Xcode project filename under examples/demo for the native
                     iOS demo (default: App.xcodeproj). The scheme is derived
                     from the basename (XcodeGen convention).
  OS_VERSION         Platform version (default: 26.2 / 16)
  IOS_SIMULATOR      iOS simulator name (default: iPhone 17)
  IOS_RUNTIME        simctl runtime id (default: iOS-26-2)
  APPIUM_PORT        Appium port (default: 4723; same as --appium-port)
  WDA_LOCAL_PORT     WebDriverAgent local port for iOS parallel runs
  SYSTEM_PORT        UiAutomator2 systemPort (same as --system-port)
  UDID               Physical device UDID (same as --udid; required with
                     --device-real)
  XCODE_TEAM_ID      Apple Developer team ID for codesigning (required with
                     --device-real). Find via:
                       security find-identity -v -p codesigning
  XCODE_SIGNING_ID   Codesigning identity name (default: 'iPhone Developer'
                     when --device-real is set)
USAGE
        exit 0
        ;;
      *) warn "Unknown option: $arg (ignored)" ;;
    esac
  done

  # Ensure values set via CLI flags propagate to wdio (which reads them as env).
  export APPIUM_PORT
  [[ -n "$WDA_LOCAL_PORT" ]] && export WDA_LOCAL_PORT
  [[ -n "$SYSTEM_PORT" ]] && export SYSTEM_PORT


  # Native --sdk=<platform> implies --platform=<platform> (the native demos only
  # target their own OS), so resolve PLATFORM first to skip the platform prompt
  # when the user only passed --sdk=android or --sdk=ios.
  if [[ "${SDK_TYPE:-}" == "android" && -z "${PLATFORM:-}" ]]; then
    PLATFORM="android"
  fi
  if [[ "${SDK_TYPE:-}" == "ios" && -z "${PLATFORM:-}" ]]; then
    PLATFORM="ios"
  fi

  prompt_choice PLATFORM "Select platform:" ios android
  prompt_choice SDK_TYPE "Select SDK type:" flutter react-native cordova capacitor dotnet expo unity android ios

  case "$PLATFORM" in
    ios|android) ;;
    *) error "PLATFORM must be 'ios' or 'android', got '$PLATFORM'" ;;
  esac

  case "$SDK_TYPE" in
    flutter|react-native|cordova|capacitor|dotnet|expo|unity|android|ios) ;;
    *) error "SDK_TYPE must be 'flutter', 'react-native', 'cordova', 'capacitor', 'dotnet', 'expo', 'unity', 'android', or 'ios', got '$SDK_TYPE'" ;;
  esac

  if [[ "$SDK_TYPE" == "android" && "$PLATFORM" != "android" ]]; then
    warn "--sdk=android only runs on --platform=android; skipping --platform=$PLATFORM"
    exit 0
  fi

  if [[ "$SDK_TYPE" == "ios" && "$PLATFORM" != "ios" ]]; then
    warn "--sdk=ios only runs on --platform=ios; skipping --platform=$PLATFORM"
    exit 0
  fi

  if [[ "$PODS_DEMO" == true ]]; then
    case "$SDK_TYPE" in
      flutter|cordova|capacitor) ;;
      *) warn "--pods only affects flutter, cordova, and capacitor SDKs; using examples/demo for $SDK_TYPE" ;;
    esac
  fi

  # ── Preflight checks ──────────────────────────────────────────────────────────
  # Fail fast on missing local tooling with the exact remediation, instead of
  # surfacing as cryptic failures much later (e.g. a bare `appium: command not
  # found` followed by a 30s startup timeout). CI never runs this script — it
  # calls `vpx wdio run` directly on BrowserStack — so these checks are
  # local-only by construction.
  preflight() {
    command -v appium >/dev/null 2>&1 \
      || error "appium not found on PATH. Install it with: npm i -g appium"

    local driver
    if [[ "$PLATFORM" == "ios" ]]; then driver="xcuitest"; else driver="uiautomator2"; fi
    appium driver list --installed 2>&1 | grep -q "$driver" \
      || error "Appium driver '$driver' is not installed. Install it with: appium driver install $driver
          (check what's installed with: appium driver list --installed)"

    if ! command -v vpx >/dev/null 2>&1; then
      if command -v vp >/dev/null 2>&1; then
        error "vpx not found on PATH. Vite+ creates the vpx symlink on vp's first run — run 'vp --version' once, or reinstall: curl -fsSL https://vite.plus | bash"
      fi
      error "vpx not found on PATH. Install Vite+ with: curl -fsSL https://vite.plus | bash"
    fi

    if [[ ! -d "$APPIUM_DIR/node_modules" ]]; then
      # package.json declares "packageManager": "bun@…"; fall back to vp (which
      # run_tests already uses) when bun isn't installed.
      if command -v bun >/dev/null 2>&1; then
        info "node_modules missing in $APPIUM_DIR — running 'bun install'..."
        (cd "$APPIUM_DIR" && bun install)
      elif command -v vp >/dev/null 2>&1; then
        info "node_modules missing in $APPIUM_DIR — running 'vp install'..."
        (cd "$APPIUM_DIR" && vp install)
      else
        error "node_modules missing in $APPIUM_DIR. Run 'bun install' (or 'vp install') there first."
      fi
    fi

    # webdriverio 9.x ships an undici-v6 dispatcher that Node 26+'s fetch
    # rejects with UND_ERR_INVALID_ARG. WDIO_USE_NATIVE_FETCH=1 makes wdio skip
    # the custom dispatcher. CI is on Node 24 and unaffected.
    local node_major=""
    if command -v node >/dev/null 2>&1; then
      node_major="$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || true)"
    fi
    if [[ "${node_major:-0}" =~ ^[0-9]+$ ]] && (( ${node_major:-0} >= 26 )) && [[ -z "${WDIO_USE_NATIVE_FETCH:-}" ]]; then
      export WDIO_USE_NATIVE_FETCH=1
      info "Node $node_major detected — setting WDIO_USE_NATIVE_FETCH=1 (works around webdriverio's undici dispatcher being rejected by Node 26+ fetch)."
    fi

    if [[ -z "${ONESIGNAL_APP_ID:-}" || -z "${ONESIGNAL_API_KEY:-}" ]]; then
      error "ONESIGNAL_APP_ID / ONESIGNAL_API_KEY not set. Use the OneSignal app
        dedicated to Appium tests (not a general/shared app — its live in-app
        marketing campaigns can cover the UI and cause misleading 'element not
        displayed' failures). Set both in $SCRIPT_DIR/.env (cp .env.example .env)."
    fi
  }
  preflight

  # ── Real-device validation + signing setup ────────────────────────────────────
  # When --device-real is set, we need a physical-device build and codesigning
  # inputs. Centralised here so the rest of the script stays simulator-shaped
  # and just expands a few variables (IOS_SDK, IOS_BUILD_DIR, IOS_DESTINATION,
  # IOS_SIGNING_ARGS) instead of branching at every xcodebuild call site.
  if [[ "$IOS_REAL_DEVICE" == true ]]; then
    [[ "$PLATFORM" == "ios" ]] || error "--device-real only supports --platform=ios"
    case "$SDK_TYPE" in
      cordova|capacitor|react-native|expo|ios) ;;
      android) error "--device-real not applicable to --sdk=android (native Android)" ;;
      flutter|dotnet) error "--device-real not yet supported for $SDK_TYPE — patch run-local.sh's build_${SDK_TYPE//-/_}_ios to invoke the device build" ;;
    esac
    [[ -n "$UDID" ]] || error "--device-real requires --udid=<id> (or UDID env). Find via: xcrun devicectl list devices"
    [[ -n "${XCODE_TEAM_ID:-}" ]] || error "--device-real requires XCODE_TEAM_ID env. Find via: security find-identity -v -p codesigning"
    XCODE_SIGNING_ID="${XCODE_SIGNING_ID:-iPhone Developer}"
    IOS_SDK="iphoneos"
    IOS_BUILD_DIR="Release-iphoneos"
    IOS_DESTINATION="id=$UDID"
    # Clear PROVISIONING_PROFILE_SPECIFIER/PROVISIONING_PROFILE so any per-
    # target manual profiles in the project (e.g. CI's "Appium Demo - Main",
    # "Appium Demo - NSE", "Appium Demo - Live Activity") don't conflict with
    # CODE_SIGN_STYLE=Automatic. Pair with -allowProvisioningUpdates on the
    # xcodebuild call so Xcode can fetch/create dev profiles for your team.
    IOS_SIGNING_ARGS="CODE_SIGN_STYLE=Automatic DEVELOPMENT_TEAM=$XCODE_TEAM_ID PROVISIONING_PROFILE_SPECIFIER= PROVISIONING_PROFILE="
    IOS_XCODE_EXTRA_ARGS="-allowProvisioningUpdates"
    export UDID XCODE_TEAM_ID XCODE_SIGNING_ID
  else
    IOS_SDK="iphonesimulator"
    IOS_BUILD_DIR="Release-iphonesimulator"
    IOS_DESTINATION=""
    IOS_SIGNING_ARGS='CODE_SIGN_IDENTITY=- CODE_SIGNING_ALLOWED=YES'
    IOS_XCODE_EXTRA_ARGS=""
  fi

  BUNDLE_ID="${BUNDLE_ID:-com.onesignal.example}"

  if [[ "$SDK_TYPE" == "flutter" ]]; then
    FLUTTER_DIR="${FLUTTER_DIR:-$SDK_ROOT/OneSignal-Flutter-SDK}"
    [[ -d "$FLUTTER_DIR" ]] || error "Flutter SDK not found at $FLUTTER_DIR — set FLUTTER_DIR in .env"
    if [[ "$PODS_DEMO" == true ]]; then
      DEMO_DIR="$FLUTTER_DIR/examples/demo-pods"
    else
      DEMO_DIR="$FLUTTER_DIR/examples/demo"
    fi
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
      APP_PATH="${APP_PATH:-$DEMO_DIR/ios/build/Build/Products/${IOS_BUILD_DIR}/demo.app}"
    else
      APP_PATH="${APP_PATH:-$DEMO_DIR/android/app/build/outputs/apk/release/app-release.apk}"
    fi
  elif [[ "$SDK_TYPE" == "cordova" ]]; then
    CORDOVA_DIR="${CORDOVA_DIR:-$SDK_ROOT/OneSignal-Cordova-SDK}"
    [[ -d "$CORDOVA_DIR" ]] || error "Cordova SDK not found at $CORDOVA_DIR — set CORDOVA_DIR in .env"
    if [[ "$PODS_DEMO" == true ]]; then
      DEMO_DIR="$CORDOVA_DIR/examples/demo-pods"
    else
      DEMO_DIR="$CORDOVA_DIR/examples/demo"
    fi
    if [[ "$PLATFORM" == "ios" ]]; then
      APP_PATH="${APP_PATH:-$DEMO_DIR/ios/App/build/Build/Products/${IOS_BUILD_DIR}/App.app}"
    else
      APP_PATH="${APP_PATH:-$DEMO_DIR/android/app/build/outputs/apk/debug/app-debug.apk}"
    fi
  elif [[ "$SDK_TYPE" == "capacitor" ]]; then
    CAPACITOR_DIR="${CAPACITOR_DIR:-$SDK_ROOT/OneSignal-Capacitor-SDK}"
    [[ -d "$CAPACITOR_DIR" ]] || error "Capacitor SDK not found at $CAPACITOR_DIR — set CAPACITOR_DIR in .env"
    if [[ "$PODS_DEMO" == true ]]; then
      DEMO_DIR="$CAPACITOR_DIR/examples/demo-pods"
    else
      DEMO_DIR="$CAPACITOR_DIR/examples/demo"
    fi
    if [[ "$PLATFORM" == "ios" ]]; then
      APP_PATH="${APP_PATH:-$DEMO_DIR/ios/App/build/Build/Products/${IOS_BUILD_DIR}/App.app}"
    else
      APP_PATH="${APP_PATH:-$DEMO_DIR/android/app/build/outputs/apk/debug/app-debug.apk}"
    fi
  elif [[ "$SDK_TYPE" == "expo" ]]; then
    EXPO_DIR="${EXPO_DIR:-$SDK_ROOT/onesignal-expo-plugin}"
    [[ -d "$EXPO_DIR" ]] || error "Expo plugin not found at $EXPO_DIR — set EXPO_DIR in .env"
    DEMO_DIR="$EXPO_DIR/examples/demo"
    if [[ "$PLATFORM" == "ios" ]]; then
      APP_PATH="${APP_PATH:-$DEMO_DIR/ios/build/Build/Products/${IOS_BUILD_DIR}/OneSignalDemo.app}"
    else
      APP_PATH="${APP_PATH:-$DEMO_DIR/android/app/build/outputs/apk/release/app-release.apk}"
    fi
  elif [[ "$SDK_TYPE" == "dotnet" ]]; then
    DOTNET_DIR="${DOTNET_DIR:-$SDK_ROOT/DotNet/OneSignal-DotNet-SDK}"
    [[ -d "$DOTNET_DIR" ]] || error ".NET MAUI SDK not found at $DOTNET_DIR — set DOTNET_DIR in .env"
    DEMO_DIR="$DOTNET_DIR/examples/demo"
    DOTNET_TFM="${DOTNET_TFM:-net10.0}"
    if [[ "$PLATFORM" == "ios" ]]; then
      # iOS simulator RID is arch-specific; auto-detect host arch (Apple Silicon vs Intel).
      case "$(uname -m)" in
        arm64) DOTNET_IOS_RID="${DOTNET_IOS_RID:-iossimulator-arm64}" ;;
        x86_64) DOTNET_IOS_RID="${DOTNET_IOS_RID:-iossimulator-x64}" ;;
        *) error "Unsupported host arch for .NET iOS sim build: $(uname -m)" ;;
      esac
      APP_PATH="${APP_PATH:-$DEMO_DIR/bin/Debug/${DOTNET_TFM}-ios/${DOTNET_IOS_RID}/demo.app}"
    else
      # Android: by default `dotnet build` packs all four ABIs
      # (arm64-v8a;armeabi-v7a;x86;x86_64) into the APK. Each adds its own
      # ~30MB Mono runtime + native libs, which dominates the _BuildApkEmbed
      # MSBuild target (~5min full vs ~1min for one ABI). The emulator only
      # needs one ABI, so pick the host's native one.
      case "$(uname -m)" in
        arm64)  DOTNET_ANDROID_ABI="${DOTNET_ANDROID_ABI:-arm64-v8a}" ;;
        x86_64) DOTNET_ANDROID_ABI="${DOTNET_ANDROID_ABI:-x86_64}" ;;
        *) error "Unsupported host arch for .NET Android build: $(uname -m)" ;;
      esac
      case "$DOTNET_ANDROID_ABI" in
        arm64-v8a)   DOTNET_ANDROID_RID="${DOTNET_ANDROID_RID:-android-arm64}" ;;
        armeabi-v7a) DOTNET_ANDROID_RID="${DOTNET_ANDROID_RID:-android-arm}" ;;
        x86)         DOTNET_ANDROID_RID="${DOTNET_ANDROID_RID:-android-x86}" ;;
        x86_64)      DOTNET_ANDROID_RID="${DOTNET_ANDROID_RID:-android-x64}" ;;
        *) error "Unsupported .NET Android ABI: $DOTNET_ANDROID_ABI" ;;
      esac
      APP_PATH="${APP_PATH:-$DEMO_DIR/bin/Debug/${DOTNET_TFM}-android/com.onesignal.example-Signed.apk}"
    fi
  elif [[ "$SDK_TYPE" == "unity" ]]; then
    UNITY_DIR="${UNITY_DIR:-$SDK_ROOT/OneSignal-Unity-SDK}"
    [[ -d "$UNITY_DIR" ]] || error "Unity SDK not found at $UNITY_DIR — set UNITY_DIR in .env"
    DEMO_DIR="$UNITY_DIR/examples/demo"
    UNITY_PATH="${UNITY_PATH:-/Applications/Unity/Hub/Editor/6000.4.6f1/Unity.app/Contents/MacOS/Unity}"
    if [[ "$PLATFORM" == "ios" ]]; then
      # Match the host arch so Apple Silicon hosts run the sim natively instead
      # of going through Rosetta. UNITY_IOS_SIM_ARCH still wins as an override.
      case "$(uname -m)" in
        arm64) UNITY_IOS_SIM_ARCH="${UNITY_IOS_SIM_ARCH:-arm64}" ;;
        x86_64) UNITY_IOS_SIM_ARCH="${UNITY_IOS_SIM_ARCH:-x86_64}" ;;
        *) error "Unsupported host arch for Unity iOS sim build: $(uname -m)" ;;
      esac
      # Unity batchmode emits an Xcode project under Build/iOS named
      # `Unity-iPhone.xcodeproj` (a fixed Unity convention), but the *product*
      # name is configured to `OneSignalDemo` in Player Settings, so xcodebuild
      # produces `OneSignalDemo.app`. Scope the derived-data dir by arch so an
      # arch flip doesn't return a stale wrong-arch binary from the cache.
      APP_PATH="${APP_PATH:-$DEMO_DIR/Build/iOS-DerivedData-${UNITY_IOS_SIM_ARCH}/Build/Products/ReleaseForRunning-iphonesimulator/OneSignalDemo.app}"
    else
      APP_PATH="${APP_PATH:-$DEMO_DIR/Build/Android/onesignal-demo.apk}"
    fi
  elif [[ "$SDK_TYPE" == "android" ]]; then
    ANDROID_DIR="${ANDROID_DIR:-$SDK_ROOT/OneSignal-Android-SDK}"
    [[ -d "$ANDROID_DIR" ]] || error "Native Android SDK not found at $ANDROID_DIR — set ANDROID_DIR in .env"
    DEMO_DIR="$ANDROID_DIR/examples/demo"
    ANDROID_FLAVOR="${ANDROID_FLAVOR:-gms}"
    ANDROID_BUILD_TYPE="${ANDROID_BUILD_TYPE:-debug}"
    case "$ANDROID_FLAVOR" in
      gms|huawei) ;;
      *) error "ANDROID_FLAVOR must be 'gms' or 'huawei', got '$ANDROID_FLAVOR'" ;;
    esac
    case "$ANDROID_BUILD_TYPE" in
      debug|release) ;;
      *) error "ANDROID_BUILD_TYPE must be 'debug' or 'release', got '$ANDROID_BUILD_TYPE'" ;;
    esac
    # Gradle emits per-flavor/type APKs under app/build/outputs/apk/<flavor>/<buildType>/.
    APP_PATH="${APP_PATH:-$DEMO_DIR/app/build/outputs/apk/${ANDROID_FLAVOR}/${ANDROID_BUILD_TYPE}/app-${ANDROID_FLAVOR}-${ANDROID_BUILD_TYPE}.apk}"
  elif [[ "$SDK_TYPE" == "ios" ]]; then
    IOS_DIR="${IOS_DIR:-$SDK_ROOT/OneSignal-iOS-SDK}"
    [[ -d "$IOS_DIR" ]] || error "Native iOS SDK not found at $IOS_DIR — set IOS_DIR in .env"
    DEMO_DIR="$IOS_DIR/examples/demo"
    # XcodeGen names the scheme after the project, so we derive both the scheme
    # and the .app artifact name from IOS_NATIVE_PROJECT's basename.
    IOS_NATIVE_PROJECT="${IOS_NATIVE_PROJECT:-App.xcodeproj}"
    APP_PATH="${APP_PATH:-$DEMO_DIR/build/Build/Products/${IOS_BUILD_DIR}/${IOS_NATIVE_PROJECT%.xcodeproj}.app}"
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
}
