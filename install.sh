#!/usr/bin/env bash
# Install Bonk Box on a Mac.
#
# Written to be run by an AI agent on someone's behalf:
#   curl -fsSL https://raw.githubusercontent.com/eddiesanjuan/bonk-box/main/install.sh | bash
# or, from a clone:
#   ./install.sh
#
# Downloads the latest release, drops the app in /Applications and opens it.
# Falls back to building from source when there is no usable release asset.
set -euo pipefail

REPO="eddiesanjuan/bonk-box"
APP_NAME="Bonk Box.app"
APPS_DIR="/Applications"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

say() { printf '\033[1m[bonk box]\033[0m %s\n' "$1"; }
oops() { printf '\033[1;31m[bonk box]\033[0m %s\n' "$1" >&2; }

if [ "$(uname -s)" != "Darwin" ]; then
  oops "This installer is for macOS. On anything else, open index.html in a browser -"
  oops "the toy is the same, it just lives in a tab."
  exit 1
fi

ARCH="$(uname -m)"   # arm64 on Apple silicon, x86_64 on Intel
say "installing for $ARCH"

install_from_zip() {
  local zip="$1"
  say "unpacking"
  rm -rf "$TMP/unpacked"
  mkdir -p "$TMP/unpacked"
  ditto -x -k "$zip" "$TMP/unpacked"

  local app
  app="$(find "$TMP/unpacked" -maxdepth 2 -name "*.app" -print -quit)"
  [ -n "$app" ] || return 1

  say "replacing $APPS_DIR/$APP_NAME"
  rm -rf "${APPS_DIR:?}/$APP_NAME"
  ditto "$app" "$APPS_DIR/$APP_NAME"

  # This build is not signed by an Apple developer account - it was compiled on
  # a laptop. Downloading it sets a quarantine flag, and Gatekeeper refuses to
  # open quarantined unsigned apps. Clearing the flag says "I fetched this on
  # purpose", which is exactly what the person running this installer means.
  xattr -cr "$APPS_DIR/$APP_NAME" 2>/dev/null || true
  return 0
}

build_from_source() {
  say "no usable release asset - building from source instead"
  if ! command -v cargo >/dev/null 2>&1; then
    oops "Building needs Rust, which is not installed."
    oops "Install it with:  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    oops "Then run this installer again."
    exit 1
  fi
  if ! command -v npm >/dev/null 2>&1; then
    oops "Building needs Node and npm, which are not installed."
    oops "Install Node 18 or newer from https://nodejs.org, then run this installer again."
    exit 1
  fi

  local src="$TMP/src"
  if [ -f "$(dirname "$0")/desktop/build-frontend.sh" ]; then
    src="$(cd "$(dirname "$0")" && pwd)"
  else
    say "fetching the source"
    git clone --depth 1 "https://github.com/$REPO.git" "$src" >/dev/null 2>&1 || {
      oops "Could not fetch https://github.com/$REPO (it may be private)."
      exit 1
    }
  fi

  say "compiling - the first build takes a few minutes"
  (cd "$src/desktop" && npm install --silent && ./build-frontend.sh >/dev/null && npx tauri build >/dev/null 2>&1)

  local built
  built="$(find "$src/desktop/src-tauri/target/release/bundle/macos" -maxdepth 1 -name "*.app" -print -quit)"
  [ -n "$built" ] || { oops "The build finished but produced no app."; exit 1; }

  rm -rf "${APPS_DIR:?}/$APP_NAME"
  ditto "$built" "$APPS_DIR/$APP_NAME"
  xattr -cr "$APPS_DIR/$APP_NAME" 2>/dev/null || true
}

# ---- try the published release first ---------------------------------------
ASSET="$TMP/bonkbox.zip"
GOT_ASSET=0

# Plain curl against the public release first: no GitHub account, no gh, no
# auth. A stranger's agent should be able to run this with nothing installed.
say "fetching the latest release"
URL="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null \
      | grep -o '"browser_download_url": *"[^"]*\.app\.zip"' \
      | head -1 | sed 's/.*"\(https[^"]*\)"/\1/')" || true
if [ -n "${URL:-}" ] && curl -fsSL "$URL" -o "$ASSET" 2>/dev/null; then
  GOT_ASSET=1
fi

# Only if that failed, try gh - it can see things curl cannot.
if [ "$GOT_ASSET" -eq 0 ] && command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  say "trying again with gh"
  if gh release download --repo "$REPO" --pattern "*.app.zip" --dir "$TMP" --clobber >/dev/null 2>&1; then
    found="$(find "$TMP" -maxdepth 1 -name "*.app.zip" -print -quit)"
    if [ -n "$found" ]; then mv "$found" "$ASSET"; GOT_ASSET=1; fi
  fi
fi

if [ "$GOT_ASSET" -eq 1 ] && install_from_zip "$ASSET"; then
  say "installed from the release"
else
  build_from_source
fi

say "opening him up"
open "$APPS_DIR/$APP_NAME"

cat <<'DONE'

  Bonk Box is in /Applications and should be on screen now.

  It floats above your other windows. Flick him about with the mouse.
  Option+Command+B hides and summons him.
  The menu-bar stickman has Show / Hide and Quit.

  To uninstall: quit it, then drag "Bonk Box" from /Applications to the Trash.

DONE
