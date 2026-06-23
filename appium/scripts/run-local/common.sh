#!/usr/bin/env bash

# ── Colors / logging ─────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { [[ "${QUIET:-false}" == true ]] || echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── Prompt helpers ───────────────────────────────────────────────────────────
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
