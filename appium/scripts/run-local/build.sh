#!/usr/bin/env bash

# ── 1. Build app ─────────────────────────────────────────────────────────────
build_flutter_ios() {
  if [[ -n "${ONESIGNAL_APP_ID:-}" && -n "${ONESIGNAL_API_KEY:-}" ]]; then
    info "Writing .env for demo app..."
    cat > "$DEMO_DIR/.env" <<EOF
ONESIGNAL_APP_ID=$ONESIGNAL_APP_ID
ONESIGNAL_API_KEY=$ONESIGNAL_API_KEY
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
ONESIGNAL_ANDROID_CHANNEL_ID=$ANDROID_CHANNEL_ID
EOF
  else
    warn "ONESIGNAL_APP_ID / ONESIGNAL_API_KEY not set — skipping demo .env"
  fi
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

  info "Building release .app for ${IOS_SDK} (self-contained, no Metro required)..."
  (cd "$DEMO_DIR/ios" && xcodebuild \
    -workspace demo.xcworkspace \
    -scheme demo \
    -configuration Release \
    -sdk "$IOS_SDK" \
    ${IOS_DESTINATION:+-destination} ${IOS_DESTINATION:+"$IOS_DESTINATION"} $IOS_XCODE_EXTRA_ARGS \
    -derivedDataPath build \
    -quiet \
    ONLY_ACTIVE_ARCH=YES \
    ENABLE_USER_SCRIPT_SANDBOXING=NO \
    COMPILER_INDEX_STORE_ENABLE=NO \
    SWIFT_INDEX_STORE_ENABLE=NO \
    $IOS_SIGNING_ARGS)

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
VITE_ONESIGNAL_ANDROID_CHANNEL_ID=$ANDROID_CHANNEL_ID
EOF
  else
    warn "ONESIGNAL_APP_ID / ONESIGNAL_API_KEY not set — skipping demo .env"
  fi
}

patch_cordova_ios_podfile_git_branch() {
  local podfile="$DEMO_DIR/ios/App/Podfile"
  local branch

  if [[ ! -f "$podfile" ]]; then
    return
  fi

  branch=$(git -C "$CORDOVA_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || true)
  if [[ "$branch" != rel/* ]]; then
    return
  fi

  info "Repointing OneSignalCordovaDependencies pod to git branch ${branch}..."
  PODFILE="$podfile" BRANCH="$branch" python3 <<'PY'
import os
import re
from pathlib import Path

podfile = Path(os.environ["PODFILE"])
branch = os.environ["BRANCH"]
text = podfile.read_text()
pod_line = (
    "pod 'OneSignalCordovaDependencies', "
    ":git => 'https://github.com/OneSignal/OneSignal-Cordova-SDK.git', "
    f":branch => '{branch}'"
)

text, count = re.subn(
    r"pod 'OneSignalCordovaDependencies'.*",
    pod_line,
    text,
)
if count == 0:
    raise SystemExit("Unable to find OneSignalCordovaDependencies pod in Podfile")

podfile.write_text(text)
PY
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
  local sdk_src_hash="${2:-none}"
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
                 \( -name "Podfile" -o -name "build.gradle" -o -name "build.gradle.kts" \
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
  echo "${content_hash}-${sdk_src_hash}"
}

build_cordova_ios() {
  write_cordova_demo_env
  setup_cordova_sdk

  info "Building web bundle (vite)..."
  (cd "$DEMO_DIR" && vp run build)

  local sync_stamp="$DEMO_DIR/ios/App/build/.cap-sync.stamp"
  local sync_hash
  sync_hash=$(cap_sync_inputs_hash "ios/App" "${CORDOVA_SDK_SRC_HASH:-none}")
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
    if ! (cd "$DEMO_DIR" && vpx cap sync ios); then
      patch_cordova_ios_podfile_git_branch
      info "Refreshing OneSignalXCFramework after local dependency changes..."
      (cd "$DEMO_DIR/ios/App" && pod update OneSignalXCFramework)
    fi
    mkdir -p "$(dirname "$sync_stamp")"
    echo "$sync_hash" > "$sync_stamp"
  fi

  info "Building release .app for ${IOS_SDK}..."
  local -a xcode_target_args
  if [[ -d "$DEMO_DIR/ios/App/App.xcworkspace" ]]; then
    xcode_target_args=(-workspace App.xcworkspace)
  elif [[ -d "$DEMO_DIR/ios/App/App.xcodeproj" ]]; then
    xcode_target_args=(-project App.xcodeproj)
  else
    error "No App.xcworkspace or App.xcodeproj found under $DEMO_DIR/ios/App"
  fi
  (cd "$DEMO_DIR/ios/App" && xcodebuild \
    "${xcode_target_args[@]}" \
    -scheme App \
    -configuration Release \
    -sdk "$IOS_SDK" \
    ${IOS_DESTINATION:+-destination} ${IOS_DESTINATION:+"$IOS_DESTINATION"} $IOS_XCODE_EXTRA_ARGS \
    -derivedDataPath build \
    -quiet \
    ONLY_ACTIVE_ARCH=YES \
    ENABLE_USER_SCRIPT_SANDBOXING=NO \
    COMPILER_INDEX_STORE_ENABLE=NO \
    SWIFT_INDEX_STORE_ENABLE=NO \
    $IOS_SIGNING_ARGS)

  [[ -d "$APP_PATH" ]] || error ".app not found after build at $APP_PATH"
  info "App built: $APP_PATH"
}

build_cordova_android() {
  write_cordova_demo_env
  setup_cordova_sdk

  info "Building web bundle (vite)..."
  (cd "$DEMO_DIR" && vp run build)

  local sync_stamp="$DEMO_DIR/android/build/.cap-sync.stamp"
  local sync_hash
  sync_hash=$(cap_sync_inputs_hash "android" "${CORDOVA_SDK_SRC_HASH:-none}")
  if [[ -d "$DEMO_DIR/android/app/src/main/assets/public" ]] && [[ -f "$sync_stamp" ]] && [[ "$(cat "$sync_stamp")" == "$sync_hash" ]]; then
    info "Capacitor sync inputs unchanged, skipping cap sync"
  else
    info "Syncing Capacitor..."
    (cd "$DEMO_DIR" && vpx cap sync android)
    mkdir -p "$(dirname "$sync_stamp")"
    echo "$sync_hash" > "$sync_stamp"
  fi

  info "Building debug APK (release has no signing config)..."
  (cd "$DEMO_DIR/android" && ./gradlew assembleDebug)

  [[ -f "$APP_PATH" ]] || error ".apk not found after build at $APP_PATH"
  info "App built: $APP_PATH"
}

write_capacitor_demo_env() {
  if [[ -n "${ONESIGNAL_APP_ID:-}" && -n "${ONESIGNAL_API_KEY:-}" ]]; then
    info "Writing .env for demo app..."
    cat > "$DEMO_DIR/.env" <<EOF
VITE_ONESIGNAL_APP_ID=$ONESIGNAL_APP_ID
VITE_ONESIGNAL_API_KEY=$ONESIGNAL_API_KEY
VITE_ONESIGNAL_ANDROID_CHANNEL_ID=$ANDROID_CHANNEL_ID
EOF
  else
    warn "ONESIGNAL_APP_ID / ONESIGNAL_API_KEY not set — skipping demo .env"
  fi
}


build_capacitor_ios() {
  write_capacitor_demo_env
  setup_capacitor_sdk

  info "Building web bundle (vite)..."
  (cd "$DEMO_DIR" && vp run build)

  local sync_stamp="$DEMO_DIR/ios/App/build/.cap-sync.stamp"
  local sync_hash
  sync_hash=$(cap_sync_inputs_hash "ios/App" "${CAPACITOR_SDK_SRC_HASH:-none}")
  if [[ -d "$DEMO_DIR/ios/App/App/public" ]] && [[ -f "$sync_stamp" ]] && [[ "$(cat "$sync_stamp")" == "$sync_hash" ]]; then
    info "Capacitor sync inputs unchanged, skipping cap sync"
  else
    # See note in build_cordova_ios: stamp the build dir so cap-sync's
    # `xcodebuild clean` doesn't fail on modern Xcode's safety check.
    mkdir -p "$DEMO_DIR/ios/App/build"
    xattr -w com.apple.xcode.CreatedByBuildSystem true "$DEMO_DIR/ios/App/build" 2>/dev/null || true

    info "Syncing Capacitor (resolves SPM dependencies)..."
    (cd "$DEMO_DIR" && vpx cap sync ios)
    mkdir -p "$(dirname "$sync_stamp")"
    echo "$sync_hash" > "$sync_stamp"
  fi

  # Capacitor 7 uses Swift Package Manager (no Pods/.xcworkspace), so we
  # build the .xcodeproj directly. Xcode auto-generates the "App" scheme
  # from the App target on first build.
  info "Building release .app for ${IOS_SDK}..."
  (cd "$DEMO_DIR/ios/App" && xcodebuild \
    -project App.xcodeproj \
    -scheme App \
    -configuration Release \
    -sdk "$IOS_SDK" \
    ${IOS_DESTINATION:+-destination} ${IOS_DESTINATION:+"$IOS_DESTINATION"} $IOS_XCODE_EXTRA_ARGS \
    -derivedDataPath build \
    -quiet \
    ONLY_ACTIVE_ARCH=YES \
    ENABLE_USER_SCRIPT_SANDBOXING=NO \
    COMPILER_INDEX_STORE_ENABLE=NO \
    SWIFT_INDEX_STORE_ENABLE=NO \
    $IOS_SIGNING_ARGS)

  [[ -d "$APP_PATH" ]] || error ".app not found after build at $APP_PATH"
  info "App built: $APP_PATH"
}

build_capacitor_android() {
  write_capacitor_demo_env
  setup_capacitor_sdk

  info "Building web bundle (vite)..."
  (cd "$DEMO_DIR" && vp run build)

  local sync_stamp="$DEMO_DIR/android/build/.cap-sync.stamp"
  local sync_hash
  sync_hash=$(cap_sync_inputs_hash "android" "${CAPACITOR_SDK_SRC_HASH:-none}")
  if [[ -d "$DEMO_DIR/android/app/src/main/assets/public" ]] && [[ -f "$sync_stamp" ]] && [[ "$(cat "$sync_stamp")" == "$sync_hash" ]]; then
    info "Capacitor sync inputs unchanged, skipping cap sync"
  else
    info "Syncing Capacitor..."
    (cd "$DEMO_DIR" && vpx cap sync android)
    mkdir -p "$(dirname "$sync_stamp")"
    echo "$sync_hash" > "$sync_stamp"
  fi

  info "Building debug APK (release has no signing config)..."
  (cd "$DEMO_DIR/android" && ./gradlew assembleDebug)

  [[ -f "$APP_PATH" ]] || error ".apk not found after build at $APP_PATH"
  info "App built: $APP_PATH"
}

write_expo_demo_env() {
  # Expo only inlines vars prefixed with EXPO_PUBLIC_ into the JS bundle.
  # Without the prefix the demo's `process.env.EXPO_PUBLIC_*` reads return
  # undefined at runtime even though Expo CLI loads the file.
  if [[ -n "${ONESIGNAL_APP_ID:-}" && -n "${ONESIGNAL_API_KEY:-}" ]]; then
    info "Writing .env for demo app..."
    cat > "$DEMO_DIR/.env" <<EOF
EXPO_PUBLIC_ONESIGNAL_APP_ID=$ONESIGNAL_APP_ID
EXPO_PUBLIC_ONESIGNAL_API_KEY=$ONESIGNAL_API_KEY
EXPO_PUBLIC_ONESIGNAL_ANDROID_CHANNEL_ID=$ANDROID_CHANNEL_ID
EOF
  else
    warn "ONESIGNAL_APP_ID / ONESIGNAL_API_KEY not set — skipping demo .env"
  fi
}


# Hash of every input that can affect the compiled .app/.apk for an Expo demo
# build: JS sources, RN config, the host-platform's native project files, the
# Podfile/Gradle wiring, and the plugin source (folded in via env). Used by
# build_expo_* to skip xcodebuild/gradle entirely on no-op rebuilds.
expo_demo_inputs_hash() {
  local platform_dir="$1"  # ios | android
  local content_hash
  content_hash=$(find "$DEMO_DIR/App.tsx" "$DEMO_DIR/index.js" \
                      "$DEMO_DIR/app.config.ts" "$DEMO_DIR/metro.config.js" \
                      "$DEMO_DIR/package.json" "$DEMO_DIR/bun.lock" \
                      "$DEMO_DIR/tsconfig.json" "$DEMO_DIR/eslint.config.js" \
                      "$DEMO_DIR/src" "$DEMO_DIR/components" \
                      "$DEMO_DIR/hooks" "$DEMO_DIR/constants" \
                      "$DEMO_DIR/assets" "$DEMO_DIR/types" \
                      "$DEMO_DIR/$platform_dir" \
                 -type f \
                 ! -path "*/node_modules/*" \
                 ! -path "*/Pods/*" \
                 ! -path "*/build/*" \
                 ! -path "*/DerivedData/*" \
                 ! -path "*/xcuserdata/*" \
                 ! -path "*/.gradle/*" \
                 \( -name "Podfile" -o -name "Podfile.lock" \
                    -o -name "Podfile.properties.json" \
                    -o -name "build.gradle" -o -name "settings.gradle" \
                    -o -name "gradle.properties" -o -name "*.pbxproj" \
                    -o -name "*.entitlements" -o -name "*.plist" \
                    -o -name "*.xcprivacy" -o -name "*.swift" \
                    -o -name "*.h" -o -name "*.m" -o -name "*.mm" \
                    -o -name "*.storyboard" -o -name "*.wav" \
                    -o -name "*.ts" -o -name "*.tsx" -o -name "*.js" \
                    -o -name "*.jsx" -o -name "*.json" -o -name "*.png" \
                    -o -name "*.jpg" -o -name "*.svg" -o -name "*.lock" \
                    -o -name ".env" \) \
                 2>/dev/null \
                 | sort \
                 | xargs shasum 2>/dev/null \
                 | shasum \
                 | awk '{print $1}')
  echo "${content_hash}-${EXPO_PLUGIN_SRC_HASH:-none}"
}

build_expo_ios() {
  write_expo_demo_env
  setup_expo_plugin

  # Top-level skip: if neither the demo's JS/native sources nor the plugin
  # changed and the .app is still on disk, an xcodebuild "up to date" pass
  # would still take ~30-60s (resource copy, JS bundle embed, codesign,
  # validation). Skip the whole thing.
  local build_stamp="$DEMO_DIR/ios/build/.expo-build-ios.stamp"
  local build_hash
  build_hash=$(expo_demo_inputs_hash ios)
  if [[ -d "$APP_PATH" ]] && [[ -f "$build_stamp" ]] && [[ "$(cat "$build_stamp")" == "$build_hash" ]]; then
    info "Expo demo + plugin source unchanged, skipping iOS rebuild"
    info "App: $APP_PATH"
    return
  fi

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

  # DEBUG_INFORMATION_FORMAT=dwarf: skips dSYM bundle generation (~5-15s on
  # an Expo Release build). Simulator E2E never needs symbolicated crash
  # reports, so we save the I/O. Default for Release would be `dwarf-with-dsym`.
  info "Building release .app for ${IOS_SDK} (self-contained, no Metro required)..."
  (cd "$DEMO_DIR/ios" && xcodebuild \
    -workspace OneSignalDemo.xcworkspace \
    -scheme OneSignalDemo \
    -configuration Release \
    -sdk "$IOS_SDK" \
    ${IOS_DESTINATION:+-destination} ${IOS_DESTINATION:+"$IOS_DESTINATION"} $IOS_XCODE_EXTRA_ARGS \
    -derivedDataPath build \
    -quiet \
    ONLY_ACTIVE_ARCH=YES \
    ENABLE_USER_SCRIPT_SANDBOXING=NO \
    COMPILER_INDEX_STORE_ENABLE=NO \
    SWIFT_INDEX_STORE_ENABLE=NO \
    DEBUG_INFORMATION_FORMAT=dwarf \
    $IOS_SIGNING_ARGS)

  [[ -d "$APP_PATH" ]] || error ".app not found after build at $APP_PATH"
  mkdir -p "$(dirname "$build_stamp")"
  echo "$build_hash" > "$build_stamp"
  info "App built: $APP_PATH"
}

build_expo_android() {
  write_expo_demo_env
  setup_expo_plugin

  info "Building release APK (self-contained, no Metro required)..."
  (cd "$DEMO_DIR/android" && ./gradlew assembleRelease)

  [[ -f "$APP_PATH" ]] || error ".apk not found after build at $APP_PATH"
  info "App built: $APP_PATH"
}

write_dotnet_demo_env() {
  if [[ -n "${ONESIGNAL_APP_ID:-}" && -n "${ONESIGNAL_API_KEY:-}" ]]; then
    info "Writing .env for demo app..."
    cat > "$DEMO_DIR/.env" <<EOF
ONESIGNAL_APP_ID=$ONESIGNAL_APP_ID
ONESIGNAL_API_KEY=$ONESIGNAL_API_KEY
EOF
  else
    warn "ONESIGNAL_APP_ID / ONESIGNAL_API_KEY not set — skipping demo .env"
  fi
}

# SDK + binding source roots for a given platform. The SDK rarely changes on
# day-to-day demo work, so we hash and build it independently from the demo and
# fold its hash into the demo input hash so SDK edits still cascade-invalidate.
dotnet_sdk_paths() {
  local platform="$1"  # ios | android
  echo "$DOTNET_DIR/OneSignalSDK.DotNet"
  echo "$DOTNET_DIR/OneSignalSDK.DotNet.Core"
  echo "$DOTNET_DIR/Directory.Build.props"
  if [[ "$platform" == "ios" ]]; then
    echo "$DOTNET_DIR/OneSignalSDK.DotNet.iOS"
    echo "$DOTNET_DIR/OneSignalSDK.DotNet.iOS.Binding"
  else
    echo "$DOTNET_DIR/OneSignalSDK.DotNet.Android"
    echo "$DOTNET_DIR/OneSignalSDK.DotNet.Android.Core.Binding"
    echo "$DOTNET_DIR/OneSignalSDK.DotNet.Android.InAppMessages.Binding"
    echo "$DOTNET_DIR/OneSignalSDK.DotNet.Android.Location.Binding"
    echo "$DOTNET_DIR/OneSignalSDK.DotNet.Android.Notifications.Binding"
  fi
}

# Hash any source/metadata file under the given roots that can affect compiled
# output. Used by both the SDK and demo hashes; centralised so the inclusion
# rules stay in sync.
dotnet_hash_paths() {
  find "$@" \
       -type f \
       ! -path "*/bin/*" \
       ! -path "*/obj/*" \
       ! -path "*/artifacts/*" \
       \( -name "*.cs" -o -name "*.csproj" -o -name "*.props" \
          -o -name "*.targets" -o -name "*.xaml" -o -name "*.plist" \
          -o -name "*.xml" -o -name "*.json" -o -name "*.png" \
          -o -name "*.aar" -o -name "*.jar" -o -name ".env" \) \
       2>/dev/null \
       | sort \
       | xargs shasum 2>/dev/null \
       | shasum \
       | awk '{print $1}'
}

dotnet_sdk_inputs_hash() {
  local platform="$1"
  local roots=()
  while IFS= read -r p; do roots+=("$p"); done < <(dotnet_sdk_paths "$platform")
  dotnet_hash_paths "${roots[@]}"
}

# Demo hash folds in the SDK hash so an SDK edit busts the demo cache too.
dotnet_demo_inputs_hash() {
  local platform="$1"
  local sdk_hash="$2"
  local demo_hash
  demo_hash=$(dotnet_hash_paths "$DEMO_DIR")
  printf '%s\n%s\n' "$sdk_hash" "$demo_hash" | shasum | awk '{print $1}'
}

# Returns 0 if a previous build's stamp matches the current input hash AND the
# expected output artifact still exists, in which case the caller should skip.
dotnet_build_is_cached() {
  local stamp="$1" artifact="$2" hash="$3"
  [[ -e "$artifact" ]] || return 1
  [[ -f "$stamp" ]] || return 1
  [[ "$(cat "$stamp")" == "$hash" ]] || return 1
  return 0
}

# Build only the SDK + binding projects for the given platform. The demo's
# csproj has a ProjectReference to `OneSignalSDK.DotNet`, so building that one
# project transitively builds every binding it pulls in for the target TFM.
# Cached separately so demo-only edits don't pay the SDK build cost.
build_dotnet_sdk() {
  local platform="$1"  # ios | android
  local tfm="${DOTNET_TFM}-${platform}"
  local sdk_proj="$DOTNET_DIR/OneSignalSDK.DotNet/OneSignalSDK.DotNet.csproj"
  local sdk_dll="$DOTNET_DIR/OneSignalSDK.DotNet/bin/Debug/${tfm}/OneSignalSDK.DotNet.dll"
  local stamp="$DOTNET_DIR/OneSignalSDK.DotNet/bin/Debug/.sdk-build-${platform}.stamp"
  local hash="$2"

  if dotnet_build_is_cached "$stamp" "$sdk_dll" "$hash"; then
    info ".NET SDK unchanged, skipping SDK rebuild"
    return
  fi

  local -a xcode_args
  if [[ "$platform" == "ios" ]]; then
    read -r -a xcode_args <<<"$(dotnet_ios_xcode_check_args)"
  fi

  info "Building .NET SDK + bindings for ${tfm}..."
  dotnet build "$sdk_proj" -c Debug -f "$tfm" ${xcode_args[@]+"${xcode_args[@]}"}

  [[ -f "$sdk_dll" ]] || error "SDK build did not produce $sdk_dll"
  mkdir -p "$(dirname "$stamp")"
  echo "$hash" > "$stamp"
}

# If the installed Microsoft.iOS.Sdk workload was published for a different
# Xcode major.minor than what's on the host, MSBuild aborts the build via the
# _ValidateXcodeVersion target. Echoes `-p:ValidateXcodeVersion=false` when a
# mismatch is detected (and logs once) so the build still runs without
# requiring the user to keep dotnet workloads and Xcode in lockstep.
dotnet_ios_xcode_check_args() {
  local host_xcode pack_dir workload_xcode host_mm workload_mm
  host_xcode=$(xcodebuild -version 2>/dev/null | head -n1 | awk '{print $2}')
  for root in /usr/local/share/dotnet "$HOME/.dotnet"; do
    pack_dir=$(ls -1d "$root/packs/Microsoft.iOS.Sdk.${DOTNET_TFM}_"* 2>/dev/null | sort -V | tail -n1)
    [[ -n "$pack_dir" ]] && break
  done
  [[ -n "$host_xcode" && -n "$pack_dir" ]] || return 0

  workload_xcode=$(basename "$pack_dir" | sed "s|Microsoft.iOS.Sdk.${DOTNET_TFM}_||")
  host_mm=$(awk -F. '{printf "%s.%s", $1, $2}' <<<"$host_xcode")
  workload_mm=$(awk -F. '{printf "%s.%s", $1, $2}' <<<"$workload_xcode")
  if [[ "$host_mm" != "$workload_mm" ]]; then
    info ".NET iOS workload targets Xcode ${workload_mm}; host has ${host_mm} — bypassing Xcode version check" >&2
    echo "-p:ValidateXcodeVersion=false"
  fi
}

build_dotnet_ios() {
  write_dotnet_demo_env

  command -v dotnet >/dev/null 2>&1 || error "dotnet CLI not found in PATH — install the .NET SDK"

  local sdk_hash demo_hash
  sdk_hash=$(dotnet_sdk_inputs_hash ios)
  demo_hash=$(dotnet_demo_inputs_hash ios "$sdk_hash")

  local stamp="$DEMO_DIR/bin/Debug/.dotnet-build-ios-${DOTNET_IOS_RID}.stamp"
  if dotnet_build_is_cached "$stamp" "$APP_PATH" "$demo_hash"; then
    info ".NET SDK + demo source unchanged, skipping rebuild"
    info "App: $APP_PATH"
    return
  fi

  build_dotnet_sdk ios "$sdk_hash"

  local -a xcode_args
  read -r -a xcode_args <<<"$(dotnet_ios_xcode_check_args)"

  # --no-dependencies: SDK is already built (and cached) by build_dotnet_sdk,
  # so MSBuild can skip even checking referenced projects for up-to-date.
  info "Building Debug .app for iOS simulator (${DOTNET_IOS_RID})..."
  (cd "$DEMO_DIR" && dotnet build demo.csproj \
    -c Debug \
    -f "${DOTNET_TFM}-ios" \
    -p:RuntimeIdentifier="${DOTNET_IOS_RID}" \
    ${xcode_args[@]+"${xcode_args[@]}"} \
    --no-dependencies)

  [[ -d "$APP_PATH" ]] || error ".app not found after build at $APP_PATH"
  mkdir -p "$(dirname "$stamp")"
  echo "$demo_hash" > "$stamp"
  info "App built: $APP_PATH"
}

build_dotnet_android() {
  write_dotnet_demo_env

  command -v dotnet >/dev/null 2>&1 || error "dotnet CLI not found in PATH — install the .NET SDK"

  local sdk_hash demo_hash build_hash
  sdk_hash=$(dotnet_sdk_inputs_hash android)
  demo_hash=$(dotnet_demo_inputs_hash android "$sdk_hash")
  # Fold the ABI into the stamp so flipping DOTNET_ANDROID_ABI between
  # runs (or changing the default) busts the cache - the on-disk APK
  # would otherwise look up-to-date but contain the wrong native libs.
  build_hash=$(printf '%s\n%s\n' "$demo_hash" "$DOTNET_ANDROID_ABI" | shasum | awk '{print $1}')

  local stamp="$DEMO_DIR/bin/Debug/.dotnet-build-android.stamp"
  if dotnet_build_is_cached "$stamp" "$APP_PATH" "$build_hash"; then
    info ".NET SDK + demo source unchanged, skipping rebuild"
    info "App: $APP_PATH"
    return
  fi

  build_dotnet_sdk android "$sdk_hash"

  # EmbedAssembliesIntoApk=true: by default `dotnet build -c Debug` for Android
  # uses Fast Deployment, which leaves the managed assemblies *out* of the APK
  # and pushes them live to /data/.../files/.__override__/<abi>/ via
  # `-t:Run`. Appium just installs the APK, so without this flag monodroid
  # aborts at startup with "No assemblies found in ... Fast Deployment. Exiting".
  #
  # AndroidLinkMode=None: skips the IL linker/trimmer pass on every demo edit.
  # The linker normally trims unused IL across SDK + bindings + demo, which is
  # ~15-25s of fixed cost per build. Debug builds don't need it (slightly larger
  # APK is fine on the dev loop) and turning it off keeps incremental rebuilds
  # of demo-only changes well under a minute.
  #
  # --no-dependencies: SDK already built above, so we skip MSBuild's
  # up-to-date check on every referenced project.
  #
  # AndroidSupportedAbis: restrict to the host's native ABI (set above) so
  # _BuildApkEmbed only packs one Mono runtime instead of all four.
  info "Building Debug APK (ABI=${DOTNET_ANDROID_ABI})..."
  (cd "$DEMO_DIR" && dotnet build demo.csproj \
    -c Debug \
    -f "${DOTNET_TFM}-android" \
    -p:EmbedAssembliesIntoApk=true \
    -p:AndroidUseFastDeployment=false \
    -p:AndroidLinkMode=None \
    -p:AndroidSupportedAbis="$DOTNET_ANDROID_ABI" \
    --no-dependencies)

  [[ -f "$APP_PATH" ]] || error ".apk not found after build at $APP_PATH"
  mkdir -p "$(dirname "$stamp")"
  echo "$build_hash" > "$stamp"
  info "App built: $APP_PATH"
}

write_unity_demo_env() {
  if [[ -n "${ONESIGNAL_APP_ID:-}" && -n "${ONESIGNAL_API_KEY:-}" ]]; then
    info "Writing .env for demo app..."
    cat > "$DEMO_DIR/.env" <<EOF
ONESIGNAL_APP_ID=$ONESIGNAL_APP_ID
ONESIGNAL_API_KEY=$ONESIGNAL_API_KEY
E2E_MODE=true
EOF
    # DotEnv loads from Application.streamingAssetsPath/.env in the built
    # player; the demo's project-root .env is only read in the editor.
    # Copy in lockstep so the built .app/.apk has the same E2E_MODE flag,
    # which the AccessibilityBridge gates on.
    mkdir -p "$DEMO_DIR/Assets/StreamingAssets"
    cp "$DEMO_DIR/.env" "$DEMO_DIR/Assets/StreamingAssets/.env"
  else
    warn "ONESIGNAL_APP_ID / ONESIGNAL_API_KEY not set — skipping demo .env"
  fi
}

# Hash any source/asset/config file under the given roots that can affect the
# compiled .app/.apk for a Unity build. Mirrors `dotnet_hash_paths` in spirit:
# centralised so SDK and demo hashes stay in sync. Skips Unity-managed caches
# (Library/, Temp/, Build/, Logs/) and editor-private dirs (UserSettings/,
# *~ doc/sample folders Unity excludes from imports).
unity_hash_paths() {
  # Unity projects routinely have spaces in paths (e.g. "Build Profiles/"),
  # so we use NUL-delimited find/xargs throughout. Sorting the per-file
  # shasum output (rather than the input list) keeps results deterministic
  # without needing a `sort -z`-capable host.
  find "$@" \
       -type f \
       ! -path "*/Library/*" \
       ! -path "*/Temp/*" \
       ! -path "*/Build/*" \
       ! -path "*/Logs/*" \
       ! -path "*/UserSettings/*" \
       ! -path "*/Documentation~/*" \
       ! -path "*/Samples~/*" \
       \( -name "*.cs" -o -name "*.asmdef" -o -name "*.asmref" \
          -o -name "*.meta" -o -name "*.json" -o -name "*.xml" \
          -o -name "*.plist" -o -name "*.strings" \
          -o -name "*.h" -o -name "*.m" -o -name "*.mm" -o -name "*.swift" \
          -o -name "*.java" \
          -o -name "*.a" -o -name "*.aar" -o -name "*.jar" \
          -o -name "*.so" -o -name "*.dll" -o -name "*.dylib" \
          -o -name "*.uxml" -o -name "*.uss" -o -name "*.unity" \
          -o -name "*.prefab" -o -name "*.asset" -o -name "*.mat" \
          -o -name "*.shader" -o -name "*.png" -o -name "*.jpg" \
          -o -name "*.txt" -o -name ".env" \) \
       -print0 2>/dev/null \
       | xargs -0 shasum 2>/dev/null \
       | sort \
       | shasum \
       | awk '{print $1}'
}

# SDK package roots for a given platform. The Unity SDK rarely changes during
# day-to-day demo work, so we hash and fold it into the demo hash so SDK edits
# still cascade-invalidate the cached build artifact.
unity_sdk_paths() {
  local platform="$1"  # ios | android
  echo "$UNITY_DIR/com.onesignal.unity.core"
  if [[ "$platform" == "ios" ]]; then
    echo "$UNITY_DIR/com.onesignal.unity.ios"
  else
    echo "$UNITY_DIR/com.onesignal.unity.android"
  fi
}

unity_sdk_inputs_hash() {
  local platform="$1"
  local roots=()
  while IFS= read -r p; do roots+=("$p"); done < <(unity_sdk_paths "$platform")
  unity_hash_paths "${roots[@]}"
}

# Demo hash folds in the SDK hash so an SDK edit busts the demo cache too.
unity_demo_inputs_hash() {
  local sdk_hash="$1"
  local demo_hash
  demo_hash=$(unity_hash_paths "$DEMO_DIR/Assets" "$DEMO_DIR/Packages" \
                               "$DEMO_DIR/ProjectSettings")
  # Fold the demo .env in separately — `unity_hash_paths` only finds it when
  # passed as a directory glob, but here we want the file hash if it exists.
  local env_hash=""
  [[ -f "$DEMO_DIR/.env" ]] && env_hash=$(shasum < "$DEMO_DIR/.env" | awk '{print $1}')
  printf '%s\n%s\n%s\n' "$sdk_hash" "$demo_hash" "$env_hash" | shasum | awk '{print $1}'
}

unity_build_is_cached() {
  local stamp="$1" artifact="$2" hash="$3"
  [[ -e "$artifact" ]] || return 1
  [[ -f "$stamp" ]] || return 1
  [[ "$(cat "$stamp")" == "$hash" ]] || return 1
  return 0
}

unity_failure_hint() {
  local log="$1"
  echo "Unity exited non-zero (see $log)."
  echo ""

  # Surface the actual reason from the log instead of guessing. Order
  # matters: check most-specific patterns first.
  if grep -q "No valid Unity Editor license found" "$log" 2>/dev/null; then
    cat <<EOF
Cause: no active Unity Editor license. Open Unity Hub → Preferences →
Licenses, sign in with your Unity ID, and activate a Personal/Pro license.
EOF
  elif grep -q "another Unity instance is running" "$log" 2>/dev/null; then
    cat <<EOF
Cause: another Unity Editor instance has the project open. Close it
(only one process can hold the project lock) then re-run.
EOF
  elif grep -q "Scripts have compiler errors" "$log" 2>/dev/null; then
    echo "Cause: C# compile error. First few errors from the log:"
    grep -E "error CS[0-9]+:|error:" "$log" 2>/dev/null | head -5 | sed 's/^/  /'
  else
    echo "See the log above for details."
  fi
}

build_unity_ios() {
  write_unity_demo_env

  [[ -x "$UNITY_PATH" ]] || error "Unity Editor not found at $UNITY_PATH — set UNITY_PATH in .env"

  # Top-level skip: if neither the demo nor the SDK changed and the .app is
  # still on disk, both stages (Unity batchmode 5-10min + xcodebuild 1-2min)
  # would otherwise reproduce identical output. Skip the whole thing.
  local sdk_hash demo_hash
  sdk_hash=$(unity_sdk_inputs_hash ios)
  demo_hash=$(unity_demo_inputs_hash "$sdk_hash")

  local stamp="$DEMO_DIR/Build/.unity-build-ios-${UNITY_IOS_SIM_ARCH}.stamp"
  if unity_build_is_cached "$stamp" "$APP_PATH" "$demo_hash"; then
    info "Unity SDK + demo source unchanged, skipping iOS rebuild"
    info "App: $APP_PATH"
    return
  fi

  local xcode_dir="$DEMO_DIR/Build/iOS"
  local derived="$DEMO_DIR/Build/iOS-DerivedData-${UNITY_IOS_SIM_ARCH}"
  local log="$DEMO_DIR/Build/build-ios.log"
  mkdir -p "$xcode_dir"

  info "Generating Xcode project from Unity (batchmode, log: $log)..."
  if ! "$UNITY_PATH" -batchmode -nographics -quit -buildTarget iOS \
        -projectPath "$DEMO_DIR" -executeMethod BuildScript.BuildiOSSimulator \
        -logFile "$log"; then
    unity_failure_hint "$log" >&2
    error "Unity batchmode build failed"
  fi

  [[ -d "$xcode_dir/Unity-iPhone.xcodeproj" ]] || error "Unity build produced no Xcode project — see $log"

  if [[ -f "$xcode_dir/Podfile" ]]; then
    local lock="$xcode_dir/Podfile.lock"
    local pod_stamp="$derived/.podfile.lock.stamp"
    if [[ ! -f "$lock" ]] || [[ ! -f "$pod_stamp" ]] || ! cmp -s "$lock" "$pod_stamp"; then
      info "Installing CocoaPods..."
      (cd "$xcode_dir" && pod install)
      mkdir -p "$(dirname "$pod_stamp")"
      cp "$lock" "$pod_stamp" 2>/dev/null || true
    else
      info "Pods up to date, skipping pod install"
    fi
  fi

  local ws="$xcode_dir/Unity-iPhone.xcworkspace"
  info "Building release .app for simulator..."
  local target_args
  if [[ -d "$ws" ]]; then
    target_args=(-workspace "$ws")
  else
    target_args=(-project "$xcode_dir/Unity-iPhone.xcodeproj")
  fi

  xcodebuild \
    "${target_args[@]}" \
    -scheme Unity-iPhone \
    -configuration ReleaseForRunning \
    -sdk iphonesimulator \
    -derivedDataPath "$derived" \
    -quiet \
    ONLY_ACTIVE_ARCH=YES \
    ARCHS="$UNITY_IOS_SIM_ARCH" \
    CODE_SIGN_IDENTITY="-" \
    CODE_SIGNING_ALLOWED=YES \
    build

  if [[ ! -d "$APP_PATH" ]]; then
    # Fallback: Unity's product name (and thus the .app filename) is set in
    # Player Settings, so it can drift from our default. Search the derived
    # data Products dir for any .app, prefer ReleaseForRunning-iphonesimulator/.
    local found
    found=$(find "$derived/Build/Products/ReleaseForRunning-iphonesimulator" \
                 -maxdepth 1 -name "*.app" -not -name "*.appex" 2>/dev/null | head -1)
    [[ -z "$found" ]] && found=$(find "$derived" -path "*/Build/Products/*" \
                                      -maxdepth 5 -name "*.app" \
                                      -not -name "*.appex" 2>/dev/null | head -1)
    [[ -n "$found" ]] || error ".app not found anywhere under $derived"
    APP_PATH="$found"
  fi
  mkdir -p "$(dirname "$stamp")"
  echo "$demo_hash" > "$stamp"
  info "App built: $APP_PATH"
}

build_unity_android() {
  write_unity_demo_env

  [[ -x "$UNITY_PATH" ]] || error "Unity Editor not found at $UNITY_PATH — set UNITY_PATH in .env"

  local sdk_hash demo_hash
  sdk_hash=$(unity_sdk_inputs_hash android)
  demo_hash=$(unity_demo_inputs_hash "$sdk_hash")

  local stamp="$DEMO_DIR/Build/.unity-build-android.stamp"
  if unity_build_is_cached "$stamp" "$APP_PATH" "$demo_hash"; then
    info "Unity SDK + demo source unchanged, skipping Android rebuild"
    info "App: $APP_PATH"
    return
  fi

  local log="$DEMO_DIR/Build/build-android.log"
  mkdir -p "$DEMO_DIR/Build/Android"

  info "Building APK from Unity (batchmode, log: $log)..."
  if ! "$UNITY_PATH" -batchmode -nographics -quit -buildTarget Android \
        -projectPath "$DEMO_DIR" -executeMethod BuildScript.BuildAndroidEmulator \
        -logFile "$log"; then
    unity_failure_hint "$log" >&2
    error "Unity batchmode build failed"
  fi

  [[ -f "$APP_PATH" ]] || error ".apk not found after build at $APP_PATH — see $log"
  mkdir -p "$(dirname "$stamp")"
  echo "$demo_hash" > "$stamp"
  info "App built: $APP_PATH"
}

build_android_native() {
  # Building from OneSignalSDK/ (not examples/demo/) so the demo's :app
  # transitively pulls in local SDK source via settings.gradle dependency
  # substitution. This is the whole point of --sdk=android for SDK dev:
  # changes under OneSignal-Android-SDK/OneSignalSDK/onesignal/ get exercised.
  # See OneSignalSDK/settings.gradle for the substitution rules.
  local sdk_dir="$ANDROID_DIR/OneSignalSDK"
  [[ -x "$sdk_dir/gradlew" ]] || error "gradlew not found or not executable at $sdk_dir/gradlew"

  # SDK_VERSION is required by settings.gradle; pull it from gradle.properties
  # (defaults to whatever the local repo is on, e.g. 5.9.2) so callers don't
  # have to keep it in sync.
  local sdk_version
  sdk_version=$(grep -E "^SDK_VERSION=" "$sdk_dir/gradle.properties" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]')
  [[ -n "$sdk_version" ]] || error "Could not read SDK_VERSION from $sdk_dir/gradle.properties"

  # Capitalize flavor + buildType to assemble the Gradle task name
  # (assemble<Flavor><BuildType>, e.g. assembleGmsDebug).
  local flavor_cap="$(tr '[:lower:]' '[:upper:]' <<< "${ANDROID_FLAVOR:0:1}")${ANDROID_FLAVOR:1}"
  local type_cap="$(tr '[:lower:]' '[:upper:]' <<< "${ANDROID_BUILD_TYPE:0:1}")${ANDROID_BUILD_TYPE:1}"
  local task="assemble${flavor_cap}${type_cap}"

  # Demo reads ONESIGNAL_APP_ID / ONESIGNAL_ANDROID_CHANNEL_ID from
  # `BuildConfig.*` (see examples/demo/app/build.gradle.kts:demoOverride). Pass
  # them as Gradle -P props so the CLI value wins over examples/demo/local.properties.
  local -a gradle_args=("-PSDK_VERSION=$sdk_version")
  if [[ -n "${ONESIGNAL_APP_ID:-}" ]]; then
    gradle_args+=("-PONESIGNAL_APP_ID=$ONESIGNAL_APP_ID")
  else
    warn "ONESIGNAL_APP_ID not set — demo will fall back to its built-in default"
  fi
  if [[ -n "${ANDROID_CHANNEL_ID:-}" ]]; then
    gradle_args+=("-PONESIGNAL_ANDROID_CHANNEL_ID=$ANDROID_CHANNEL_ID")
  fi

  info "Building :app:$task with local SDK source (SDK_VERSION=$sdk_version)..."
  (cd "$sdk_dir" && ./gradlew ":app:$task" "${gradle_args[@]}")

  [[ -f "$APP_PATH" ]] || error ".apk not found after build at $APP_PATH"
  info "App built: $APP_PATH"
}

# Hash every source/asset/config file that affects the compiled App.app for a
# native iOS demo build: demo sources (App/, the two extensions, project.yml,
# entitlements, the auto-written Secrets.plist), the regenerated .pbxproj, and
# the SDK framework source pulled in via projectReferences. Folds the SDK
# source into the demo hash so SDK edits cascade-invalidate the cached .app —
# same convention as dotnet_demo_inputs_hash / unity_demo_inputs_hash. Excludes
# test/mock targets (they only build under their own schemes, never "App") and
# xcodebuild-managed dirs.
ios_native_inputs_hash() {
  find "$DEMO_DIR" "$IOS_DIR/iOS_SDK/OneSignalSDK" \
       -type f \
       ! -path "*/build/*" \
       ! -path "*/DerivedData/*" \
       ! -path "*/xcuserdata/*" \
       ! -path "*/.git/*" \
       ! -path "*Tests/*" \
       ! -path "*Mocks/*" \
       \( -name "*.swift" -o -name "*.h" -o -name "*.m" -o -name "*.mm" \
          -o -name "*.c" -o -name "*.plist" -o -name "*.entitlements" \
          -o -name "*.yml" -o -name "*.pbxproj" -o -name "*.modulemap" \
          -o -name "*.json" -o -name "*.wav" -o -name "*.png" \
          -o -name "*.xcprivacy" -o -name "*.storyboard" -o -name "*.strings" \) \
       2>/dev/null \
       | sort \
       | xargs shasum 2>/dev/null \
       | shasum \
       | awk '{print $1}'
}

# Hash the inputs that affect xcodegen's pbxproj output: project.yml content
# plus the sorted file listing of everything in the demo dir that xcodegen
# could plausibly glob. File listings (not contents) because pbxproj
# references files by path — only adds/removes/renames change it. We scan
# the whole demo dir rather than parsing project.yml's `sources:` entries
# because XcodeGen accepts four equivalent forms (shorthand, inline list,
# list of strings, list of dicts) — any path-extracting parser is a
# future-edit footgun. Over-scanning is harmless: a stray edit (e.g. to a
# README) just triggers one extra ~1s xcodegen run, no false skips. Excludes
# build artifacts and the generated .xcodeproj itself (regenerating it
# would self-bust the hash).
ios_pbxproj_inputs_hash() {
  local yml="$DEMO_DIR/project.yml"
  [[ -f "$yml" ]] || return 0
  {
    shasum "$yml" 2>/dev/null
    find "$DEMO_DIR" \
         -type f \
         ! -path "*/build/*" \
         ! -path "*/DerivedData/*" \
         ! -path "*/xcuserdata/*" \
         ! -path "*/.git/*" \
         ! -path "*/$IOS_NATIVE_PROJECT/*" \
         2>/dev/null \
      | sort
  } | shasum | awk '{print $1}'
}

build_ios_native() {
  # Builds the native iOS demo directly so local SDK source changes (under
  # OneSignal-iOS-SDK/iOS_SDK/) get exercised end-to-end. The demo's
  # App.xcodeproj has a projectReferences entry pointing at the SDK's own
  # OneSignal.xcodeproj, so xcodebuild builds the local SDK frameworks
  # transitively — mirroring how build_android_native uses the local
  # OneSignalSDK module instead of a published artifact.

  # The iOS demo reads credentials from a bundled Secrets.plist (the iOS
  # equivalent of .env — see App/Services/SecretsConfig.swift). The file is
  # gitignored and lives next to App/Info.plist; project.yml's explicit
  # `buildPhase: resources` entry for App/Secrets.plist gets it copied into
  # the App bundle. Use `plutil` so API keys with XML-special chars
  # (&, <, ", etc.) round-trip safely without manual escaping.
  #
  # ALWAYS write the file (empty dict when env vars are unset) so xcodebuild's
  # Copy Bundle Resources phase doesn't fail on a missing optional resource —
  # SecretsConfig falls back to defaultAppId for any keys not present.
  #
  # Done BEFORE xcodegen (so the file reference is generated against a real
  # on-disk file) and BEFORE the hash check (so changing ONESIGNAL_APP_ID /
  # ONESIGNAL_API_KEY automatically busts the cache — plutil's output is
  # deterministic).
  local secrets="$DEMO_DIR/App/Secrets.plist"
  if [[ -n "${ONESIGNAL_APP_ID:-}" || -n "${ONESIGNAL_API_KEY:-}" ]]; then
    info "Writing Secrets.plist for demo app..."
  else
    warn "ONESIGNAL_APP_ID / ONESIGNAL_API_KEY not set — writing empty Secrets.plist; demo will fall back to SecretsConfig.defaultAppId"
  fi
  plutil -create xml1 "$secrets"
  [[ -n "${ONESIGNAL_APP_ID:-}" ]] && \
    plutil -insert ONESIGNAL_APP_ID -string "$ONESIGNAL_APP_ID" "$secrets"
  [[ -n "${ONESIGNAL_API_KEY:-}" ]] && \
    plutil -insert ONESIGNAL_API_KEY -string "$ONESIGNAL_API_KEY" "$secrets"

  # Only regenerate the .pbxproj when its inputs change. xcodegen 2.45.x is
  # NOT deterministic across no-op runs (each `xcodegen generate` produces a
  # slightly different .pbxproj even with identical inputs), so unconditional
  # regen leaves spurious unstaged changes in the iOS SDK repo on every
  # script invocation. Gate on a hash of (project.yml content + sorted file
  # listing of the source-globbed dirs) rather than mtime — mtime misses new
  # files added to glob-sourced dirs (`App/Foo.swift` without touching
  # project.yml leaves pbxproj newer than yml, gate skips, new file is
  # missing from the build). File listings rather than contents because
  # pbxproj references files by path; only adds/removes/renames affect it.
  local proj_path="$DEMO_DIR/$IOS_NATIVE_PROJECT"
  local pbxproj="$proj_path/project.pbxproj"
  local pbxproj_stamp="$DEMO_DIR/build/.ios-native-pbxproj.stamp"
  if [[ -f "$DEMO_DIR/project.yml" ]]; then
    if ! command -v xcodegen >/dev/null 2>&1; then
      warn "xcodegen not found; using existing $IOS_NATIVE_PROJECT (edits to project.yml will be ignored)"
    else
      local pbxproj_hash
      pbxproj_hash=$(ios_pbxproj_inputs_hash)
      if [[ ! -f "$pbxproj" ]] || [[ ! -f "$pbxproj_stamp" ]] \
         || [[ "$(cat "$pbxproj_stamp")" != "$pbxproj_hash" ]]; then
        info "Regenerating $IOS_NATIVE_PROJECT from project.yml (xcodegen)..."
        (cd "$DEMO_DIR" && xcodegen generate --quiet)
        mkdir -p "$(dirname "$pbxproj_stamp")"
        echo "$pbxproj_hash" > "$pbxproj_stamp"
      else
        info "$IOS_NATIVE_PROJECT up to date with project.yml + sources, skipping xcodegen"
      fi
    fi
  fi

  [[ -d "$proj_path" ]] || error "Xcode project not found at $proj_path — set IOS_NATIVE_PROJECT or IOS_DIR"
  local scheme="${IOS_NATIVE_PROJECT%.xcodeproj}"

  # Top-level skip: even an incremental xcodebuild costs ~30-60s on a no-op in
  # resource copy, framework embed, codesign, and validation. Skip entirely
  # when demo + SDK source + Secrets.plist + regenerated pbxproj all match a
  # previous build. Mirrors build_expo_ios's stamp-based skip. Stamp is
  # scoped by IOS_BUILD_DIR so sim and device builds don't share cache state
  # (matches build_dotnet_ios / build_unity_ios; without this, a sim→edit
  # SDK→device→sim sequence overwrites the stamp with the post-edit hash
  # while the pre-edit sim .app is still on disk, and the skip would serve
  # the stale binary).
  local build_stamp="$DEMO_DIR/build/.ios-native-build-${IOS_BUILD_DIR}.stamp"
  local build_hash
  build_hash=$(ios_native_inputs_hash)
  if [[ -d "$APP_PATH" ]] && [[ -f "$build_stamp" ]] && [[ "$(cat "$build_stamp")" == "$build_hash" ]]; then
    info "Demo + SDK source unchanged, skipping iOS native rebuild"
    info "App: $APP_PATH"
    return
  fi

  info "Building scheme '$scheme' (Release) for ${IOS_SDK}..."
  (cd "$DEMO_DIR" && xcodebuild \
    -project "$IOS_NATIVE_PROJECT" \
    -scheme "$scheme" \
    -configuration Release \
    -sdk "$IOS_SDK" \
    ${IOS_DESTINATION:+-destination} ${IOS_DESTINATION:+"$IOS_DESTINATION"} $IOS_XCODE_EXTRA_ARGS \
    -derivedDataPath build \
    -quiet \
    ONLY_ACTIVE_ARCH=YES \
    ENABLE_USER_SCRIPT_SANDBOXING=NO \
    COMPILER_INDEX_STORE_ENABLE=NO \
    SWIFT_INDEX_STORE_ENABLE=NO \
    $IOS_SIGNING_ARGS)

  [[ -d "$APP_PATH" ]] || error ".app not found after build at $APP_PATH"
  mkdir -p "$(dirname "$build_stamp")"
  echo "$build_hash" > "$build_stamp"
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
  elif [[ "$SDK_TYPE" == "capacitor" ]]; then
    if [[ "$PLATFORM" == "ios" ]]; then
      build_capacitor_ios
    else
      build_capacitor_android
    fi
  elif [[ "$SDK_TYPE" == "dotnet" ]]; then
    if [[ "$PLATFORM" == "ios" ]]; then
      build_dotnet_ios
    else
      build_dotnet_android
    fi
  elif [[ "$SDK_TYPE" == "expo" ]]; then
    if [[ "$PLATFORM" == "ios" ]]; then
      build_expo_ios
    else
      build_expo_android
    fi
  elif [[ "$SDK_TYPE" == "unity" ]]; then
    if [[ "$PLATFORM" == "ios" ]]; then
      build_unity_ios
    else
      build_unity_android
    fi
  elif [[ "$SDK_TYPE" == "android" ]]; then
    build_android_native
  elif [[ "$SDK_TYPE" == "ios" ]]; then
    build_ios_native
  fi
}
