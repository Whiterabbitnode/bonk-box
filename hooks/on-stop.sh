#!/usr/bin/env bash
# Claude Code Stop hook: if the assistant just told you that you are absolutely
# right, he would like to say it too.
#
# Reads only the last assistant message from the transcript, in memory, and
# sends nothing but the event type.
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
payload=$(cat)

verdict=$(printf '%s' "$payload" | /usr/bin/python3 -c '
import json,sys,os
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit()
path = d.get("transcript_path") or ""
if not path or not os.path.exists(path):
    sys.exit()
last = ""
try:
    with open(path, "r", encoding="utf-8", errors="ignore") as fh:
        for line in fh:
            try:
                row = json.loads(line)
            except Exception:
                continue
            msg = row.get("message") or {}
            if msg.get("role") != "assistant":
                continue
            content = msg.get("content")
            if isinstance(content, list):
                last = " ".join(c.get("text","") for c in content if isinstance(c, dict))
            elif isinstance(content, str):
                last = content
except Exception:
    sys.exit()
if "absolutely right" in last.lower():
    print("echo")
' 2>/dev/null)

if [ "$verdict" = "echo" ]; then
  "$here/bonk-event.sh" echo-absolutely-right
fi
exit 0
