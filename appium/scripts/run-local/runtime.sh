#!/usr/bin/env bash

start_ios_simulator() {
  if [[ -n "$UDID" ]]; then
    if xcrun simctl list devices booted 2>/dev/null | grep -q "$UDID"; then
      info "Simulator already running ($UDID)"
      return
    fi

    info "Booting simulator '${IOS_SIMULATOR}' ($UDID)..."
    xcrun simctl boot "$UDID" 2>/dev/null || true
    open -a Simulator
    info "Waiting for simulator..."
    xcrun simctl bootstatus "$UDID" -b >/dev/null
    info "Simulator ready"
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

  # Requested device/runtime isn't installed on this machine (e.g. defaults
  # assume iOS 26.2 but only 26.5 is installed). Fall back to the booted
  # simulator if there is one, else the newest installed iOS runtime, and
  # align DEVICE/OS_VERSION so the Appium session targets what actually runs.
  if [[ -z "$udid" ]]; then
    warn "Simulator '$IOS_SIMULATOR' ($IOS_RUNTIME) not found on this machine."
    local fallback
    fallback=$(xcrun simctl list devices -j \
      | python3 -c "
import json, sys
data = json.load(sys.stdin)
for runtime, devices in data['devices'].items():
    if '.iOS-' not in runtime:
        continue
    for d in devices:
        if d['state'] == 'Booted':
            rt = runtime.rsplit('.', 1)[-1]
            print(d['udid'] + '|' + d['name'] + '|' + rt + '|' + rt.replace('iOS-', '').replace('-', '.'))
            sys.exit(0)
" 2>/dev/null || true)
    if [[ -z "$fallback" ]]; then
      fallback=$(xcrun simctl list devices available -j \
        | python3 -c "
import json, sys
data = json.load(sys.stdin)
runtimes = []
for runtime, devices in data['devices'].items():
    rt = runtime.rsplit('.', 1)[-1]
    if not rt.startswith('iOS-'):
        continue
    try:
        ver = tuple(int(p) for p in rt.replace('iOS-', '').split('-'))
    except ValueError:
        continue
    avail = [d for d in devices if d.get('isAvailable')]
    if avail:
        runtimes.append((ver, rt, avail))
for ver, rt, avail in sorted(runtimes, reverse=True):
    exact = [d for d in avail if d['name'] == '$IOS_SIMULATOR']
    iphones = sorted((d for d in avail if d['name'].startswith('iPhone')), key=lambda d: d['name'])
    pick = exact[0] if exact else (iphones[-1] if iphones else avail[0])
    print(pick['udid'] + '|' + pick['name'] + '|' + rt + '|' + '.'.join(str(p) for p in ver))
    sys.exit(0)
" 2>/dev/null || true)
    fi
    if [[ -z "$fallback" ]]; then
      error "No usable iOS simulator found. Run: xcrun simctl list devices available, then set DEVICE / OS_VERSION / IOS_RUNTIME in $SCRIPT_DIR/.env"
    fi
    udid="${fallback%%|*}"
    IOS_SIMULATOR="$(cut -d'|' -f2 <<<"$fallback")"
    IOS_RUNTIME="$(cut -d'|' -f3 <<<"$fallback")"
    OS_VERSION="$(cut -d'|' -f4 <<<"$fallback")"
    DEVICE="$IOS_SIMULATOR"
    info "Falling back to '$IOS_SIMULATOR' (iOS $OS_VERSION, $udid). Set DEVICE / OS_VERSION / IOS_RUNTIME in $SCRIPT_DIR/.env to pin a different one."
  fi

  if xcrun simctl list devices booted 2>/dev/null | grep -q "Booted"; then
    info "Simulator already running"
    return
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
  if adb devices 2>/dev/null | grep -q "emulator-.*device$"; then
    info "Emulator already running"
    return
  fi

  # If a previous run left a wedged offline emulator, kill it so we can relaunch
  # cleanly. Reconnecting an offline emulator almost never recovers it.
  if adb devices 2>/dev/null | grep -q "emulator-.*offline"; then
    warn "Killing stale offline emulator..."
    adb -s emulator-5554 emu kill >/dev/null 2>&1 || true
    pkill -9 -f "qemu-system-.*-avd ${AVD_NAME}" 2>/dev/null || true
    sleep 2
  fi

  local emulator_log="/tmp/emulator-${AVD_NAME}.log"
  info "Starting emulator '$AVD_NAME' (logs: $emulator_log)..."
  # Detach (`set -m` + `disown`) so Ctrl-C on the script doesn't SIGINT the
  # emulator, and so subsequent `--skip-device` runs can reuse the booted AVD.
  set -m
  emulator -avd "$AVD_NAME" -no-audio -no-boot-anim \
    </dev/null >"$emulator_log" 2>&1 &
  disown %% 2>/dev/null || true
  set +m

  info "Waiting for emulator to boot..."
  local boot="" elapsed=0
  while [[ "$boot" != "1" ]]; do
    boot=$(adb -s emulator-5554 shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)
    sleep 2
    elapsed=$((elapsed + 2))
    if [[ $elapsed -ge 240 ]]; then
      error "Emulator failed to boot after 240s. The default_boot snapshot may be corrupt; try:"
      error "  rm -rf ~/.android/avd/${AVD_NAME}.avd/snapshots/default_boot"
      return 1
    fi
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

# Clear stale iOS automation state from prior runs.
cleanup_ios_automation() {
  [[ "$PLATFORM" == "ios" ]] || return 0
  local pids
  for port in "$APPIUM_PORT" "${WDA_LOCAL_PORT:-8100}"; do
    pids=$(lsof -ti tcp:"$port" 2>/dev/null || true)
    [[ -n "$pids" ]] && kill -9 $pids 2>/dev/null || true
  done
  pkill -f 'appium-webdriveragent/WebDriverAgent.xcodeproj' 2>/dev/null || true
  pkill -f 'WebDriverAgentRunner-Runner.app/WebDriverAgentRunner-Runner' 2>/dev/null || true

  killall cfprefsd >/dev/null 2>&1 || true
  defaults write com.apple.Accessibility AccessibilityEnabled -bool true >/dev/null 2>&1 || {
    killall cfprefsd >/dev/null 2>&1 || true
    sleep 1
    defaults write com.apple.Accessibility AccessibilityEnabled -bool true >/dev/null 2>&1 \
      || warn "Could not pre-enable macOS Accessibility; Appium may fail to create an iOS session"
  }
}

# Pre-download a Chromedriver binary that matches the device's WebView so
# Appium's in-test autodownload doesn't stall the IAM tests. No-op on iOS,
# and no-op when a matching binary is already cached.
install_chromedriver_if_needed() {
  [[ "$PLATFORM" == "android" ]] || return 0
  local script="$SCRIPT_DIR/install-chromedriver.sh"
  [[ -f "$script" ]] || return 0
  if ! bash "$script"; then
    warn "Chromedriver pre-install failed; Appium will fall back to in-test autodownload (may be slow)."
  fi
}

start_appium() {
  cleanup_ios_automation

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

# Clear stale UiAutomator2 state between Android combos without rebooting the emulator.
cleanup_android_automation() {
  [[ "$PLATFORM" == "android" ]] || return 0
  adb shell cmd statusbar collapse >/dev/null 2>&1 || true
  adb shell input keyevent KEYCODE_BACK >/dev/null 2>&1 || true
  adb shell input keyevent KEYCODE_HOME >/dev/null 2>&1 || true
  adb shell am force-stop io.appium.uiautomator2.server >/dev/null 2>&1 || true
  adb shell am force-stop io.appium.uiautomator2.server.test >/dev/null 2>&1 || true
}

reset_app() {
  if [[ "$SKIP_RESET" == true ]]; then
    info "Skipping app reset (--skip-reset)"
    if [[ "$PLATFORM" == "ios" ]]; then
      warn "iOS notification-permission state persists with --skip-reset; the test that waits for the permission alert will fail if it was already decided. Re-run without --skip/--skip-reset to reset."
    fi
    return
  fi

  if [[ "$PLATFORM" == "ios" ]]; then
    local bundle="${BUNDLE_ID:-}"
    if [[ -z "$bundle" ]]; then
      info "No BUNDLE_ID set — skipping reset"
      return
    fi
    if [[ "$IOS_REAL_DEVICE" == true ]]; then
      info "Uninstalling $bundle from device $UDID..."
      xcrun devicectl device uninstall app --device "$UDID" "$bundle" 2>/dev/null || true
    else
      local sim_target="${UDID:-booted}"
      # Uninstall unconditionally: a previously-decided notification permission
      # survives reinstalls and makes the permission-alert test fail, and
      # `simctl privacy` cannot reset it (notifications is SpringBoard state,
      # not a TCC service — it's absent from `simctl privacy`'s service list).
      # Uninstalling the app is the only reliable way to get the prompt back.
      info "Uninstalling $bundle (also resets notification-permission state)..."
      xcrun simctl uninstall "$sim_target" "$bundle" 2>/dev/null || true
    fi
  else
    local package="${BUNDLE_ID:-}"
    if [[ -z "$package" ]]; then
      info "No BUNDLE_ID set — skipping reset"
      return
    fi
    adb shell bmgr wipe "$package" >/dev/null 2>&1 || true
    if adb shell pm list packages 2>/dev/null | grep -q "$package"; then
      info "Clearing and uninstalling $package..."
      adb shell pm clear "$package" >/dev/null 2>&1 || true
      adb uninstall "$package" 2>/dev/null || true
    else
      info "App not installed — nothing to reset"
    fi
  fi
}

validate_existing_app() {
  [[ "$SKIP_BUILD" == true && "$PLATFORM" == "android" && -f "$APP_PATH" ]] || return 0

  if unzip -p "$APP_PATH" assets/capacitor.config.json 2>/dev/null | grep -q '"server"[[:space:]]*:'; then
    error "Existing APK uses Capacitor live reload (server.url). Re-run without --skip-build to build a bundled APK."
  fi
}

prepare_runtime() {
  validate_existing_app
  start_device
  install_chromedriver_if_needed
  start_appium
  cleanup_android_automation
  reset_app
}
