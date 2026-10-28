#!/usr/bin/env bash

# Prints "<VAR> <path under $SDK_ROOT>" for an SDK's repo.
sdk_dir_spec() {
  case "$1" in
    flutter)      echo "FLUTTER_DIR OneSignal-Flutter-SDK" ;;
    react-native) echo "RN_DIR react-native-onesignal" ;;
    cordova)      echo "CORDOVA_DIR OneSignal-Cordova-SDK" ;;
    capacitor)    echo "CAPACITOR_DIR OneSignal-Capacitor-SDK" ;;
    expo)         echo "EXPO_DIR onesignal-expo-plugin" ;;
    dotnet)       echo "DOTNET_DIR DotNet/OneSignal-DotNet-SDK" ;;
    unity)        echo "UNITY_DIR OneSignal-Unity-SDK" ;;
    android)      echo "ANDROID_DIR OneSignal-Android-SDK" ;;
    ios)          echo "IOS_DIR OneSignal-iOS-SDK" ;;
    *) return 1 ;;
  esac
}

# Prints the top level of the git checkout containing $PWD when it is a clone
# or worktree of the named repo.
cwd_repo_dir() {
  local repo="$1" top url name
  top=$(git rev-parse --show-toplevel 2>/dev/null) || return 1
  if url=$(git -C "$top" remote get-url origin 2>/dev/null); then
    name=$(basename "$url" .git)
  else
    name=$(basename "$(dirname "$(git -C "$top" rev-parse --path-format=absolute --git-common-dir)")")
  fi
  [[ "$(echo "$name" | tr '[:upper:]' '[:lower:]')" == "$(echo "$repo" | tr '[:upper:]' '[:lower:]')" ]] || return 1
  echo "$top"
}

# Asks which worktree of the repo at $2 to use when it has more than one and
# stdin is a terminal, storing the answer in $1. Enter keeps $2.
prompt_worktree() {
  local var="$1" default_dir="$2" line path branch i choice
  local -a paths=() labels=()
  [[ -t 0 ]] || return 1
  while IFS= read -r line; do
    case "$line" in
      "worktree "*) path="${line#worktree }"; branch="(detached)" ;;
      "branch "*) branch="${line#branch refs/heads/}" ;;
      "")
        if [[ -n "${path:-}" && -d "$path" ]]; then
          paths+=("$path"); labels+=("$branch  $path")
        fi
        path="" ;;
    esac
  done < <(git -C "$default_dir" worktree list --porcelain 2>/dev/null; echo)
  (( ${#paths[@]} > 1 )) || return 1

  echo "" >&2
  echo "Multiple checkouts of $(basename "$default_dir") found. Which one to test?" >&2
  for i in "${!labels[@]}"; do
    echo "  $((i + 1))) ${labels[$i]}" >&2
  done
  while true; do
    read -rp "> [1] " choice
    choice="${choice:-1}"
    if [[ "$choice" =~ ^[0-9]+$ ]] && (( choice >= 1 && choice <= ${#paths[@]} )); then
      printf -v "$var" '%s' "${paths[$((choice - 1))]}"
      return 0
    fi
    echo "  Invalid choice. Enter a number 1-${#paths[@]}." >&2
  done
}

# Sets the SDK's *_DIR var to, in order: its existing value, the current
# checkout when it is that SDK's repo, a worktree picked at the prompt, or
# the default under $SDK_ROOT. SDK_DIR_NO_PROMPT=1 skips the prompt.
# Exported so child scripts reuse the choice.
resolve_sdk_dir() {
  local spec var subpath detected
  spec=$(sdk_dir_spec "$1") || return 1
  var="${spec%% *}"
  subpath="${spec#* }"
  if [[ -z "${!var:-}" ]]; then
    if detected=$(cwd_repo_dir "$(basename "$subpath")"); then
      printf -v "$var" '%s' "$detected"
    elif [[ -n "${SDK_DIR_NO_PROMPT:-}" ]] || ! prompt_worktree "$var" "$SDK_ROOT/$subpath"; then
      printf -v "$var" '%s' "$SDK_ROOT/$subpath"
    fi
  fi
  export "${var?}"
}
