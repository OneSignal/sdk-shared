#!/usr/bin/env bash

# Prompts for an iOS simulator or Android AVD. Sets PICKED_DEVICE (simulator
# or AVD name) and, for iOS, PICKED_UDID, since simulator names repeat across
# runtimes.
pick_device() {
  local platform="$1"
  local -a names=() udids=() labels=()
  local name udid label
  PICKED_DEVICE=""
  PICKED_UDID=""

  if [[ "$platform" == "ios" ]]; then
    while IFS='|' read -r udid name label; do
      [[ -n "$udid" ]] || continue
      udids+=("$udid")
      names+=("$name")
      labels+=("$label")
    done < <(xcrun simctl list devices available -j 2>/dev/null | python3 -c '
import json, sys
data = json.load(sys.stdin)
rows = []
for runtime, devices in data["devices"].items():
    rt = runtime.rsplit(".", 1)[-1]
    if not rt.startswith("iOS-"):
        continue
    try:
        ver = tuple(int(p) for p in rt[4:].split("-"))
    except ValueError:
        continue
    for d in devices:
        label = d["name"] + "  (iOS " + ".".join(map(str, ver)) + ")"
        if d["state"] == "Booted":
            label += "  [booted]"
        rows.append((ver, d["name"], d["udid"], label))
for ver, name, udid, label in sorted(rows, key=lambda r: (tuple(-v for v in r[0]), not r[1].startswith("iPhone"), r[1])):
    print(udid + "|" + name + "|" + label)
' 2>/dev/null)
  else
    local running
    running=$(ps -axo command= 2>/dev/null | grep -oE -- '-avd [^ ]+' | awk '{print $2}' || true)
    while read -r name; do
      [[ "$name" =~ ^[A-Za-z0-9._-]+$ ]] || continue
      label="$name"
      grep -qxF -- "$name" <<<"$running" && label+="  [running]"
      names+=("$name")
      labels+=("$label")
    done < <(emulator -list-avds 2>/dev/null)
  fi

  if (( ${#names[@]} == 0 )); then
    if [[ "$platform" == "ios" ]]; then
      echo "No iOS simulators found (xcrun simctl list devices available)" >&2
    else
      echo "No Android AVDs found (emulator -list-avds)" >&2
    fi
    return 1
  fi

  echo ""
  if [[ "$platform" == "ios" ]]; then
    echo -e "${GREEN}Select iOS simulator:${NC}"
  else
    echo -e "${GREEN}Select Android emulator:${NC}"
  fi
  local i
  for i in "${!labels[@]}"; do
    echo "  $((i + 1))) ${labels[$i]}"
  done

  local choice
  while true; do
    if ! read -rp "> " choice; then
      echo "" >&2
      echo "No input available; cannot pick a device" >&2
      return 1
    fi
    if [[ "$choice" =~ ^[0-9]+$ ]] && (( choice >= 1 && choice <= ${#names[@]} )); then
      PICKED_DEVICE="${names[$((choice - 1))]}"
      [[ "$platform" == "ios" ]] && PICKED_UDID="${udids[$((choice - 1))]}"
      return 0
    fi
    echo "  Invalid choice. Enter a number 1-${#names[@]}."
  done
}
