#!/usr/bin/env bash
set -euo pipefail

API_BASE="${API_BASE:-http://localhost:8000}"
PLANTS_PER_SPECIES="${PLANTS_PER_SPECIES:-4}"
API_AUTH_HEADER="${API_AUTH_HEADER:-}"
AUTO_CREATE_EXPERIMENT_IF_MISSING="${AUTO_CREATE_EXPERIMENT_IF_MISSING:-1}"
AUTO_CREATE_SPECIES_IF_MISSING="${AUTO_CREATE_SPECIES_IF_MISSING:-1}"
NEW_EXPERIMENT_NAME="${NEW_EXPERIMENT_NAME:-Seeded Experiment}"
NEW_EXPERIMENT_DESCRIPTION="${NEW_EXPERIMENT_DESCRIPTION:-Auto-created by infra/scripts/seed-plants-by-species.sh}"

DEFAULT_SPECIES=(
  "Nepenthes ventricosa|nepenthes"
  "Nepenthes alata|nepenthes"
  "Nepenthes ampullaria|nepenthes"
  "Nepenthes maxima|nepenthes"
  "Nepenthes rajah|nepenthes"
  "Dionaea muscipula|flytrap"
  "Drosera capensis|drosera"
  "Drosera aliciae|drosera"
  "Drosera spatulata|drosera"
  "Sarracenia purpurea|sarracenia"
  "Sarracenia flava|sarracenia"
  "Pinguicula moranensis|pinguicula"
  "Pinguicula gigantea|pinguicula"
  "Cephalotus follicularis|cephalotus"
  "Utricularia sandersonii|utricularia"
)

if ! command -v curl >/dev/null 2>&1; then
  echo "[seed-plants] curl is required."
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "[seed-plants] jq is required."
  exit 1
fi

if ! [[ "$PLANTS_PER_SPECIES" =~ ^[0-9]+$ ]] || [[ "$PLANTS_PER_SPECIES" -lt 1 ]]; then
  echo "[seed-plants] PLANTS_PER_SPECIES must be a positive integer."
  exit 1
fi

API_STATUS=""
API_BODY=""

api_request() {
  local method="$1"
  local url="$2"
  local data="${3:-}"
  local tmp_file
  local -a headers

  tmp_file="$(mktemp)"
  headers=(-H "Accept: application/json")
  if [[ -n "$API_AUTH_HEADER" ]]; then
    headers+=(-H "$API_AUTH_HEADER")
  fi
  if [[ -n "$data" ]]; then
    headers+=(-H "Content-Type: application/json")
    API_STATUS="$(curl -sS -o "$tmp_file" -w "%{http_code}" -X "$method" "${headers[@]}" --data "$data" "$url")"
  else
    API_STATUS="$(curl -sS -o "$tmp_file" -w "%{http_code}" -X "$method" "${headers[@]}" "$url")"
  fi
  API_BODY="$(cat "$tmp_file")"
  rm -f "$tmp_file"
}

ensure_2xx() {
  local context="$1"
  if [[ "$API_STATUS" != 2* ]]; then
    echo "[seed-plants] $context failed (HTTP $API_STATUS)."
    if [[ -n "$API_BODY" ]]; then
      echo "$API_BODY"
    fi
    exit 1
  fi
}

echo "[seed-plants] Checking backend health at ${API_BASE}/healthz ..."
api_request GET "${API_BASE}/healthz"
ensure_2xx "Health check"

echo "[seed-plants] Resolving target experiment ..."
api_request GET "${API_BASE}/api/v1/experiments/"
ensure_2xx "Fetch experiments"

experiment_count="$(echo "$API_BODY" | jq -r 'if type=="array" then length else (.count // ((.results // []) | length)) end')"
experiment_id=""
experiment_name=""

if [[ "$experiment_count" -eq 0 ]]; then
  if [[ "$AUTO_CREATE_EXPERIMENT_IF_MISSING" != "1" ]]; then
    echo "[seed-plants] No experiments found and AUTO_CREATE_EXPERIMENT_IF_MISSING is disabled."
    exit 1
  fi

  timestamp="$(date -u +%Y%m%d-%H%M%S)"
  create_payload="$(jq -cn --arg name "${NEW_EXPERIMENT_NAME} ${timestamp}" --arg description "$NEW_EXPERIMENT_DESCRIPTION" '{name:$name, description:$description}')"
  api_request POST "${API_BASE}/api/v1/experiments/" "$create_payload"
  ensure_2xx "Create experiment"
  experiment_id="$(echo "$API_BODY" | jq -r '.id // empty')"
  experiment_name="$(echo "$API_BODY" | jq -r '.name // empty')"
  if [[ -z "$experiment_id" ]]; then
    echo "[seed-plants] Experiment creation response did not include an id."
    echo "$API_BODY"
    exit 1
  fi
  echo "[seed-plants] Created new experiment: ${experiment_name:-$experiment_id} ($experiment_id)"
else
  # If multiple experiments exist, intentionally use the first one returned by the API.
  experiment_id="$(echo "$API_BODY" | jq -r 'if type=="array" then .[0].id else .results[0].id end')"
  experiment_name="$(echo "$API_BODY" | jq -r 'if type=="array" then (. [0].name // "") else (.results[0].name // "") end')"
  echo "[seed-plants] Using first experiment from list: ${experiment_name:-$experiment_id} ($experiment_id)"
fi

echo "[seed-plants] Fetching species list ..."
api_request GET "${API_BASE}/api/v1/species/"
ensure_2xx "Fetch species"

species_json="$(echo "$API_BODY" | jq -c 'if type=="array" then . else (.results // []) end')"
species_count="$(echo "$species_json" | jq -r 'length')"

if [[ "$species_count" -eq 0 ]]; then
  if [[ "$AUTO_CREATE_SPECIES_IF_MISSING" != "1" ]]; then
    echo "[seed-plants] No species found and AUTO_CREATE_SPECIES_IF_MISSING is disabled."
    exit 1
  fi

  echo "[seed-plants] No species found. Creating default species list ..."
  for entry in "${DEFAULT_SPECIES[@]}"; do
    species_name="${entry%%|*}"
    species_category="${entry##*|}"
    species_payload="$(jq -cn --arg name "$species_name" --arg category "$species_category" '{name:$name, category:$category}')"
    api_request POST "${API_BASE}/api/v1/species/" "$species_payload"
    ensure_2xx "Create species '${species_name}'"
  done

  api_request GET "${API_BASE}/api/v1/species/"
  ensure_2xx "Re-fetch species"
  species_json="$(echo "$API_BODY" | jq -c 'if type=="array" then . else (.results // []) end')"
  species_count="$(echo "$species_json" | jq -r 'length')"
  if [[ "$species_count" -eq 0 ]]; then
    echo "[seed-plants] Species list is still empty after default creation."
    exit 1
  fi
fi

echo "[seed-plants] Seeding ${PLANTS_PER_SPECIES} plants for each of ${species_count} species ..."
created_total=0
while IFS= read -r species_row; do
  species_id="$(echo "$species_row" | jq -r '.id')"
  species_name="$(echo "$species_row" | jq -r '.name')"

  for _ in $(seq 1 "$PLANTS_PER_SPECIES"); do
    payload="$(jq -cn --arg species "$species_id" '{species:$species}')"
    api_request POST "${API_BASE}/api/v1/experiments/${experiment_id}/plants/" "$payload"
    ensure_2xx "Create plant for species '${species_name}'"
    created_total=$((created_total + 1))
  done

  echo "[seed-plants] Seeded ${PLANTS_PER_SPECIES} plant(s) for ${species_name}"
done < <(echo "$species_json" | jq -c '.[]')

echo "[seed-plants] Done. Created ${created_total} plant(s) in experiment ${experiment_name:-$experiment_id} ($experiment_id)."
