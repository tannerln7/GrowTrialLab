#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

TARGET_DIR="frontend/src"
ALLOWLIST_FILE="${ALLOWLIST_FILE:-infra/scripts/gridkit-legacy-allowlist.txt}"
MODE="${1:---report-only}"
TOP_N="${TOP_N:-20}"
LEGACY_PATTERN="${LEGACY_PATTERN:-TentSlotBoard|tent-slot-board|overviewTentShelfStack|step1ShelfPreviewSlotGrid|tentShelfSlotGrid|slotGridInline}"

if [[ "$MODE" != "--report-only" && "$MODE" != "--enforce" ]]; then
  echo "[gridkit-legacy-guard] Usage: $0 [--report-only|--enforce]"
  exit 2
fi

raw_matches="$(mktemp)"
violations="$(mktemp)"
trap 'rm -f "$raw_matches" "$violations"' EXIT

rg -n -S "$LEGACY_PATTERN" "$TARGET_DIR" >"$raw_matches" || true

declare -a allowlist_entries=()
if [[ -f "$ALLOWLIST_FILE" ]]; then
  while IFS= read -r line; do
    [[ -z "$line" || "$line" == \#* ]] && continue
    allowlist_entries+=("$line")
  done <"$ALLOWLIST_FILE"
fi

is_allowlisted() {
  local file_path="$1"
  for allowed in "${allowlist_entries[@]}"; do
    if [[ "$file_path" == "$allowed" ]]; then
      return 0
    fi
  done
  return 1
}

while IFS= read -r match_line; do
  [[ -z "$match_line" ]] && continue
  file_path="${match_line%%:*}"
  if ! is_allowlisted "$file_path"; then
    printf '%s\n' "$match_line" >>"$violations"
  fi
done <"$raw_matches"

total_matches="$(wc -l <"$raw_matches" | tr -d ' ')"
total_files="$(
  if [[ -s "$raw_matches" ]]; then
    cut -d: -f1 "$raw_matches" | sort -u | wc -l | tr -d ' '
  else
    echo "0"
  fi
)"
violation_matches="$(wc -l <"$violations" | tr -d ' ')"
violation_files="$(
  if [[ -s "$violations" ]]; then
    cut -d: -f1 "$violations" | sort -u | wc -l | tr -d ' '
  else
    echo "0"
  fi
)"

echo "[gridkit-legacy-guard] mode=$MODE pattern=$LEGACY_PATTERN"
echo "[gridkit-legacy-guard] allowlist_file=$ALLOWLIST_FILE entries=${#allowlist_entries[@]}"
echo "[gridkit-legacy-guard] matches_total=$total_matches files_total=$total_files"
echo "[gridkit-legacy-guard] matches_non_allowlisted=$violation_matches files_non_allowlisted=$violation_files"

if [[ -s "$raw_matches" ]]; then
  echo "[gridkit-legacy-guard] top_matched_files:"
  cut -d: -f1 "$raw_matches" | sort | uniq -c | sort -nr | head -n "$TOP_N" | sed 's/^/  /'
fi

if [[ -s "$violations" ]]; then
  echo "[gridkit-legacy-guard] non_allowlisted_files:"
  cut -d: -f1 "$violations" | sort -u | sed 's/^/  /'
fi

if [[ "$MODE" == "--enforce" && "$violation_matches" -gt 0 ]]; then
  echo "[gridkit-legacy-guard] FAIL: found non-allowlisted legacy grid matches"
  exit 1
fi

if [[ "$MODE" == "--report-only" ]]; then
  echo "[gridkit-legacy-guard] report-only mode: no CI failure"
fi
