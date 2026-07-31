#!/usr/bin/env bash
# Wire Bonk Box to your Claude Code sessions. OPT IN - nothing runs this for you.
#
# Adds three hooks so he reacts to how your session is going. It is additive:
# your existing hooks are read, kept exactly as they are, and ours are appended
# alongside them. A timestamped backup is written before anything changes.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SETTINGS="$HOME/.claude/settings.json"
HOOKS="$REPO/hooks"
BIN="$HOME/.local/bin"

say() { printf '\033[1m[bonk box]\033[0m %s\n' "$1"; }
oops() { printf '\033[1;31m[bonk box]\033[0m %s\n' "$1" >&2; }

command -v node >/dev/null 2>&1 || { oops "This needs Node to edit settings.json safely."; exit 1; }
[ -d "$HOOKS" ] || { oops "Cannot find $HOOKS"; exit 1; }

if [ ! -f "$SETTINGS" ]; then
  mkdir -p "$(dirname "$SETTINGS")"
  echo '{}' > "$SETTINGS"
  say "created a fresh $SETTINGS"
fi

BACKUP="$SETTINGS.bonk-backup.$(date +%Y%m%d-%H%M%S)"
cp "$SETTINGS" "$BACKUP"
say "backed up your settings to $(basename "$BACKUP")"

node - "$SETTINGS" "$HOOKS" <<'NODE'
const fs = require('fs');
const [file, hooksDir] = process.argv.slice(2);

const raw = fs.readFileSync(file, 'utf8');
let settings;
try {
  settings = JSON.parse(raw);
} catch (err) {
  console.error('settings.json is not valid JSON; refusing to touch it.');
  process.exit(1);
}

const MARK = 'bonk-box/hooks/';
const wanted = [
  ['UserPromptSubmit', `${hooksDir}/on-prompt.sh`],
  ['PostToolUse', `${hooksDir}/on-tool-result.sh`],
  ['Stop', `${hooksDir}/on-stop.sh`]
];

settings.hooks = settings.hooks || {};
let added = 0;

for (const [event, command] of wanted) {
  const groups = (settings.hooks[event] = settings.hooks[event] || []);
  // Idempotent: if any of our commands is already registered here, leave it.
  const already = groups.some((g) =>
    (g.hooks || []).some((h) => typeof h.command === 'string' && h.command.includes(MARK))
  );
  if (already) continue;
  // Append a NEW group. Existing groups are never opened or reordered.
  groups.push({ hooks: [{ type: 'command', command }] });
  added++;
}

fs.writeFileSync(file, JSON.stringify(settings, null, 2) + '\n');
console.log(added ? `added ${added} hook(s)` : 'hooks were already installed, nothing to do');
NODE

# The bonk command, so `npm test || bonk` works from anywhere.
mkdir -p "$BIN"
cat > "$BIN/bonk" <<EOF
#!/usr/bin/env bash
# Summon Bonk Box. Silent on success.
if ! pgrep -f "Bonk Box.app/Contents/MacOS" >/dev/null 2>&1; then
  open -a "Bonk Box" >/dev/null 2>&1 || true
  sleep 1
fi
"$HOOKS/bonk-event.sh" bonk
EOF
chmod +x "$BIN/bonk"
say "installed the 'bonk' command to $BIN/bonk"

case ":$PATH:" in
  *":$BIN:"*) ;;
  *) say "note: $BIN is not on your PATH - add it to use 'bonk' directly" ;;
esac

cat <<'DONE'

  Wired up. Three hooks added, everything you already had left alone.

    UserPromptSubmit  a rough-sounding prompt makes him offer to take one for you
    PostToolUse       something failing makes him wince and hold up a sign
    Stop              "absolutely right" and he says it too

  Detection all happens locally in the hook scripts. Only the event type - one
  word - ever crosses localhost to the app. Nothing is logged or sent anywhere.

  HOOKS ONLY APPLY TO NEW CLAUDE SESSIONS. Restart Claude Code to pick them up.

  To undo: scripts/uninstall-hooks.sh

DONE
