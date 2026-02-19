#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

if rg -n "queryKey:\\s*\\[" frontend/src >/tmp/inline-querykey-usage.txt; then
  echo "[querykey-guard] Found disallowed inline queryKey arrays in frontend/src:"
  cat /tmp/inline-querykey-usage.txt
  exit 1
fi

echo "[querykey-guard] No inline queryKey array usage found in frontend/src"
