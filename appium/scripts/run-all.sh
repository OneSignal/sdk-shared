#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── Colors / logging ─────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

# ── Args (forwarded as-is to run-local.sh) ────────────────────────────────────
ALL_SDKS=(android cordova capacitor dotnet expo flutter react-native unity)

EXTRA_ARGS=()
PLATFORM_FILTER=""
SDKS_FILTER=""
BAIL=0
for arg in "$@"; do
  case "$arg" in
    --skip-build|--skip-device|--skip-reset|--skip)
      EXTRA_ARGS+=("$arg") ;;
    --spec=*)
      EXTRA_ARGS+=("$arg") ;;
    --platform=ios|--platform=android)
      PLATFORM_FILTER="${arg#--platform=}" ;;
    --platform=*)
      error "Invalid --platform value: ${arg#--platform=} (expected: ios or android)"
      exit 2 ;;
    --sdks=*|--sdk=*)
      SDKS_FILTER="${arg#*=}" ;;
    --bail)
      BAIL=1 ;;
    --help|-h)
      cat <<USAGE
Usage: $0 [OPTIONS]

Runs the Appium E2E suite across every SDK/platform combo by delegating
to run-local.sh. Combos: cordova, capacitor, react-native, flutter, dotnet,
expo, unity on ios + android, plus android (native) on android only.

Options:
  --platform=ios|android   Only run combos for the given platform (default: both)
  --sdks=LIST              Comma-separated SDKs to run (default: all)
                           Valid: cordova, capacitor, react-native, flutter,
                                  dotnet, expo, unity, android
                           Note: 'android' (native) only runs on --platform=android.
  --bail                   Stop after the first failing combo

Options forwarded to run-local.sh:
  --skip-build     Skip per-app build (reuse existing artifact)
  --skip-device    Skip simulator/emulator launch
  --skip-reset     Keep existing app data
  --skip           Shortcut for --skip-build --skip-device --skip-reset
  --spec=GLOB      Spec glob to run (default: full suite, grouped into one session)
  -h, --help       Show this help

Exits non-zero if any combo fails. Prints a summary at the end.
USAGE
      exit 0
      ;;
    *) warn "Unknown option: $arg (ignored)" ;;
  esac
done

if [[ -n "$PLATFORM_FILTER" ]]; then
  PLATFORMS=("$PLATFORM_FILTER")
else
  PLATFORMS=(ios android)
fi

if [[ -n "$SDKS_FILTER" ]]; then
  IFS=',' read -r -a SDKS <<< "$SDKS_FILTER"
  for sdk in "${SDKS[@]}"; do
    valid=0
    for known in "${ALL_SDKS[@]}"; do
      if [[ "$sdk" == "$known" ]]; then valid=1; break; fi
    done
    if (( ! valid )); then
      error "Invalid --sdks value: '$sdk' (valid: ${ALL_SDKS[*]})"
      exit 2
    fi
  done
else
  SDKS=("${ALL_SDKS[@]}")
fi

declare -a RESULTS
FAILED=0
BAILED=0

for platform in "${PLATFORMS[@]}"; do
  for sdk in "${SDKS[@]}"; do
    # Native Android demo only exists for Android; silently skip the iOS
    # combo when iterating both platforms so the matrix stays clean. When
    # the user explicitly requested `--sdks=android --platform=ios`, fall
    # through and let run-local.sh emit the real error.
    if [[ "$sdk" == "android" && "$platform" == "ios" && -z "$PLATFORM_FILTER" ]]; then
      continue
    fi
    label="${sdk} / ${platform}"
    echo ""
    echo -e "${BOLD}━━━ Running: ${label} ━━━${NC}"
    # `${arr[@]+"${arr[@]}"}` expands the array only when it has elements;
    # under `set -u`, a bare `"${EXTRA_ARGS[@]}"` errors out on an empty array.
    if "$SCRIPT_DIR/run-local.sh" --platform="$platform" --sdk="$sdk" ${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}; then
      RESULTS+=("PASS  ${label}")
    else
      RESULTS+=("FAIL  ${label}")
      FAILED=$((FAILED + 1))
      if (( BAIL )); then
        BAILED=1
        warn "Bailing out after first failure (--bail)"
        break 2
      fi
    fi
  done
done

echo ""
echo -e "${BOLD}━━━ Summary ━━━${NC}"
for line in "${RESULTS[@]}"; do
  if [[ "$line" == PASS* ]]; then
    echo -e "  ${GREEN}${line}${NC}"
  else
    echo -e "  ${RED}${line}${NC}"
  fi
done

if (( FAILED > 0 )); then
  echo ""
  if (( BAILED )); then
    error "${FAILED} combo(s) failed (bailed out after first failure)"
  else
    error "${FAILED} combo(s) failed"
  fi
  exit 1
fi

echo ""
info "All combos passed"
