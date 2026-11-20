# Loads .env as defaults: non-empty variables already set by the caller win, so
# `ONESIGNAL_APP_ID=... ./run-local.sh` overrides the value in .env.
load_env_defaults() {
  local file="$1" name i
  [[ -f "$file" ]] || return 0
  local -a names=() values=()
  while IFS= read -r name; do
    if [[ -n "${!name:-}" ]]; then
      names+=("$name")
      values+=("${!name}")
    fi
  done < <(sed -nE 's/^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)=.*/\2/p' "$file")

  set -a
  # shellcheck disable=SC1090
  source "$file"
  set +a

  (( ${#names[@]} )) || return 0
  for i in "${!names[@]}"; do
    export "${names[$i]}=${values[$i]}"
  done
}
