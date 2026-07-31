#!/usr/bin/env bash
# Claude Code UserPromptSubmit hook.
#
# Reads your prompt, checks it against a local word list, and if it looks like
# a rough moment POSTs the single word "heated" to the app so he can offer to
# take one for you.
#
# YOUR PROMPT NEVER LEAVES THIS SCRIPT. It is read from stdin, matched in
# memory, and dropped. Only the event type crosses localhost. Nothing is
# written to disk except a timestamp used for throttling.
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
words="$here/heated-words.txt"
payload=$(cat)
[ -f "$words" ] || exit 0

prompt=$(printf '%s' "$payload" | /usr/bin/python3 -c '
import json,sys
try:
    print(json.load(sys.stdin).get("prompt",""))
except Exception:
    pass
' 2>/dev/null)
[ -z "$prompt" ] && exit 0

lower=$(printf '%s' "$prompt" | tr "[:upper:]" "[:lower:]")
while IFS= read -r word; do
  case "$word" in ''|'#'*) continue ;; esac
  if printf '%s' "$lower" | grep -qF -- "$word"; then
    "$here/bonk-event.sh" heated
    break
  fi
done < "$words"
exit 0
