#!/usr/bin/env bash
# Test, zip, then re-test from a clean unzip. Usage: ./pack.sh <app-folder>
set -euo pipefail
app="${1:?usage: ./pack.sh <app-folder>}"
root="$(cd "$(dirname "$0")" && pwd)"
ver="$(node -p "require('$root/$app/package.json').version")"
out="$root/dist/$app-v$ver.zip"
echo "== 1/3 tests in source: $app"
(cd "$root/$app" && npm test --silent)
echo "== 2/3 zip"
mkdir -p "$root/dist"; rm -f "$out"
(cd "$root" && zip -qr "$out" "$app" -x "$app/data/*.db*" "$app/data/*.log" "$app/data/chrome/*" "$app/node_modules/*")
echo "== 3/3 tests from clean unzip"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
unzip -q "$out" -d "$tmp"
(cd "$tmp/$app" && npm test --silent)
(cd "$root/dist" && sha256sum "$(basename "$out")" > "$(basename "$out").sha256")
echo "PACKED $out"
