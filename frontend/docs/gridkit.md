# GridKit Guide

GridKit is the canonical frontend framework for rendering physical grow layouts as `Tent -> Shelf -> Position -> Occupant` while keeping page behavior (actions, selection workflows, mutations) page-owned. Use GridKit for any tent/shelf/slot/tray/plant surface instead of building one-off board markup.

## When to use GridKit
- Use GridKit when a view renders tent/shelf structures, slot/tray occupancy, or tray plant folders.
- Use GridKit for new placement/overview-like workflows before writing any custom layout wrappers.
- Do not introduce route-local shelf strip implementations, tray overlay systems, or slot/tray/plant cell shells.

## Data spine
### Specs
- Source of truth: `frontend/src/lib/gridkit/spec.ts`
- Root: `TentLayoutSpec`
- Structure:
  - `TentSpec[]`
  - each tent has `ShelfSpec[]`
  - each shelf has ordered `PositionSpec[]`
  - each position has an `occupant.kind` (`tray`, `trayStack`, `emptySlot`, `slotDef`, `plant`)
- Specs are plain serializable objects only (no JSX/functions/refs).

### Builders
- Source: `frontend/src/lib/gridkit/builders/*`
- Build one spec per backend shape:
  - `buildTentLayoutSpecFromOverviewPlants(...)`
  - `buildTentLayoutSpecFromPlacementStep1(...)`
  - `buildTentLayoutSpecFromPlacementStep4(...)`
- Builder rules:
  - preserve API ordering
  - preserve slot visibility rules
  - emit stable IDs for tent/shelf/position

### Presets
- Source: `frontend/src/lib/gridkit/presets.ts`
- Key invariant: `POSITION_STRIP_PRESET.maxVisible = 4`

## Rendering model
### Structural containers
- `TentGrid`, `TentCard`, `ShelfStack`, `ShelfCard`
- Source: `frontend/src/lib/gridkit/components/containers/*`
- Responsive invariant: tents render as 1 column on small screens, 2 columns on `md+`.

### Position paging
- `PositionStrip`: `frontend/src/lib/gridkit/components/PositionStrip.tsx`
- Rules:
  - native CSS scroll-snap
  - one page visible at a time
  - page size fixed to 4 positions
  - desktop arrows page by one full viewport width

### Renderer registry
- Source:
  - `frontend/src/lib/gridkit/renderers/defaultPositionRenderers.tsx`
  - `frontend/src/lib/gridkit/renderers/PositionStripWithRenderers.tsx`
- Default occupant mapping:
  - `tray` -> `TrayCell` / `TrayCellExpandable` (context-controlled)
  - `emptySlot` -> `SlotCell` (empty)
  - `slotDef` -> `SlotCell` (define)
  - `plant` -> `PlantCell`
- For page-specific behavior, start from `createPositionRendererMap(...)` and override only needed kinds.

### Canonical layout wrappers
- `OverviewTentLayout`, `PlacementTentLayout`, `PlacementShelfPreview`
- Source: `frontend/src/lib/gridkit/components/layouts/*`
- These are GridKit-backed layout wrappers (not legacy adapters).

## Tray folder overlay
### Use `TrayCellExpandable` when expansion is required
- Sources:
  - `frontend/src/lib/gridkit/components/cells/TrayCellExpandable.tsx`
  - `frontend/src/lib/gridkit/components/overlays/TrayFolderOverlay.tsx`
  - `frontend/src/lib/gridkit/state/trayFolderManager.tsx`
- Behavior:
  - Radix Popover (non-modal) + portal
  - Framer Motion animation
  - single-open coordination via `TrayFolderProvider`

### Use `TrayCell` when expansion is not required
- Keep static tray behavior for views that never had tray-folder UX.

## Virtualization
### Components
- `VirtualList`: `frontend/src/lib/gridkit/components/virtual/VirtualList.tsx`
- `VirtualGrid`: `frontend/src/lib/gridkit/components/virtual/VirtualGrid.tsx`

### Current thresholds
- `TrayPlantGrid` (`frontend/src/lib/gridkit/components/grids/TrayPlantGrid.tsx`):
  - `plants.length <= 24`: static grid
  - `plants.length > 24`: `VirtualGrid`
- Keep small sets static to avoid unnecessary virtualization overhead.

## DnD readiness (no active DnD yet)
### Stable IDs
- Source: `frontend/src/lib/dnd/ids.ts`
- Convention: `kind:part:part...`
  - examples: `slot:{experimentId}:{tentId}:{shelfId}:{slotId}`, `tray:{experimentId}:{trayId}`

### Required data attributes
- `data-cell-kind`
- `data-pos-id`
- `data-tent-id`
- `data-shelf-id`
- `data-position-index`
- optional when present in spec:
  - `data-draggable-id`
  - `data-droppable-id`

### Future activation seam
- Do not add `DndContext`/sensors/hooks yet.
- Use existing metadata helpers (`frontend/src/lib/dnd/attributes.ts`, `frontend/src/lib/dnd/shells.tsx`) so dnd-kit hooks can be attached later with minimal churn.

## Guardrails
- Inventory report: `pnpm frontend:gridkit:inventory`
- Enforced GridKit guardrails: `pnpm frontend:gridkit:guardrail`
- Full frontend guardrails: `pnpm guardrails`
