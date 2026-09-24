#!/usr/bin/env bash
# Check out the latest stable release point for the requested downstream SDKs.
#   - rel-branch repos: newest stable rel/X.Y.Z branch (betas + non-semver excluded)
#   - tag-only repos (expo, ios): newest semver tag (detached HEAD)
# With --main, every repo instead checks out main and fast-forwards to origin/main.
# Pass SDK names as arguments; omitting them checks out every SDK.
# Repo paths honor the same *_DIR overrides as run-local.sh (loaded from .env),
# falling back to the config.sh defaults under $SDK_ROOT.
# Uncommitted changes, including untracked files, are stashed before checkout.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APPIUM_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SDK_ROOT="$(cd "$APPIUM_DIR/../.." && pwd)"

# Load .env so *_DIR overrides here match run-local.sh's resolution.
if [[ -f "$SCRIPT_DIR/.env" ]]; then
  set -a
  source "$SCRIPT_DIR/.env"
  set +a
fi

# sdk|var|default-subpath|kind  (kind: rel = latest rel/* branch, tag = latest semver tag)
# Defaults mirror run-local/config.sh; override any via *_DIR in .env.
REPOS=(
  "flutter|FLUTTER_DIR|OneSignal-Flutter-SDK|rel"
  "react-native|RN_DIR|react-native-onesignal|rel"
  "cordova|CORDOVA_DIR|OneSignal-Cordova-SDK|rel"
  "capacitor|CAPACITOR_DIR|OneSignal-Capacitor-SDK|rel"
  "dotnet|DOTNET_DIR|DotNet/OneSignal-DotNet-SDK|rel"
  "unity|UNITY_DIR|OneSignal-Unity-SDK|rel"
  "android|ANDROID_DIR|OneSignal-Android-SDK|rel"
  "expo|EXPO_DIR|onesignal-expo-plugin|tag"
  "ios|IOS_DIR|OneSignal-iOS-SDK|tag"
)

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

MODE=release
if [[ "${1:-}" == "--main" ]]; then
  MODE=main
  shift
fi

for selected in "$@"; do
  case "$selected" in
    flutter|react-native|cordova|capacitor|dotnet|unity|android|expo|ios) ;;
    *)
      echo -e "${RED}FAIL${NC}  Unknown SDK: $selected"
      exit 2
      ;;
  esac
done

for entry in "${REPOS[@]}"; do
  IFS='|' read -r sdk var subpath kind <<< "$entry"
  if (( $# > 0 )); then
    selected_sdk=false
    for selected in "$@"; do
      if [[ "$sdk" == "$selected" ]]; then
        selected_sdk=true
        break
      fi
    done
    [[ "$selected_sdk" == true ]] || continue
  fi

  p="${!var:-$SDK_ROOT/$subpath}"   # .env override wins, else default
  name="$(basename "$p")"

  if [[ ! -d "$p/.git" ]]; then
    echo -e "${RED}SKIP${NC}  $name (not a git repo: $p — set $var in .env)"; continue
  fi
  git -C "$p" fetch --prune --tags origin >/dev/null 2>&1

  if [[ "$MODE" == "main" ]]; then
    target=main
    if ! git -C "$p" show-ref --verify --quiet refs/remotes/origin/main; then
      echo -e "${RED}SKIP${NC}  $name (no origin/main branch found)"; continue
    fi
  elif [[ "$kind" == "rel" ]]; then
    target=$(git -C "$p" for-each-ref --format='%(refname:short)' 'refs/remotes/origin/rel/*' \
      | sed 's|^origin/||' | grep -E '^rel/[0-9]+\.[0-9]+(\.[0-9]+)?$' | sort -V | tail -1)
    if [[ -z "$target" ]]; then
      echo -e "${RED}SKIP${NC}  $name (no stable rel/* branch found)"; continue
    fi
  else
    target=$(git -C "$p" tag --sort=-v:refname | grep -E '^v?[0-9]+\.[0-9]+(\.[0-9]+)?$' | head -1)
    if [[ -z "$target" ]]; then
      echo -e "${RED}SKIP${NC}  $name (no semver tag found)"; continue
    fi
  fi

  if [[ -n "$(git -C "$p" status --porcelain)" ]]; then
    current_ref="$(git -C "$p" symbolic-ref --short -q HEAD || git -C "$p" rev-parse --short HEAD)"
    if git -C "$p" stash push --include-untracked \
      -m "appium --$MODE: before checkout from $current_ref" >/dev/null; then
      stash_ref="$(git -C "$p" stash list -1 --format='%gd')"
      echo -e "${YELLOW}STASH${NC} $name changes saved as $stash_ref"
    else
      echo -e "${RED}SKIP${NC}  $name (could not stash uncommitted changes)"; continue
    fi
  fi

  if git -C "$p" checkout "$target" >/dev/null 2>&1; then
    if [[ "$MODE" == "main" ]]; then
      if git -C "$p" merge --ff-only origin/main >/dev/null 2>&1; then
        echo -e "${GREEN}OK${NC}    $name -> main ($(git -C "$p" rev-parse --short HEAD))"
      else
        echo -e "${YELLOW}WARN${NC}  $name on main but could not fast-forward to origin/main (local main has diverged)"
      fi
      continue
    fi
    [[ "$kind" == "rel" ]] && git -C "$p" pull --ff-only >/dev/null 2>&1
    echo -e "${GREEN}OK${NC}    $name -> $target"
  else
    echo -e "${RED}FAIL${NC}  $name (could not checkout $target)"
  fi
done
