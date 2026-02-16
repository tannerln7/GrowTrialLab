#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

if ! command -v docker >/dev/null 2>&1; then
  echo "[reset-dev] docker CLI not found."
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "[reset-dev] jq is required to parse docker compose config."
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "[reset-dev] curl is required to poll backend health."
  exit 1
fi

COMPOSE_JSON="$(docker compose config --format json)"
DB_VOLUME_KEY="$(
  echo "$COMPOSE_JSON" | jq -r '
    .services.db.volumes[]?
    | select(.type == "volume" and .target == "/var/lib/postgresql/data")
    | .source
  ' | head -n 1
)"

if [[ -z "$DB_VOLUME_KEY" || "$DB_VOLUME_KEY" == "null" ]]; then
  echo "[reset-dev] Could not detect the Postgres volume from docker compose config."
  exit 1
fi

DB_VOLUME_NAME="$(
  echo "$COMPOSE_JSON" | jq -r --arg key "$DB_VOLUME_KEY" '.volumes[$key].name // $key'
)"

echo "WARNING: This will permanently delete local dev Postgres data."
echo "Volume to delete: $DB_VOLUME_NAME"
echo "This resets your local DB to an empty state."
read -r -p "Type RESET to continue: " CONFIRM
if [[ "$CONFIRM" != "RESET" ]]; then
  echo "[reset-dev] Aborted."
  exit 1
fi

echo "[reset-dev] Stopping compose stack..."
docker compose down --remove-orphans

echo "[reset-dev] Removing Postgres volume: $DB_VOLUME_NAME"
docker volume rm -f "$DB_VOLUME_NAME" >/dev/null 2>&1 || true

echo "[reset-dev] Rebuilding and starting compose stack..."
docker compose up --build -d

echo "[reset-dev] Waiting for backend container..."
for _ in $(seq 1 60); do
  if docker compose exec -T backend sh -lc "true" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

HEALTH_URL="${RESET_DEV_HEALTH_URL:-http://localhost:8000/healthz}"
echo "[reset-dev] Waiting for backend health at $HEALTH_URL (migrations run on backend startup)..."
healthy=0
for _ in $(seq 1 180); do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    healthy=1
    break
  fi
  sleep 1
done

if [[ "$healthy" -ne 1 ]]; then
  echo "[reset-dev] Backend did not become healthy in time."
  echo "[reset-dev] Recent backend logs:"
  docker compose logs --tail=120 backend || true
  exit 1
fi

echo "[reset-dev] Done. Stack is running with a clean empty DB."
