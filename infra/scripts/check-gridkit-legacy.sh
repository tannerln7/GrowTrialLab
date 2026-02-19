#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

TARGET_DIR="frontend/src"
ALLOWLIST_FILE="${ALLOWLIST_FILE:-infra/scripts/gridkit-legacy-allowlist.txt}"
MODE="${1:---report-only}"
TOP_N="${TOP_N:-20}"
LEGACY_PATTERN="${LEGACY_PATTERN:-TentSlotBoard|tent-slot-board|overviewTentShelfStack|step1ShelfPreviewSlotGrid|tentShelfSlotGrid|slotGridInline}"
BUILDER_PATTERN="${BUILDER_PATTERN:-buildTentLayoutSpecFrom[A-Za-z0-9_]*\\(}"
MAPPING_PATTERN="${MAPPING_PATTERN:-groupSlotsByShelf|buildStep1ShelfPreviewGroups|slotsByShelf\\s*=\\s*new Map|slotByIndex\\s*=\\s*new Map|tentMap\\s*=\\s*new Map}"
CHIP_PATTERN="${CHIP_PATTERN:-DraftChangeMarker|plantCellCheck|plantCellDirtyDot|slotPlacedChip|absolute[^\\n]*(top|bottom|left|right).*text-xs}"
CELL_SHELL_PATTERN="${CELL_SHELL_PATTERN:-styles\\.cellFrame|styles\\.cellInteractive|styles\\.cellSurfaceLevel[0-9]|rounded-lg border border-border}"
CONTAINER_PATTERN="${CONTAINER_PATTERN:-<TentGrid\\b|<TentCard\\b|<ShelfStack\\b|<ShelfCard\\b}"
POSITION_STRIP_PATTERN="${POSITION_STRIP_PATTERN:-<PositionStrip\\b}"
LEGACY_SHELF_STRIP_PATTERN="${LEGACY_SHELF_STRIP_PATTERN:-styles\\.overviewTentShelfStack|styles\\.overviewTentSlotGrid|styles\\.overviewShelfSlotGrid|styles\\.step1ShelfPreviewSlotGrid|styles\\.tentShelfSlotGrid|scrollLeft|scrollTo\\(|wheel}"
TENT_SHELF_WRAPPER_PATTERN="${TENT_SHELF_WRAPPER_PATTERN:-styles\\.overviewTentBoardGrid|styles\\.overviewTentBoardCard|styles\\.overviewTentShelfStack|styles\\.overviewShelfGroup|styles\\.tentBoardGrid|styles\\.tentBoardCard|styles\\.tentShelfRow|styles\\.tentShelfCard|styles\\.step1ShelfPreviewLane|styles\\.step1ShelfPreviewCard|\\[grid-template-columns:repeat\\(auto-fit,minmax\\(min\\(100%,28rem\\),1fr\\)\\)\\]}"

if [[ "$MODE" != "--report-only" && "$MODE" != "--enforce" ]]; then
  echo "[gridkit-legacy-guard] Usage: $0 [--report-only|--enforce]"
  exit 2
fi

raw_matches="$(mktemp)"
violations="$(mktemp)"
chip_tmp="$(mktemp)"
shell_tmp="$(mktemp)"
wrapper_tmp="$(mktemp)"
legacy_strip_tmp="$(mktemp)"
trap 'rm -f "$raw_matches" "$violations" "$chip_tmp" "$shell_tmp" "$wrapper_tmp" "$legacy_strip_tmp"' EXIT

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
builder_match_count="$( (rg -n -S "$BUILDER_PATTERN" "$TARGET_DIR" || true) | wc -l | tr -d ' ')"
mapping_match_count="$( (rg -n -S "$MAPPING_PATTERN" "$TARGET_DIR" || true) | wc -l | tr -d ' ')"
cellchrome_count="$( (rg -n -S "<CellChrome\\b" "$TARGET_DIR" || true) | wc -l | tr -d ' ')"
cellchips_count="$( (rg -n -S "<CellChips\\b" "$TARGET_DIR" || true) | wc -l | tr -d ' ')"
container_count="$( (rg -n -S "$CONTAINER_PATTERN" "$TARGET_DIR" || true) | wc -l | tr -d ' ')"
position_strip_count="$( (rg -n -S "$POSITION_STRIP_PATTERN" "$TARGET_DIR" || true) | wc -l | tr -d ' ')"
chip_match_count="$(
  (
    (rg -n -S "$CHIP_PATTERN" "$TARGET_DIR" || true) | grep -E -v "frontend/src/lib/gridkit/components/CellChips.tsx" || true
  ) | wc -l | tr -d ' '
)"
cell_shell_match_count="$(
  (
    (rg -n -S "$CELL_SHELL_PATTERN" "$TARGET_DIR" || true) | grep -E -v "frontend/src/lib/gridkit/components/CellChrome.tsx" || true
  ) | wc -l | tr -d ' '
)"
tent_shelf_wrapper_match_count="$(
  (
    (rg -n -S "$TENT_SHELF_WRAPPER_PATTERN" "$TARGET_DIR" || true) | grep -E -v "frontend/src/components/ui/experiments-styles.ts" || true
  ) | wc -l | tr -d ' '
)"
legacy_shelf_strip_match_count="$(
  (
    (rg -n -S "$LEGACY_SHELF_STRIP_PATTERN" "$TARGET_DIR" || true) | grep -E -v "frontend/src/lib/gridkit/components/PositionStrip.tsx|frontend/src/components/ui/experiments-styles.ts" || true
  ) | wc -l | tr -d ' '
)"
echo "[gridkit-legacy-guard] builder_callsites=$builder_match_count"
echo "[gridkit-legacy-guard] remaining_mapping_heuristics=$mapping_match_count"
echo "[gridkit-legacy-guard] cellchrome_usages=$cellchrome_count"
echo "[gridkit-legacy-guard] cellchips_usages=$cellchips_count"
echo "[gridkit-legacy-guard] gridkit_container_callsites=$container_count"
echo "[gridkit-legacy-guard] position_strip_usages=$position_strip_count"
echo "[gridkit-legacy-guard] remaining_bespoke_tent_shelf_wrappers=$tent_shelf_wrapper_match_count"
echo "[gridkit-legacy-guard] remaining_legacy_shelf_strip_patterns=$legacy_shelf_strip_match_count"
echo "[gridkit-legacy-guard] remaining_bespoke_chip_overlays=$chip_match_count"
echo "[gridkit-legacy-guard] remaining_bespoke_cell_shells=$cell_shell_match_count"

if [[ -s "$raw_matches" ]]; then
  echo "[gridkit-legacy-guard] top_matched_files:"
  cut -d: -f1 "$raw_matches" | sort | uniq -c | sort -nr | head -n "$TOP_N" | sed 's/^/  /' || true
fi

if [[ -s "$violations" ]]; then
  echo "[gridkit-legacy-guard] non_allowlisted_files:"
  cut -d: -f1 "$violations" | sort -u | sed 's/^/  /'
fi

rg -n -S "$CHIP_PATTERN" "$TARGET_DIR" >"$chip_tmp" || true
rg -n -S "$CELL_SHELL_PATTERN" "$TARGET_DIR" >"$shell_tmp" || true
rg -n -S "$TENT_SHELF_WRAPPER_PATTERN" "$TARGET_DIR" >"$wrapper_tmp" || true
rg -n -S "$LEGACY_SHELF_STRIP_PATTERN" "$TARGET_DIR" >"$legacy_strip_tmp" || true

if [[ -s "$chip_tmp" ]]; then
  echo "[gridkit-legacy-guard] bespoke_chip_overlay_top_files:"
  grep -E -v "frontend/src/lib/gridkit/components/CellChips.tsx" "$chip_tmp" | cut -d: -f1 | sort | uniq -c | sort -nr | head -n "$TOP_N" | sed 's/^/  /' || true
fi

if [[ -s "$shell_tmp" ]]; then
  echo "[gridkit-legacy-guard] bespoke_cell_shell_top_files:"
  grep -E -v "frontend/src/lib/gridkit/components/CellChrome.tsx" "$shell_tmp" | cut -d: -f1 | sort | uniq -c | sort -nr | head -n "$TOP_N" | sed 's/^/  /' || true
fi

if [[ -s "$wrapper_tmp" ]]; then
  echo "[gridkit-legacy-guard] bespoke_tent_shelf_wrapper_top_files:"
  grep -E -v "frontend/src/components/ui/experiments-styles.ts" "$wrapper_tmp" | cut -d: -f1 | sort | uniq -c | sort -nr | head -n "$TOP_N" | sed 's/^/  /' || true
fi

if [[ -s "$legacy_strip_tmp" ]]; then
  echo "[gridkit-legacy-guard] legacy_shelf_strip_top_files:"
  grep -E -v "frontend/src/lib/gridkit/components/PositionStrip.tsx|frontend/src/components/ui/experiments-styles.ts" "$legacy_strip_tmp" | cut -d: -f1 | sort | uniq -c | sort -nr | head -n "$TOP_N" | sed 's/^/  /' || true
fi

if [[ "$MODE" == "--enforce" && "$violation_matches" -gt 0 ]]; then
  echo "[gridkit-legacy-guard] FAIL: found non-allowlisted legacy grid matches"
  exit 1
fi

if [[ "$MODE" == "--report-only" ]]; then
  echo "[gridkit-legacy-guard] report-only mode: no CI failure"
fi
