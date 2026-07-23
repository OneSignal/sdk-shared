#!/usr/bin/env bash
# Check out the latest stable release point in each downstream SDK repo.
#   - rel-branch repos: newest stable rel/X.Y.Z branch (betas + non-semver excluded)
#   - tag-only repos (expo, ios): newest semver tag (detached HEAD)
# Repo paths honor the same *_DIR overrides as run-local.sh (loaded from .env),
# falling back to the config.sh defaults under $SDK_ROOT.
# Repos with uncommitted changes are skipped, never clobbered.
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

# var|default-subpath|kind  (kind: rel = latest rel/* branch, tag = latest semver tag)
# Defaults mirror run-local/config.sh; override any via *_DIR in .env.
REPOS=(
  "FLUTTER_DIR|OneSignal-Flutter-SDK|rel"
  "RN_DIR|react-native-onesignal|rel"
  "CORDOVA_DIR|OneSignal-Cordova-SDK|rel"
  "CAPACITOR_DIR|OneSignal-Capacitor-SDK|rel"
  "DOTNET_DIR|DotNet/OneSignal-DotNet-SDK|rel"
  "UNITY_DIR|OneSignal-Unity-SDK|rel"
  "ANDROID_DIR|OneSignal-Android-SDK|rel"
  "EXPO_DIR|onesignal-expo-plugin|tag"
  "IOS_DIR|OneSignal-iOS-SDK|tag"
)

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

for entry in "${REPOS[@]}"; do
  IFS='|' read -r var subpath kind <<< "$entry"
  p="${!var:-$SDK_ROOT/$subpath}"   # .env override wins, else default
  name="$(basename "$p")"

  if [[ ! -d "$p/.git" ]]; then
    echo -e "${RED}SKIP${NC}  $name (not a git repo: $p — set $var in .env)"; continue
  fi
  if [[ -n "$(git -C "$p" status --porcelain)" ]]; then
    echo -e "${YELLOW}SKIP${NC}  $name (uncommitted changes — leaving on $(git -C "$p" rev-parse --abbrev-ref HEAD))"; continue
  fi

  git -C "$p" fetch --prune --tags origin >/dev/null 2>&1

  if [[ "$kind" == "rel" ]]; then
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

  if git -C "$p" checkout "$target" >/dev/null 2>&1; then
    [[ "$kind" == "rel" ]] && git -C "$p" pull --ff-only >/dev/null 2>&1
    echo -e "${GREEN}OK${NC}    $name -> $target"
  else
    echo -e "${RED}FAIL${NC}  $name (could not checkout $target)"
  fi
done
