#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

TARGET_DIR="frontend/src"
TOP_N="${TOP_N:-10}"

report_bucket() {
  local label="$1"
  local pattern="$2"
  local exclude_pattern="${3:-}"
  local tmp_file
  local work_file
  tmp_file="$(mktemp)"
  work_file="$(mktemp)"

  if rg -n -S -i "$pattern" "$TARGET_DIR" >"$tmp_file"; then
    cp "$tmp_file" "$work_file"
    if [[ -n "$exclude_pattern" ]]; then
      grep -E -v "$exclude_pattern" "$tmp_file" >"$work_file" || true
    fi
    local match_count
    local file_count
    match_count="$(wc -l <"$work_file" | tr -d ' ')"
    file_count="$(
      if [[ -s "$work_file" ]]; then
        cut -d: -f1 "$work_file" | sort -u | wc -l | tr -d ' '
      else
        echo "0"
      fi
    )"
    echo "[$label] matches=$match_count files=$file_count"
    if [[ -s "$work_file" ]]; then
      echo "[$label] top_files:"
      cut -d: -f1 "$work_file" | sort | uniq -c | sort -nr | head -n "$TOP_N" | sed 's/^/  /'
    fi
  else
    echo "[$label] matches=0 files=0"
  fi

  rm -f "$tmp_file" "$work_file"
}

echo "[gridkit-inventory] target=$TARGET_DIR top_n=$TOP_N"
report_bucket \
  "legacy_shelf_strip_heuristics" \
  "shelf|strip|pager|carousel|scroll-snap|overflow-x|scrollTo\\(|scrollLeft|wheel"
report_bucket "grid_board_heuristics" "tent|shelf|slot|tray|plant|grid|board|matrix"
report_bucket "tray_overlay_patterns" "popover|dialog|portal|createPortal|overlay"
report_bucket "adhoc_scroll_paging" "overflow-x|scroll-snap|scrollTo\\(|scrollLeft|wheel"
report_bucket "spec_builder_callsites" "buildTentLayoutSpecFrom[A-Za-z0-9_]*\\("
report_bucket "cellchrome_usages" "<CellChrome\\b"
report_bucket "cellchips_usages" "<CellChips\\b"
report_bucket \
  "remaining_bespoke_mapping_heuristics" \
  "groupSlotsByShelf|buildStep1ShelfPreviewGroups|slotsByShelf\\s*=\\s*new Map|slotByIndex\\s*=\\s*new Map|tentMap\\s*=\\s*new Map"
report_bucket \
  "remaining_bespoke_chip_overlays" \
  "DraftChangeMarker|plantCellCheck|plantCellDirtyDot|slotPlacedChip|absolute[^\\n]*(top|bottom|left|right).*text-xs" \
  "frontend/src/lib/gridkit/components/CellChips.tsx"
report_bucket \
  "remaining_bespoke_cell_shells" \
  "styles\\.cellFrame|styles\\.cellInteractive|styles\\.cellSurfaceLevel[0-9]|rounded-lg border border-border" \
  "frontend/src/lib/gridkit/components/CellChrome.tsx"
