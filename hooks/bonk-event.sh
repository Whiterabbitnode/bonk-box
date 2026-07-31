#!/usr/bin/env bash
# POST a single event TYPE to the Bonk Box desktop app.
#
# This is the only thing that ever crosses localhost: one word from a fixed
# list. No prompt text, no tool output, no paths. Fails silently and fast so a
# closed app can never slow a coding session down.
type="${1:-bonk}"
port="${BONK_BOX_PORT:-48222}"
config="$HOME/.config/bonk-box/config.json"
if [ -z "${BONK_BOX_PORT:-}" ] && [ -f "$config" ]; then
  from_config=$(sed -n 's/.*"port"[[:space:]]*:[[:space:]]*\([0-9]\{1,5\}\).*/\1/p' "$config" | head -1)
  [ -n "$from_config" ] && port="$from_config"
fi
curl -s -o /dev/null --max-time 1 \
  -X POST "http://127.0.0.1:${port}/event" \
  -H 'Content-Type: application/json' \
  -d "{\"type\":\"${type}\"}" 2>/dev/null || true
exit 0
