#!/usr/bin/env bash
# Shared throttle so he peeks occasionally rather than pacing your screen.
# Returns 0 when an automatic peek is allowed, 1 when it is too soon.
# "bonk" and "heated" bypass this - those are you, not the machine.
window="${BONK_BOX_MIN_GAP:-120}"
config="$HOME/.config/bonk-box/config.json"
if [ -z "${BONK_BOX_MIN_GAP:-}" ] && [ -f "$config" ]; then
  from_config=$(sed -n 's/.*"minSecondsBetweenPeeks"[[:space:]]*:[[:space:]]*\([0-9]\{1,6\}\).*/\1/p' "$config" | head -1)
  [ -n "$from_config" ] && window="$from_config"
fi
stamp="${TMPDIR:-/tmp}/bonk-box-last-peek"
now=$(date +%s)
if [ -f "$stamp" ]; then
  last=$(cat "$stamp" 2>/dev/null || echo 0)
  [ $((now - last)) -lt "$window" ] && exit 1
fi
echo "$now" > "$stamp" 2>/dev/null || true
exit 0
