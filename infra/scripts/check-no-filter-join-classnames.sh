#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

if rg -n 'filter\(Boolean\)\.join\(" "\)' frontend/src >/tmp/filter-join-usage.txt; then
  echo "[classname-guard] Found disallowed filter(Boolean).join(\" \") usage in frontend/src:"
  cat /tmp/filter-join-usage.txt
  exit 1
fi

echo "[classname-guard] No filter(Boolean).join(\" \") usage found in frontend/src"
