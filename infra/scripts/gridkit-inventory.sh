#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

TARGET_DIR="frontend/src"
TOP_N="${TOP_N:-10}"

report_bucket() {
  local label="$1"
  local pattern="$2"
  local tmp_file
  tmp_file="$(mktemp)"

  if rg -n -S -i "$pattern" "$TARGET_DIR" >"$tmp_file"; then
    local match_count
    local file_count
    match_count="$(wc -l <"$tmp_file" | tr -d ' ')"
    file_count="$(cut -d: -f1 "$tmp_file" | sort -u | wc -l | tr -d ' ')"
    echo "[$label] matches=$match_count files=$file_count"
    echo "[$label] top_files:"
    cut -d: -f1 "$tmp_file" | sort | uniq -c | sort -nr | head -n "$TOP_N" | sed 's/^/  /'
  else
    echo "[$label] matches=0 files=0"
  fi

  rm -f "$tmp_file"
}

echo "[gridkit-inventory] target=$TARGET_DIR top_n=$TOP_N"
report_bucket \
  "legacy_shelf_strip_heuristics" \
  "shelf|strip|pager|carousel|scroll-snap|overflow-x|scrollTo\\(|scrollLeft|wheel"
report_bucket "grid_board_heuristics" "tent|shelf|slot|tray|plant|grid|board|matrix"
report_bucket "tray_overlay_patterns" "popover|dialog|portal|createPortal|overlay"
report_bucket "adhoc_scroll_paging" "overflow-x|scroll-snap|scrollTo\\(|scrollLeft|wheel"
report_bucket "spec_builder_callsites" "buildTentLayoutSpecFrom[A-Za-z0-9_]*\\("
report_bucket \
  "remaining_bespoke_mapping_heuristics" \
  "groupSlotsByShelf|buildStep1ShelfPreviewGroups|slotsByShelf\\s*=\\s*new Map|slotByIndex\\s*=\\s*new Map|tentMap\\s*=\\s*new Map"
