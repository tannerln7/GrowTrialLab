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
      cut -d: -f1 "$work_file" | sort | uniq -c | sort -nr | head -n "$TOP_N" | sed 's/^/  /' || true
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
report_bucket "gridkit_container_callsites" "<TentGrid\\b|<TentCard\\b|<ShelfStack\\b|<ShelfCard\\b"
report_bucket "position_strip_usages" "<PositionStrip\\b"
report_bucket \
  "remaining_bespoke_mapping_heuristics" \
  "groupSlotsByShelf|buildStep1ShelfPreviewGroups|slotsByShelf\\s*=\\s*new Map|slotByIndex\\s*=\\s*new Map|tentMap\\s*=\\s*new Map"
report_bucket \
  "remaining_legacy_shelf_strip_patterns" \
  "styles\\.overviewTentShelfStack|styles\\.overviewTentSlotGrid|styles\\.overviewShelfSlotGrid|styles\\.step1ShelfPreviewSlotGrid|styles\\.tentShelfSlotGrid|scrollLeft|scrollTo\\(|wheel" \
  "frontend/src/lib/gridkit/components/PositionStrip.tsx|frontend/src/components/ui/experiments-styles.ts"
report_bucket \
  "remaining_bespoke_tent_shelf_wrappers" \
  "styles\\.overviewTentBoardGrid|styles\\.overviewTentBoardCard|styles\\.overviewTentShelfStack|styles\\.overviewShelfGroup|styles\\.tentBoardGrid|styles\\.tentBoardCard|styles\\.tentShelfRow|styles\\.tentShelfCard|styles\\.step1ShelfPreviewLane|styles\\.step1ShelfPreviewCard|\\[grid-template-columns:repeat\\(auto-fit,minmax\\(min\\(100%,28rem\\),1fr\\)\\)\\]" \
  "frontend/src/components/ui/experiments-styles.ts"
report_bucket \
  "remaining_bespoke_chip_overlays" \
  "DraftChangeMarker|plantCellCheck|plantCellDirtyDot|slotPlacedChip|absolute[^\\n]*(top|bottom|left|right).*text-xs" \
  "frontend/src/lib/gridkit/components/CellChips.tsx"
report_bucket \
  "remaining_bespoke_cell_shells" \
  "styles\\.cellFrame|styles\\.cellInteractive|styles\\.cellSurfaceLevel[0-9]|rounded-lg border border-border" \
  "frontend/src/lib/gridkit/components/CellChrome.tsx"
