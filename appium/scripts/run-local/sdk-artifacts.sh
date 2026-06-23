#!/usr/bin/env bash

hash_files() {
  find "$@" \
       -type f 2>/dev/null \
       | sort \
       | xargs shasum 2>/dev/null \
       | shasum \
       | awk '{print $1}'
}

install_local_js_sdk_artifact() {
  local skip_label="$1"
  local build_label="$2"
  local sdk_dir="$3"
  local stamp="$4"
  local installed_dir="$5"
  local tarball="$6"
  local remove_glob="$7"
  local packed_glob="$8"
  local add_spec="$9"
  local src_hash="${10}"
  local post_install="${11:-}"

  if [[ -d "$installed_dir" ]] && [[ -f "$stamp" ]] && [[ "$(cat "$stamp")" == "$src_hash" ]]; then
    info "$skip_label source unchanged, skipping rebuild"
    return
  fi

  info "Building $build_label & packing tarball..."
  (cd "$sdk_dir" && vp run build)
  (cd "$sdk_dir" && rm -f $remove_glob && vp pm pack && mv $packed_glob "$(basename "$tarball")")

  if [[ ! -d "$installed_dir" ]]; then
    info "First install — running vp add to register tarball in lockfile..."
    (cd "$DEMO_DIR" && vp add "$add_spec")
  else
    info "Extracting tarball into demo's node_modules (respects package.json files)..."
    rm -rf "$installed_dir"/*
    rm -rf "$installed_dir"/.[!.]* 2>/dev/null || true
    tar -xzf "$tarball" -C "$installed_dir" --strip-components=1
  fi

  if [[ -n "$post_install" ]]; then
    "$post_install"
  fi

  echo "$src_hash" > "$stamp"
}

setup_rn_sdk() {
  local stamp="$RN_DIR/.rn-sdk-source.stamp"
  local installed_dir="$DEMO_DIR/node_modules/react-native-onesignal"
  local tarball="$RN_DIR/react-native-onesignal.tgz"
  local src_hash

  src_hash=$(hash_files "$RN_DIR/src" "$RN_DIR/ios" "$RN_DIR/android" \
                        "$RN_DIR/package.json" "$RN_DIR/tsconfig.json" \
                        "$RN_DIR"/*.podspec)

  install_local_js_sdk_artifact \
    "RN SDK" \
    "React Native SDK" \
    "$RN_DIR" \
    "$stamp" \
    "$installed_dir" \
    "$tarball" \
    "react-native-onesignal*.tgz" \
    "react-native-onesignal-*.tgz" \
    "file:../../react-native-onesignal.tgz" \
    "$src_hash"
}

setup_cordova_sdk() {
  local stamp="$CORDOVA_DIR/.cordova-sdk-source.stamp"
  local installed_dir="$DEMO_DIR/node_modules/onesignal-cordova-plugin"
  local tarball="$CORDOVA_DIR/onesignal-cordova-plugin.tgz"

  CORDOVA_SDK_SRC_HASH=$(hash_files "$CORDOVA_DIR/src" "$CORDOVA_DIR/www" \
                                    "$CORDOVA_DIR/package.json" "$CORDOVA_DIR/plugin.xml" \
                                    "$CORDOVA_DIR/OneSignalCordovaDependencies.podspec" \
                                    "$CORDOVA_DIR/build-extras-onesignal.gradle")

  install_local_js_sdk_artifact \
    "Cordova SDK" \
    "Cordova plugin" \
    "$CORDOVA_DIR" \
    "$stamp" \
    "$installed_dir" \
    "$tarball" \
    "onesignal-cordova-plugin*.tgz" \
    "onesignal-cordova-plugin-*.tgz" \
    "file:../../onesignal-cordova-plugin.tgz" \
    "$CORDOVA_SDK_SRC_HASH"
}

setup_capacitor_sdk() {
  local stamp="$CAPACITOR_DIR/.capacitor-sdk-source.stamp"
  local installed_dir="$DEMO_DIR/node_modules/@onesignal/capacitor-plugin"
  local tarball="$CAPACITOR_DIR/onesignal-capacitor-plugin.tgz"

  # Exported (no `local`) so build_capacitor_* can fold it into the cap-sync
  # input hash and invalidate cached syncs whenever plugin source changes.
  CAPACITOR_SDK_SRC_HASH=$(hash_files "$CAPACITOR_DIR/src" "$CAPACITOR_DIR/ios" "$CAPACITOR_DIR/android" \
                                      "$CAPACITOR_DIR/package.json" "$CAPACITOR_DIR/Package.swift" \
                                      "$CAPACITOR_DIR/OneSignalCapacitorPlugin.podspec")

  install_local_js_sdk_artifact \
    "Capacitor SDK" \
    "Capacitor plugin" \
    "$CAPACITOR_DIR" \
    "$stamp" \
    "$installed_dir" \
    "$tarball" \
    "onesignal-capacitor-plugin*.tgz" \
    "onesignal-capacitor-plugin-*.tgz" \
    "file:../../onesignal-capacitor-plugin.tgz" \
    "$CAPACITOR_SDK_SRC_HASH"
}

remove_expo_glob_workaround() {
  # Mirror the workaround from onesignal-expo-plugin/examples/setup.sh.
  rm -rf "$DEMO_DIR/node_modules/glob"
}

setup_expo_plugin() {
  local stamp="$EXPO_DIR/.expo-plugin-source.stamp"
  local installed_dir="$DEMO_DIR/node_modules/onesignal-expo-plugin"
  local tarball="$EXPO_DIR/onesignal-expo-plugin.tgz"

  # Exported (no `local`) so build_expo_* can fold it into the demo hash and
  # invalidate the cached .app whenever the plugin source changes.
  EXPO_PLUGIN_SRC_HASH=$(hash_files "$EXPO_DIR/src" "$EXPO_DIR/serviceExtensionFiles" \
                                    "$EXPO_DIR/package.json" "$EXPO_DIR/tsconfig.json")

  install_local_js_sdk_artifact \
    "Expo plugin" \
    "Expo plugin" \
    "$EXPO_DIR" \
    "$stamp" \
    "$installed_dir" \
    "$tarball" \
    "onesignal-expo-plugin*.tgz" \
    "onesignal-expo-plugin-*.tgz" \
    "file:../../onesignal-expo-plugin.tgz" \
    "$EXPO_PLUGIN_SRC_HASH" \
    remove_expo_glob_workaround
}
