#!/usr/bin/env bash
# Remove the Bonk Box hooks and nothing else.
set -euo pipefail

SETTINGS="$HOME/.claude/settings.json"
BIN="$HOME/.local/bin"
say() { printf '\033[1m[bonk box]\033[0m %s\n' "$1"; }

[ -f "$SETTINGS" ] || { say "no settings.json, nothing to undo"; exit 0; }
command -v node >/dev/null 2>&1 || { echo "needs node" >&2; exit 1; }

BACKUP="$SETTINGS.bonk-backup.$(date +%Y%m%d-%H%M%S)"
cp "$SETTINGS" "$BACKUP"
say "backed up your settings to $(basename "$BACKUP")"

node - "$SETTINGS" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const settings = JSON.parse(fs.readFileSync(file, 'utf8'));
const MARK = 'bonk-box/hooks/';
let removed = 0;

for (const event of Object.keys(settings.hooks || {})) {
  const groups = settings.hooks[event];
  if (!Array.isArray(groups)) continue;
  for (const group of groups) {
    const before = (group.hooks || []).length;
    // Drop only our commands. Anything sharing the group survives.
    group.hooks = (group.hooks || []).filter(
      (h) => !(typeof h.command === 'string' && h.command.includes(MARK))
    );
    removed += before - group.hooks.length;
  }
  // Clear out groups we emptied, and events we emptied.
  settings.hooks[event] = groups.filter((g) => (g.hooks || []).length > 0);
  if (settings.hooks[event].length === 0) delete settings.hooks[event];
}

fs.writeFileSync(file, JSON.stringify(settings, null, 2) + '\n');
console.log(removed ? `removed ${removed} hook(s)` : 'nothing of ours was installed');
NODE

rm -f "$BIN/bonk" && say "removed the 'bonk' command"
say "done. Restart Claude Code for it to take effect."
