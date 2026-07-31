#!/usr/bin/env bash
# Copy the web toy into the Tauri frontend folder. The page at the repo root
# stays the single source of truth - nothing here is edited by hand.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
dist="$here/dist"

rm -rf "$dist"
mkdir -p "$dist"
cp "$root/index.html" "$dist/index.html"
cp -R "$root/css" "$root/js" "$root/vendor" "$dist/"
echo "copied the toy into $dist"
