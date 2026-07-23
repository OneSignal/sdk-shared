#!/usr/bin/env bash
# One-time local setup for the Appium E2E runner. Idempotent — safe to re-run.
# Installs everything run-local.sh's preflight checks for:
#   1. .env            (copied from .env.example if missing)
#   2. appium          (global npm install)
#   3. appium drivers  (xcuitest for iOS, uiautomator2 for Android)
#   4. Vite+           (provides the vpx command; installs if vp/vpx absent)
#   5. node_modules    (bun install / vp install in the appium dir)
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APPIUM_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'
info() { echo -e "${GREEN}[INFO]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*"; }
ok()   { echo -e "${GREEN}[OK]${NC} $*"; }

FAILED=0
NEEDS_ENV=0

echo -e "${BOLD}━━━ Appium E2E bootstrap ━━━${NC}"

# ── 0. Prerequisites ──────────────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  err "node/npm not found. Install Node.js first (https://nodejs.org), then re-run."
  exit 1
fi
ok "node $(node -v) / npm $(npm -v)"

# ── 1. .env ───────────────────────────────────────────────────────────────────
if [[ -f "$SCRIPT_DIR/.env" ]]; then
  ok ".env present"
elif [[ -f "$SCRIPT_DIR/.env.example" ]]; then
  cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/.env"
  warn "Created .env from .env.example — set ONESIGNAL_APP_ID / ONESIGNAL_API_KEY before running tests."
  NEEDS_ENV=1
else
  warn ".env and .env.example both missing — create $SCRIPT_DIR/.env manually."
fi

# ── 2. appium ─────────────────────────────────────────────────────────────────
if command -v appium >/dev/null 2>&1; then
  ok "appium $(appium -v 2>/dev/null) already installed"
else
  info "Installing appium globally (npm i -g appium)..."
  if npm i -g appium; then ok "appium installed"; else err "appium install failed"; FAILED=1; fi
fi

# ── 3. appium drivers ─────────────────────────────────────────────────────────
if command -v appium >/dev/null 2>&1; then
  installed="$(appium driver list --installed 2>&1)"
  for driver in xcuitest uiautomator2; do
    if grep -q "$driver" <<< "$installed"; then
      ok "driver '$driver' already installed"
    else
      info "Installing appium driver '$driver'..."
      if appium driver install "$driver"; then ok "driver '$driver' installed"; else err "driver '$driver' install failed"; FAILED=1; fi
    fi
  done
else
  err "Skipping drivers — appium is not available."; FAILED=1
fi

# ── 4. Vite+ (vpx) ────────────────────────────────────────────────────────────
# run-local.sh runs WebdriverIO via `vpx` (Vite+'s package-binary runner, akin
# to npx). `vpx` is the `vp` binary invoked under an argv[0] alias, so it needs a
# vpx symlink next to vp. The installer doesn't always create it (observed on
# 0.2.5), so ensure it explicitly. Note: the npm package `vite-plus` ships only
# vp/oxfmt/oxlint (no vpx) — the official installer is what we want.
VP_HOME="$HOME/.vite-plus"
if command -v vpx >/dev/null 2>&1; then
  ok "vpx already available ($(command -v vpx))"
else
  if [[ ! -x "$VP_HOME/current/bin/vp" ]]; then
    info "Installing Vite+ (provides vp/vpx) — curl -fsSL https://vite.plus | bash ..."
    curl -fsSL https://vite.plus | bash || { err "Vite+ install failed — install manually: curl -fsSL https://vite.plus | bash"; FAILED=1; }
  fi
  if [[ -x "$VP_HOME/current/bin/vp" ]]; then
    if [[ ! -e "$VP_HOME/bin/vpx" ]]; then
      ln -sf ../current/bin/vp "$VP_HOME/bin/vpx"
      ok "created vpx symlink ($VP_HOME/bin/vpx -> ../current/bin/vp)"
    else
      ok "vpx symlink present ($VP_HOME/bin/vpx)"
    fi
    warn "Open a new shell (or run: source \"$VP_HOME/env\") so 'vpx' is on PATH."
  fi
fi

# ── 5. node_modules ───────────────────────────────────────────────────────────
if [[ -d "$APPIUM_DIR/node_modules" ]]; then
  ok "node_modules present in appium/"
elif command -v bun >/dev/null 2>&1; then
  info "Installing test deps with bun..."
  (cd "$APPIUM_DIR" && bun install) && ok "deps installed (bun)" || { err "bun install failed"; FAILED=1; }
elif command -v vp >/dev/null 2>&1; then
  info "Installing test deps with vp..."
  (cd "$APPIUM_DIR" && vp install) && ok "deps installed (vp)" || { err "vp install failed"; FAILED=1; }
else
  warn "Skipping deps — neither bun nor vp available yet. run-local.sh installs node_modules on first run."
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}━━━ Summary ━━━${NC}"
if (( FAILED )); then
  err "Bootstrap finished with errors — resolve the items above and re-run."
  exit 1
fi
ok "Bootstrap complete."
(( NEEDS_ENV )) && warn "Remember to fill in your OneSignal credentials in $SCRIPT_DIR/.env"
exit 0
