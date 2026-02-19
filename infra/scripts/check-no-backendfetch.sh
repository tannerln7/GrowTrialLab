#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

if rg -n "backendFetch\\(" frontend/src >/tmp/backendfetch-usage.txt; then
  echo "[backendfetch-guard] Found disallowed backendFetch usage in frontend/src:"
  cat /tmp/backendfetch-usage.txt
  exit 1
fi

echo "[backendfetch-guard] No backendFetch usage found in frontend/src"
