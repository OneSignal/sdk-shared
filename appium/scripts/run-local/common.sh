#!/usr/bin/env bash

# ── Colors / logging ─────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { [[ "${QUIET:-false}" == true ]] || echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── Demo file backups ────────────────────────────────────────────────────────
# Files the runner writes into demo repos (.env, Secrets.plist) are backed up
# here and put back once the last run using them exits. The store lives on
# disk rather than in a temp dir so a killed run's originals are recovered by
# the next run. Runs can be concurrent (distinct ports), so each entry tracks
# owner PIDs and every mutation happens under a mkdir lock.
DEMO_BACKUP_DIR="$APPIUM_DIR/.demo-backups"

pid_alive() { kill -0 "$1" 2>/dev/null; }

acquire_demo_backup_lock() {
  local lock="$DEMO_BACKUP_DIR/.lock" holder tries=0
  mkdir -p "$DEMO_BACKUP_DIR"
  until mkdir "$lock" 2>/dev/null; do
    holder=$(cat "$lock/pid" 2>/dev/null || true)
    if [[ -n "$holder" ]] && { [[ "$holder" == "$$" ]] || ! pid_alive "$holder"; }; then
      rm -rf "$lock"
      continue
    fi
    (( ++tries > 300 )) && error "Timed out waiting for $lock (delete it if no other run-local.sh is running)"
    sleep 0.1
  done
  echo "$$" > "$lock/pid"
}

release_demo_backup_lock() { rm -rf "$DEMO_BACKUP_DIR/.lock"; }

# Call before overwriting any file inside a demo repo.
stage_demo_file() {
  local file="$1" entry
  entry="$DEMO_BACKUP_DIR/$(printf '%s' "$file" | shasum | awk '{print $1}')"
  acquire_demo_backup_lock
  if [[ ! -f "$entry/path" ]]; then
    rm -rf "$entry"
    mkdir -p "$entry/owners"
    if [[ -e "$file" ]]; then
      cp -p "$file" "$entry/original"
    fi
    # Written last: an entry without `path` is a half-staged leftover whose
    # file was never overwritten, so restore just discards it.
    printf '%s\n' "$file" > "$entry/path"
  fi
  : > "$entry/owners/$$"
  release_demo_backup_lock
}

# Drops this run's claims (and claims held by dead runs), then restores every
# staged file no live run still uses. Files that didn't exist before staging
# are deleted.
restore_demo_files() {
  [[ -d "$DEMO_BACKUP_DIR" ]] || return 0
  acquire_demo_backup_lock
  local entry owner owner_pid file
  for entry in "$DEMO_BACKUP_DIR"/*/; do
    entry="${entry%/}"
    [[ -d "$entry" ]] || continue
    if [[ ! -f "$entry/path" ]]; then
      rm -rf "$entry"
      continue
    fi
    for owner in "$entry"/owners/*; do
      [[ -e "$owner" ]] || continue
      owner_pid="${owner##*/}"
      if [[ "$owner_pid" == "$$" ]] || ! pid_alive "$owner_pid"; then
        rm -f "$owner"
      fi
    done
    [[ -z "$(ls -A "$entry/owners" 2>/dev/null)" ]] || continue

    file=$(<"$entry/path")
    if [[ -e "$entry/original" ]]; then
      if ! mv -f "$entry/original" "$file" 2>/dev/null; then
        warn "Could not restore $file (backup kept at $entry/original)"
        continue
      fi
    else
      rm -f "$file"
    fi
    rm -rf "$entry"
    info "Restored $file"
  done
  release_demo_backup_lock
  rmdir "$DEMO_BACKUP_DIR" 2>/dev/null || true
}

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
