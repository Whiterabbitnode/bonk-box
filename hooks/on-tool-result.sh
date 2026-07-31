#!/usr/bin/env bash
# Claude Code PostToolUse hook: a wince when something fails.
#
# Looks at the tool result locally for the shape of a failure. The result text
# never leaves this script - only the word "oops" crosses localhost.
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
payload=$(cat)

verdict=$(printf '%s' "$payload" | /usr/bin/python3 -c '
import json,sys,re
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit()
r = d.get("tool_response") or d.get("tool_result") or {}
text = json.dumps(r) if not isinstance(r, str) else r
low = text.lower()[:4000]
bad = ("error", "failed", "failure", "exception", "traceback",
       "exit code 1", "exit code 2", "not ok", "assertionerror",
       "tests failed", "✗", "fatal:")
if any(b in low for b in bad):
    print("oops")
' 2>/dev/null)

if [ "$verdict" = "oops" ]; then
  "$here/rate-limit.sh" && "$here/bonk-event.sh" oops
fi
exit 0
