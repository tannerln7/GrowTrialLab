#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

echo "[verify] Running backend tests..."
(cd backend && uv run pytest)

echo "[verify] Running pyright..."
pnpm pyright

echo "[verify] Running frontend guardrails..."
pnpm frontend:guardrails

echo "[verify] Building docker compose images..."
docker compose build

echo "[verify] OK"
