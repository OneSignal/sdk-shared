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
EXTRA_ARGS=()
for arg in "$@"; do
  case "$arg" in
    --skip-build|--skip-device|--skip-reset|--skip)
      EXTRA_ARGS+=("$arg") ;;
    --spec=*)
      EXTRA_ARGS+=("$arg") ;;
    --help|-h)
      cat <<USAGE
Usage: $0 [OPTIONS]

Runs the Appium E2E suite across every SDK/platform combo by delegating
to run-local.sh. Combos: cordova, react-native, flutter on ios + android.

Options forwarded to run-local.sh:
  --skip-build     Skip per-app build (reuse existing artifact)
  --skip-device    Skip simulator/emulator launch
  --skip-reset     Keep existing app data
  --skip           Shortcut for --skip-build --skip-device --skip-reset
  --spec=GLOB      Spec glob to run (default: full suite)
  -h, --help       Show this help

Exits non-zero if any combo fails. Prints a summary at the end.
USAGE
      exit 0
      ;;
    *) warn "Unknown option: $arg (ignored)" ;;
  esac
done

PLATFORMS=(ios android)
SDKS=(cordova react-native flutter)

declare -a RESULTS
FAILED=0

for platform in "${PLATFORMS[@]}"; do
  for sdk in "${SDKS[@]}"; do
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
  error "${FAILED} combo(s) failed"
  exit 1
fi

echo ""
info "All combos passed"
