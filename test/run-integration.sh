#!/usr/bin/env bash
# Integration pipeline, mirroring editable-regions' run-integration-tests.sh.
# For each fixture: install (symlinks the local file: build), run the real
# build chain (SSG build → rosey generate → write-locales via .cloudcannon/
# postbuild), then assert with the fixture's verify-*.mjs scripts.
set -euo pipefail

# Resolve repo root from this script's location so it works from any cwd.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# verify-bundle greps dist/index.mjs — ensure the local bundle exists.
if [ ! -f dist/index.mjs ]; then
  echo "==> dist missing; building rcc-v2 first"
  npm run build
fi

shopt -s nullglob
fixtures=(test/fixtures/*/)
if [ ${#fixtures[@]} -eq 0 ]; then
  echo "No fixtures found under test/fixtures/" >&2
  exit 1
fi

for dir in "${fixtures[@]}"; do
  name="$(basename "$dir")"
  echo ""
  echo "=================================================="
  echo "  Fixture: $name"
  echo "=================================================="
  (
    cd "$dir"
    npm i --no-audit --no-fund
    npm run build
    npm run verify
  ) || { echo "✗ Fixture '$name' failed"; exit 1; }
  echo "✓ Fixture '$name' passed"
done

echo ""
echo "All integration fixtures passed."
