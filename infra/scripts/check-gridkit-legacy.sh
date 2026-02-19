#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

TARGET_DIR="frontend/src"
MODE="${1:---enforce}"
TOP_N="${TOP_N:-20}"

if [[ "$MODE" != "--report-only" && "$MODE" != "--enforce" ]]; then
  echo "[gridkit-guard] Usage: $0 [--enforce|--report-only]"
  exit 2
fi

LEGACY_ADAPTER_PATTERN="${LEGACY_ADAPTER_PATTERN:-Legacy[A-Za-z0-9_]+|components/adapters|TentSlotBoard|tent-slot-board}"
LEGACY_SHELF_STRIP_PATTERN="${LEGACY_SHELF_STRIP_PATTERN:-styles\\.overviewTentShelfStack|styles\\.overviewTentSlotGrid|styles\\.overviewShelfSlotGrid|styles\\.step1ShelfPreviewSlotGrid|styles\\.tentShelfSlotGrid|scrollLeft|scrollTo\\(|\\bwheel\\b}"
DIRECT_RENDER_POSITION_PATTERN="${DIRECT_RENDER_POSITION_PATTERN:-renderPosition=\\{}"
BESPOKE_TRAY_OVERLAY_PATTERN="${BESPOKE_TRAY_OVERLAY_PATTERN:-openTray|expandedTray|trayOverlay|trayFolderOpen|setOpenTray|setExpandedTray}"
SCROLL_PATTERN="${SCROLL_PATTERN:-overflow-y-auto|overflow-y-scroll|max-h-\\[}"
MAP_LOOP_PATTERN="${MAP_LOOP_PATTERN:-\\.map\\(}"
VIRTUAL_PATTERN="${VIRTUAL_PATTERN:-<VirtualList\\b|<VirtualGrid\\b}"
LAYOUT_USAGE_PATTERN="${LAYOUT_USAGE_PATTERN:-<OverviewTentLayout\\b|<PlacementTentLayout\\b|<PlacementShelfPreview\\b}"

FAILURES=0

print_matches() {
  local label="$1"
  local file_path="$2"
  if [[ ! -s "$file_path" ]]; then
    return
  fi
  echo "[gridkit-guard] $label offenders (top ${TOP_N}):"
  head -n "$TOP_N" "$file_path" | sed 's/^/  /'
}

run_check() {
  local label="$1"
  local pattern="$2"
  local exclude_pattern="${3:-}"
  local tmp_raw
  local tmp_filtered
  tmp_raw="$(mktemp)"
  tmp_filtered="$(mktemp)"

  rg -n -S "$pattern" "$TARGET_DIR" >"$tmp_raw" || true
  cp "$tmp_raw" "$tmp_filtered"

  if [[ -n "$exclude_pattern" ]]; then
    grep -E -v "$exclude_pattern" "$tmp_raw" >"$tmp_filtered" || true
  fi

  local count
  count="$(wc -l <"$tmp_filtered" | tr -d ' ')"
  echo "[gridkit-guard] ${label}=${count}"

  if [[ "$count" -gt 0 ]]; then
    print_matches "$label" "$tmp_filtered"
    if [[ "$MODE" == "--enforce" ]]; then
      FAILURES=$((FAILURES + 1))
    fi
  fi

  rm -f "$tmp_raw" "$tmp_filtered"
}

run_scroll_map_check() {
  local label="$1"
  local scroll_tmp
  local map_tmp
  local both_tmp
  local offenders_tmp
  scroll_tmp="$(mktemp)"
  map_tmp="$(mktemp)"
  both_tmp="$(mktemp)"
  offenders_tmp="$(mktemp)"

  rg -l -S "$SCROLL_PATTERN" "$TARGET_DIR" >"$scroll_tmp" || true
  rg -l -S "$MAP_LOOP_PATTERN" "$TARGET_DIR" >"$map_tmp" || true
  comm -12 <(sort "$scroll_tmp") <(sort "$map_tmp") >"$both_tmp" || true

  while IFS= read -r file_path; do
    [[ -z "$file_path" ]] && continue
    [[ "$file_path" == *"frontend/src/lib/gridkit/components/virtual/"* ]] && continue
    if rg -q -S "$VIRTUAL_PATTERN" "$file_path"; then
      continue
    fi
    printf '%s\n' "$file_path" >>"$offenders_tmp"
  done <"$both_tmp"

  local count
  count="$(wc -l <"$offenders_tmp" | tr -d ' ')"
  echo "[gridkit-guard] ${label}=${count}"

  if [[ "$count" -gt 0 ]]; then
    echo "[gridkit-guard] ${label} offenders (top ${TOP_N}):"
    head -n "$TOP_N" "$offenders_tmp" | sed 's/^/  /'
    if [[ "$MODE" == "--enforce" ]]; then
      FAILURES=$((FAILURES + 1))
    fi
  fi

  rm -f "$scroll_tmp" "$map_tmp" "$both_tmp" "$offenders_tmp"
}

usage_count() {
  local label="$1"
  local pattern="$2"
  local count
  count="$( (rg -n -S "$pattern" "$TARGET_DIR" || true) | wc -l | tr -d ' ')"
  echo "[gridkit-guard] ${label}=${count}"
  if [[ "$MODE" == "--enforce" && "$count" -eq 0 ]]; then
    echo "[gridkit-guard] ${label} expected at least one usage"
    FAILURES=$((FAILURES + 1))
  fi
}

echo "[gridkit-guard] mode=${MODE} target=${TARGET_DIR}"

run_check "remaining_legacy_adapter_refs" "$LEGACY_ADAPTER_PATTERN"
run_check \
  "remaining_legacy_shelf_strip_patterns" \
  "$LEGACY_SHELF_STRIP_PATTERN" \
  "frontend/src/lib/gridkit/components/PositionStrip.tsx|frontend/src/components/ui/experiments-styles.ts"
run_check \
  "remaining_direct_renderPosition_lambdas" \
  "$DIRECT_RENDER_POSITION_PATTERN" \
  "frontend/src/lib/gridkit/renderers/PositionStripWithRenderers.tsx"
run_check "remaining_bespoke_tray_overlay_patterns" "$BESPOKE_TRAY_OVERLAY_PATTERN"
run_scroll_map_check "remaining_large_map_loops_in_scroll_containers"

usage_count "gridkit_layout_usages" "$LAYOUT_USAGE_PATTERN"
usage_count "position_strip_with_renderers_usages" "<PositionStripWithRenderers\\b"
usage_count "tray_folder_overlay_usages" "<TrayFolderOverlay\\b|<TrayCellExpandable\\b|<TrayFolderProvider\\b"
usage_count "virtual_list_grid_usages" "$VIRTUAL_PATTERN"

if [[ "$MODE" == "--enforce" && "$FAILURES" -gt 0 ]]; then
  echo "[gridkit-guard] FAIL: ${FAILURES} guardrail check(s) failed"
  exit 1
fi

if [[ "$MODE" == "--report-only" ]]; then
  echo "[gridkit-guard] report-only mode: no CI failure"
else
  echo "[gridkit-guard] OK"
fi
