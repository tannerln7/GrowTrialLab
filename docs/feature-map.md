# GrowTrialLab Feature Map

Last updated: 2026-02-19  
Source set reviewed: `docs/unified-project-notes.md` + `docs/legacy/*` (decisions, checklist, watch-outs, findings, testing notes, illustration inventory)

This file is the execution-focused feature map for product and engineering status.

## Status Legend
- `Completed`: implemented in current repo and part of active platform behavior.
- `In Progress`: partially implemented or actively queued with known next work.
- `Not Started`: planned but not yet implemented.
- `Superseded`: implemented historically or documented previously, but no longer part of active canonical behavior.

## Current Product Baseline
- Canonical flow:
  - `/experiments/{id}` -> `/setup` (bootstrap incomplete) -> `/overview` (bootstrap complete)
- Bootstrap scope:
  - Plants, Tents+Slots, Recipes
- Readiness/ops surfaces:
  - Baseline, Placement, Rotation, Feeding, Schedule, Recipes, Plant Cockpit (`/p/{uuid}`)
- Canonical backend gating:
  - `GET /api/v1/experiments/{id}/status/summary`
- Canonical contracts:
  - list envelope `{count, results, meta}`
  - blocked response `{detail, diagnostics}`
  - nested location object

## Timeline: Completed Features

### 2026-02-19 (Placement Bootstrap Redirect Loop Fix)
- `Completed` Placement wizard no longer forces users back to setup during bootstrap.
  - Removed setup-incomplete redirect from placement wizard data load path.
  - Setup checklist `Go to placement` now stays on `/experiments/{id}/placement?step=1` so users can complete placement setup steps.
  - updated file:
    - `frontend/src/features/placement/wizard/usePlacementWizard.ts`

### 2026-02-19 (Placement Step 2 Selection-Based Tray Deletion Drafts)
- `Completed` Placement Step 2 tray removal moved from count-decrement semantics to explicit tray selection drafts.
  - Tray Manager toolbar now keeps add (`+`) and contextual remove-selected trash controls; top-level decrement was removed.
  - Tray cells in Step 2 are multi-selectable for deletion drafting; selected persisted trays are hidden from the draft grid and removed on save, selected draft-added trays are dropped from draft state.
  - Save/apply now removes tray plants from staged-for-delete trays before deleting trays.
  - Step 2 draft readiness now uses effective draft trays (persisted minus staged deletions plus additions) with `capacity >= 1`.
  - updated files:
    - `frontend/src/features/placement/wizard/steps/Step2Trays.tsx`
    - `frontend/src/features/placement/wizard/usePlacementWizard.ts`
    - `frontend/src/features/placement/wizard/types.ts`
    - `frontend/src/features/placement/utils.ts`

### 2026-02-19 (Placement Step 2 Save/Next Uses Draft Tray State)
- `Completed` Placement Step 2 next-step blocker now evaluates draft tray state (count + capacity) instead of persisted tray rows only.
  - `Save & Next` is allowed when draft state contains at least one tray with capacity `>= 1`, even before mutations are written.
  - stepper unlock behavior remains tied to persisted completion; this change targets Step 2 blocker/next gating.
  - updated files:
    - `frontend/src/features/placement/wizard/usePlacementWizard.ts`
    - `frontend/src/features/placement/utils.ts`

### 2026-02-19 (Placement Step 3 Tray Popout Parity With Overview)
- `Completed` Placement Step 3 tray containers now use the same tray popup/folder interaction model as overview tray cells.
  - Step 3 tray cards now render through `TrayCellExpandable` under `TrayFolderProvider`, so tray click opens the GridKit popout plant view.
  - Selection semantics are preserved: clicking plants in the popout still toggles staged selection state.
  - Tray remove-selected action now lives in the popup header (top-right, inline with tray label) instead of on the tray card.
  - Shared helper for selectable plant occupant specs is now exported from:
    - `frontend/src/features/placement/components/placement-cells.tsx`
  - Updated file:
    - `frontend/src/features/placement/wizard/steps/Step3PlantsToTrays.tsx`

### 2026-02-19 (Placement Step 3 Tray Contents Compact Grid Fix)
- `Completed` Placement Step 3 tray containers now render tray plant contents with the GridKit compact tray-plant renderer pattern used by overview folder content.
  - Added reusable placement tray-content bridge:
    - `frontend/src/features/placement/components/placement-cells.tsx` (`TrayPlantContentsGrid`)
  - Updated Step 3 tray containers:
    - use compact tray content grid instead of embedding large `PlantSelectableCell` cards inside tray cells
    - move occupancy from summary text to top-right chip (`placement: "tr"`)
    - switch tray container density to `data-cell-size="sm"`
    - file: `frontend/src/features/placement/wizard/steps/Step3PlantsToTrays.tsx`
  - Added minimal GridKit tray content safety fix:
    - `TrayCell` children now render in a `min-h-0 flex-1` region
    - leaf content wrapper includes `min-h-0`
    - files:
      - `frontend/src/lib/gridkit/components/cells/TrayCell.tsx`
      - `frontend/src/lib/gridkit/components/cells/leafSizing.ts`
  - Result:
    - tray contents no longer clip/truncate due oversized embedded leaf cards
    - occupancy chip stays stable at top-right without shifting tray body layout

### 2026-02-19 (Overview Topology Uses Layout Spine Capacity)
- `Completed` Overview tent/shelf topology now uses per-shelf layout capacity from placement summary instead of deriving slot capacity from observed plants.
  - Updated overview builder input contract and slot-position construction:
    - `frontend/src/lib/gridkit/builders/overview.ts`
    - `frontend/src/lib/gridkit/builders/shelfPositions.ts`
  - Overview page now fetches placement summary spine and passes layout/tray placements into the builder:
    - `frontend/src/features/experiments/overview/ExperimentOverviewPageClient.tsx`
  - Result:
    - shelves render full configured slot capacity even when trailing slots have zero plants
    - trays placed in slots still render when plant count is zero, when tray placement data is available
  - Refs: `605b968`

### 2026-02-19 (GridKit Fixed Shelf Column Geometry + Paging Recovery)
- `Completed` Shelf strips now preserve 4-up leaf sizing density for low slot counts and keep desktop paging behavior for multi-page shelves.
  - Added fixed-column support to strip primitives:
    - `frontend/src/lib/gridkit/components/PositionStrip.tsx` (`columnsMode`, `fixedColumns`)
    - `frontend/src/lib/gridkit/renderers/PositionStripWithRenderers.tsx`
  - Wired shelf-layout callsites to fixed mode (`fixedColumns=4`):
    - `frontend/src/lib/gridkit/components/layouts/OverviewTentLayout.tsx`
    - `frontend/src/lib/gridkit/components/layouts/PlacementTentLayout.tsx`
    - `frontend/src/lib/gridkit/components/layouts/PlacementShelfPreview.tsx`
  - Result:
    - shelves with 1-3 positions no longer inflate cell size/height; shelves keep the same 4-column density baseline while preserving scroll-snap paging when `positions.length > 4`.

### 2026-02-19 (GridKit PositionStrip Leaf Sizing Regression Fix)
- `Completed` Restored shelf-strip 4-column/page geometry by removing desktop-constraining leaf min widths while preserving square cell sizing.
  - Updated canonical leaf sizing contract:
    - `frontend/src/lib/gridkit/components/cells/leafSizing.ts`
  - Result:
    - shelf strips can render 4 positions per page again (`maxVisible=4`) and desktop paging remains viewport-page based.

### 2026-02-19 (GridKit Dense Control Sizing + No-Shift Conditional Controls)
- `Completed` GridKit icon-only controls now share a compact sizing contract, and conditional tray/tent destructive actions no longer shift grid content when they appear.
  - Added shared grid control primitive:
    - `frontend/src/components/ui/grid-control-button.tsx`
  - Unified dense control usage in GridKit/placement surfaces:
    - `StepAdjustButton` now composes `GridControlButton`
    - `PositionStrip` desktop arrows now use `GridControlButton`
    - placement grid toolbar icon controls now use `GridControlButton`
  - Conditional selection-trash actions now render as absolute overlays with pointer-safe wrappers and opacity/scale-only motion:
    - `frontend/src/features/placement/wizard/steps/Step3PlantsToTrays.tsx`
    - `frontend/src/lib/gridkit/components/layouts/PlacementTentLayout.tsx`
  - Layout result:
    - tray/plant grid card height remains stable when selection toggles and destructive controls appear/disappear.

### 2026-02-19 (GridKit Phase 8 Cleanup + Guardrail Enforcement + Docs Finalization)
- `Completed` GridKit legacy cleanup and enforcement finished; legacy adapter paths were removed and checks now fail on regressions.
  - Removed legacy adapter path and naming:
    - deleted `frontend/src/lib/gridkit/components/adapters/*`
    - added canonical layout wrappers:
      - `frontend/src/lib/gridkit/components/layouts/OverviewTentLayout.tsx`
      - `frontend/src/lib/gridkit/components/layouts/PlacementTentLayout.tsx`
      - `frontend/src/lib/gridkit/components/layouts/PlacementShelfPreview.tsx`
  - Removed unused placement shim:
    - `frontend/src/features/placement/components/tent-slot-board.tsx`
  - Enforced GridKit guardrails:
    - `infra/scripts/check-gridkit-legacy.sh` now enforces by default (`--enforce`)
    - `package.json` now includes `pnpm guardrails`
    - `frontend:guardrails` now runs GridKit enforcement in addition to existing frontend checks
  - Inventory updates:
    - `infra/scripts/gridkit-inventory.sh` now reports `gridkit_layout_usages` and `remaining_legacy_adapter_refs`
    - tray overlay heuristic refined to targeted tray-overlay state patterns
  - Final GridKit guide:
    - `frontend/docs/gridkit.md`
  - Refs: `d30edd0`

### 2026-02-19 (GridKit Phase 7 Virtualization + Targeted Performance Pass)
- `Completed` GridKit performance baseline now includes reusable virtualization primitives plus thresholded tray-overlay plant-grid virtualization without DnD/behavior changes.
  - Added canonical virtual primitives:
    - `frontend/src/lib/gridkit/components/virtual/VirtualList.tsx`
    - `frontend/src/lib/gridkit/components/virtual/VirtualGrid.tsx`
    - `frontend/src/lib/gridkit/components/virtual/index.ts`
  - `TrayPlantGrid` now uses deterministic thresholding:
    - `plants.length <= 24`: static grid
    - `plants.length > 24`: `VirtualGrid` row virtualization (`base=2`, `sm=3`, `md=4`)
  - `TrayFolderOverlay` now keeps overlay framing/animation while delegating scroll-container ownership to `TrayPlantGrid` for virtualized and static modes.
  - Targeted rerender/perf updates:
    - memoized renderer/context setup in:
      - `frontend/src/lib/gridkit/components/adapters/LegacyOverviewTentLayoutAdapter.tsx`
      - `frontend/src/lib/gridkit/components/adapters/LegacyPlacementTentLayoutAdapter.tsx`
      - `frontend/src/lib/gridkit/components/adapters/LegacyPlacementShelfPreviewAdapter.tsx`
      - `frontend/src/lib/gridkit/renderers/PositionStripWithRenderers.tsx`
    - added `.perf-content-auto` utility and applied to GridKit card bodies:
      - `frontend/app/globals.css`
      - `frontend/src/lib/gridkit/components/containers/TentCard.tsx`
      - `frontend/src/lib/gridkit/components/containers/ShelfCard.tsx`
  - Inventory/guardrail reporting now includes:
    - `virtual_list_grid_usages`
    - `remaining_large_map_loops_in_scroll_containers`
  - Relevant files:
    - `frontend/src/lib/gridkit/components/grids/TrayPlantGrid.tsx`
    - `infra/scripts/gridkit-inventory.sh`
    - `infra/scripts/check-gridkit-legacy.sh`
  - Refs: `a3814f7`

### 2026-02-19 (GridKit Phase 6 Tray Folder Overlay Standardization)
- `Completed` Tray expansion now uses one GridKit folder-overlay system (Radix Popover + Framer Motion) with single-open coordination and renderer-context wiring.
  - Added canonical tray folder overlay primitives:
    - `frontend/src/lib/gridkit/components/overlays/TrayFolderOverlay.tsx`
    - `frontend/src/lib/gridkit/components/cells/TrayCellExpandable.tsx`
    - `frontend/src/lib/gridkit/components/grids/TrayPlantGrid.tsx`
  - Added single-open folder manager:
    - `frontend/src/lib/gridkit/state/trayFolderManager.tsx`
  - Renderer integration updates:
    - `GridRenderContext` now supports `trayFolder` configuration (`enabled`, `getPlantsForTray`, `onPlantPress`).
    - default tray renderer can switch between static tray cells and expandable tray-folder behavior.
  - Overview adapter migration:
    - `frontend/src/lib/gridkit/components/adapters/LegacyOverviewTentLayoutAdapter.tsx` now scopes `TrayFolderProvider` and renders tray/tray-stack cells as expandable overlays.
    - placement/other static tray surfaces remain non-expandable in this phase.
  - Inventory/guardrail reporting now includes:
    - `tray_folder_overlay_usages`
    - `tray_folder_ctx_usages`
    - `remaining_bespoke_tray_overlay_heuristics`
  - Relevant files:
    - `frontend/src/features/experiments/overview/ExperimentOverviewPageClient.tsx`
    - `frontend/src/lib/gridkit/renderers/defaultPositionRenderers.tsx`
    - `frontend/src/lib/gridkit/renderers/types.ts`
    - `infra/scripts/gridkit-inventory.sh`
    - `infra/scripts/check-gridkit-legacy.sh`
  - Refs: `4ce566c`

### 2026-02-19 (GridKit Phase 5 Canonical Leaf Cells + Renderer Registry + DnD Seams)
- `Completed` GridKit leaf rendering is now standardized around canonical slot/tray/plant cells and a shared occupant renderer registry.
  - Added canonical leaf cells:
    - `frontend/src/lib/gridkit/components/cells/SlotCell.tsx`
    - `frontend/src/lib/gridkit/components/cells/TrayCell.tsx`
    - `frontend/src/lib/gridkit/components/cells/PlantCell.tsx`
  - Added canonical renderer registry and wrapper:
    - `frontend/src/lib/gridkit/renderers/defaultPositionRenderers.tsx`
    - `frontend/src/lib/gridkit/renderers/PositionStripWithRenderers.tsx`
    - `frontend/src/lib/gridkit/renderers/types.ts`
  - Migrated all GridKit adapter shelf render paths to registry-driven rendering:
    - `frontend/src/lib/gridkit/components/adapters/LegacyOverviewTentLayoutAdapter.tsx`
    - `frontend/src/lib/gridkit/components/adapters/LegacyPlacementTentLayoutAdapter.tsx`
    - `frontend/src/lib/gridkit/components/adapters/LegacyPlacementShelfPreviewAdapter.tsx`
  - Added passive DnD metadata helpers and standardized leaf-cell `data-*` attributes (no active DnD context/hooks):
    - `frontend/src/lib/dnd/attributes.ts`
    - `frontend/src/lib/dnd/shells.tsx`
    - `frontend/src/lib/gridkit/components/CellChrome.tsx` (`dataAttributes` passthrough)
  - Inventory/guardrail reporting now includes:
    - `canonical_leaf_cell_usages`
    - `renderer_registry_usages`
    - `remaining_direct_renderPosition_lambdas`
    - `remaining_bespoke_leaf_cell_heuristics`
  - Relevant files:
    - `frontend/src/features/placement/components/placement-cells.tsx`
    - `frontend/src/features/placement/wizard/steps/Step2Trays.tsx`
    - `frontend/src/features/placement/wizard/steps/Step3PlantsToTrays.tsx`
    - `frontend/src/features/experiments/overview/ExperimentOverviewPageClient.tsx`
    - `frontend/src/features/experiments/recipes/ExperimentRecipesPageClient.tsx`
    - `frontend/src/features/experiments/recipes/components/RecipePanels.tsx`
    - `frontend/src/features/experiments/baseline/components/BaselinePanels.tsx`
    - `infra/scripts/gridkit-inventory.sh`
    - `infra/scripts/check-gridkit-legacy.sh`
  - Refs: `6e684cb`

### 2026-02-19 (GridKit Phase 4 PositionStrip Paging Standardization)
- `Completed` Shelf position paging is now standardized through one native scroll-snap primitive across tent/shelf adapters.
  - Added canonical `PositionStrip`:
    - `frontend/src/lib/gridkit/components/PositionStrip.tsx`
  - Added small reusable helpers:
    - `frontend/src/lib/collections/array.ts` (`chunkArray`)
    - `frontend/src/lib/hooks/usePrefersReducedMotion.ts`
    - `frontend/src/lib/hooks/usePointerCoarse.ts`
  - Migrated shelf-strip rendering to `PositionStrip` in:
    - `frontend/src/lib/gridkit/components/adapters/LegacyOverviewTentLayoutAdapter.tsx`
    - `frontend/src/lib/gridkit/components/adapters/LegacyPlacementTentLayoutAdapter.tsx`
    - `frontend/src/lib/gridkit/components/adapters/LegacyPlacementShelfPreviewAdapter.tsx`
  - `POSITION_STRIP_PRESET.maxVisible` is used as the paging size source (`4` positions per page).
  - Inventory/guardrail reporting now includes:
    - `position_strip_usages`
    - `remaining_legacy_shelf_strip_patterns`
  - Relevant files:
    - `frontend/src/lib/gridkit/components/index.ts`
    - `infra/scripts/gridkit-inventory.sh`
    - `infra/scripts/check-gridkit-legacy.sh`
  - Refs: `43c3f21`

### 2026-02-19 (GridKit Phase 3 Structural Container Standardization)
- `Completed` GridKit tent/shelf structural scaffolding was standardized with shared containers and adopted across legacy adapters and direct tent-wrapper callsites.
  - Added canonical structural container components:
    - `frontend/src/lib/gridkit/components/containers/TentGrid.tsx`
    - `frontend/src/lib/gridkit/components/containers/TentCard.tsx`
    - `frontend/src/lib/gridkit/components/containers/ShelfStack.tsx`
    - `frontend/src/lib/gridkit/components/containers/ShelfCard.tsx`
    - `frontend/src/lib/gridkit/components/containers/HeaderChips.tsx`
  - Adopted container primitives in GridKit adapters and Step 1 tent wrappers while preserving existing shelf-body content:
    - `LegacyOverviewTentLayoutAdapter`
    - `LegacyPlacementTentLayoutAdapter`
    - `LegacyPlacementShelfPreviewAdapter`
    - `Step1Tents`
  - GridKit inventory/guardrail reporting now includes:
    - `gridkit_container_callsites`
    - `remaining_bespoke_tent_shelf_wrappers`
  - Relevant files:
    - `frontend/src/lib/gridkit/components/index.ts`
    - `frontend/src/lib/gridkit/components/adapters/LegacyOverviewTentLayoutAdapter.tsx`
    - `frontend/src/lib/gridkit/components/adapters/LegacyPlacementTentLayoutAdapter.tsx`
    - `frontend/src/lib/gridkit/components/adapters/LegacyPlacementShelfPreviewAdapter.tsx`
    - `frontend/src/features/placement/wizard/steps/Step1Tents.tsx`
    - `infra/scripts/gridkit-inventory.sh`
    - `infra/scripts/check-gridkit-legacy.sh`
  - Refs: `1433ec6`

### 2026-02-19 (GridKit Phase 2 CellChrome Standardization)
- `Completed` GridKit cell chrome primitives were introduced and adopted across dense slot/tray/plant surfaces while preserving existing behavior.
  - Added canonical GridKit cell primitives:
    - `frontend/src/lib/gridkit/components/CellChrome.tsx`
    - `frontend/src/lib/gridkit/components/CellChips.tsx`
    - `frontend/src/lib/gridkit/components/CellText.tsx`
  - Migrated placement/recipes/overview/baseline and GridKit legacy-adapter cell shells from bespoke `article/div + role/key handlers + local chip overlays` to `CellChrome` + `CellChips`.
  - GridKit inventory/guardrail reporting now includes:
    - `CellChrome` and `CellChips` usage counts
    - remaining bespoke chip overlay heuristics
    - remaining bespoke cell shell heuristics
  - Relevant files:
    - `frontend/src/features/placement/components/placement-cells.tsx`
    - `frontend/src/features/placement/wizard/steps/Step2Trays.tsx`
    - `frontend/src/features/placement/wizard/steps/Step3PlantsToTrays.tsx`
    - `frontend/src/features/experiments/overview/ExperimentOverviewPageClient.tsx`
    - `frontend/src/features/experiments/recipes/ExperimentRecipesPageClient.tsx`
    - `frontend/src/features/experiments/recipes/components/RecipePanels.tsx`
    - `frontend/src/features/experiments/baseline/components/BaselinePanels.tsx`
    - `frontend/src/lib/gridkit/components/adapters/LegacyOverviewTentLayoutAdapter.tsx`
    - `frontend/src/lib/gridkit/components/adapters/LegacyPlacementShelfPreviewAdapter.tsx`
    - `frontend/src/lib/gridkit/components/adapters/LegacyPlacementTentLayoutAdapter.tsx`
    - `infra/scripts/gridkit-inventory.sh`
    - `infra/scripts/check-gridkit-legacy.sh`
  - Refs: `4759a05`

### 2026-02-19 (Frontend Phase 7 Consistency Lock-In + Final Cleanup)
- `Completed` Final consistency enforcement landed with legacy cleanup, guardrail expansion, and durable frontend architecture docs.
  - Legacy/dead code cleanup:
    - removed unused `backendFetch` export from `frontend/lib/backend.ts`
    - removed unused shim modules:
      - `frontend/src/lib/backend-errors.ts`
      - `frontend/src/lib/error-normalization.ts`
  - Guardrails expanded and aggregated:
    - `infra/scripts/check-no-filter-join-classnames.sh`
    - `pnpm frontend:no-filter-join-classnames`
    - `pnpm frontend:guardrails` (runs no-backendfetch + no-inline-querykeys + no-filter-join-classnames)
    - `infra/scripts/verify.sh` now runs `pnpm frontend:guardrails`
  - Final architecture docs added for future feature work:
    - `frontend/docs/page-patterns.md`
    - `frontend/docs/smoke-checks.md`
  - Shared UI class composition cleanup:
    - `ui-foundations`, `button`, and `icon-button` class assembly now uses `cn(...)`.
  - Relevant files:
    - `frontend/lib/backend.ts`
    - `frontend/src/components/ui/ui-foundations.ts`
    - `frontend/src/components/ui/button.tsx`
    - `frontend/src/components/ui/icon-button.tsx`
    - `infra/scripts/check-no-filter-join-classnames.sh`
    - `infra/scripts/verify.sh`
    - `frontend/docs/page-patterns.md`
    - `frontend/docs/smoke-checks.md`
    - `package.json`
  - Refs: `c1b3fb8`

### 2026-02-19 (Frontend Phase 6 Performance, Cache Tuning, and Guardrails)
- `Completed` Frontend controller outputs and high-churn render paths were stabilized, with targeted cache refresh behavior and an added query-key guardrail.
  - Stabilized controller return groups via `useMemo`/`useCallback` on core entry/checklist hooks:
    - `useHomeController`
    - `useExperimentsListController`
    - `useNewExperimentController`
    - `useExperimentLandingController`
    - `useExperimentSetupController`
  - Reduced placement rerender churn by memoizing dense reusable components and step surfaces:
    - `PlantSelectableCell`, `TraySelectableCell`, `TentSlotBoard`
    - `Step3PlantsToTrays`, `Step4TraysToSlots`
    - `usePlacementWizard` now returns stable grouped controller state (`ui`, `wizard`, `stepModels`, `stepActions`)
  - Tightened overview lifecycle mutation refresh behavior:
    - experiment-detail name load moved to React Query
    - start/stop mutation success updates status summary with `queryClient.setQueryData(...)`
    - invalidation narrowed to overview plant query key
  - Added a lightweight guardrail against ad-hoc inline query keys:
    - `infra/scripts/check-no-inline-querykeys.sh`
    - `pnpm frontend:no-inline-querykeys`
  - Relevant files:
    - `frontend/src/features/home/useHomeController.ts`
    - `frontend/src/features/experiments/list/useExperimentsListController.ts`
    - `frontend/src/features/experiments/new/useNewExperimentController.ts`
    - `frontend/src/features/experiments/landing/useExperimentLandingController.ts`
    - `frontend/src/features/experiments/setup/useExperimentSetupController.ts`
    - `frontend/src/features/experiments/overview/ExperimentOverviewPageClient.tsx`
    - `frontend/src/features/placement/wizard/usePlacementWizard.ts`
    - `frontend/src/features/placement/components/placement-cells.tsx`
    - `frontend/src/features/placement/components/tent-slot-board.tsx`
    - `frontend/src/features/placement/wizard/steps/Step3PlantsToTrays.tsx`
    - `frontend/src/features/placement/wizard/steps/Step4TraysToSlots.tsx`
    - `infra/scripts/check-no-inline-querykeys.sh`
    - `package.json`
  - Refs: `83d3103`

### 2026-02-19 (Frontend Phase 5 Utility Consolidation + Legacy Guardrails)
- `Completed` Shared frontend utility consolidation reduced repeated helper implementations and added a guardrail for legacy fetch reintroduction.
  - Added canonical helper modules:
    - `frontend/src/lib/collections/sets.ts`
    - `frontend/src/lib/state/drafts.ts`
    - `frontend/src/lib/errors/backendErrors.ts`
    - `frontend/src/lib/errors/normalizeError.ts`
    - `frontend/src/lib/format/labels.ts`
  - Migrated high-churn duplication callsites:
    - placement wizard selection + draft-change comparisons now use shared set/draft helpers
    - recipes selection + draft changesets now use shared set/draft helpers
    - placement/recipes/cockpit now share canonical recipe/tray label formatting
  - Canonical error imports now target `frontend/src/lib/errors/*` (shim modules were removed in Phase 7 after migration).
  - Added guardrail script and package entry to prevent `backendFetch` usage from returning in UI code:
    - `infra/scripts/check-no-backendfetch.sh`
    - `pnpm frontend:no-backendfetch`
  - Relevant files:
    - `frontend/src/lib/collections/sets.ts`
    - `frontend/src/lib/state/drafts.ts`
    - `frontend/src/lib/errors/backendErrors.ts`
    - `frontend/src/lib/errors/normalizeError.ts`
    - `frontend/src/lib/format/labels.ts`
    - `frontend/src/features/placement/utils.ts`
    - `frontend/src/features/placement/wizard/usePlacementWizard.ts`
    - `frontend/src/features/placement/wizard/steps/Step3PlantsToTrays.tsx`
    - `frontend/src/features/placement/wizard/steps/Step4TraysToSlots.tsx`
    - `frontend/src/features/experiments/recipes/ExperimentRecipesPageClient.tsx`
    - `frontend/src/features/experiments/recipes/utils.ts`
    - `frontend/src/features/plants/cockpit/PlantCockpitPageClient.tsx`
    - `package.json`
    - `infra/scripts/check-no-backendfetch.sh`
  - Refs: `2573746`

### 2026-02-19 (Frontend Phase 4 UI Modularization Rollout)
- `Completed` Core experiment operation clients now use feature-level panel modules with compact model/action contracts to reduce page-client bloat without UX changes.
  - Extracted panel modules and wiring landed for:
    - baseline (`BaselinePanels`)
    - feeding (`FeedingPanels`)
    - plants (`PlantsPanels`)
    - recipes (`RecipePanels`)
    - rotation (`RotationPanels`)
    - overview shared top sections (`OverviewPanels`)
  - Updated page clients now focus on orchestration and controller state wiring, while large JSX sections live in feature submodules under `frontend/src/features/experiments/*/components/`.
  - Stable `model/actions` handoff pattern (`useMemo` + `useCallback`) is now established across these pages to avoid prop explosion and unnecessary rerenders in dense grids/lists.
  - Relevant files:
    - `frontend/src/features/experiments/baseline/ExperimentBaselinePageClient.tsx`
    - `frontend/src/features/experiments/baseline/components/BaselinePanels.tsx`
    - `frontend/src/features/experiments/feeding/ExperimentFeedingPageClient.tsx`
    - `frontend/src/features/experiments/feeding/components/FeedingPanels.tsx`
    - `frontend/src/features/experiments/plants/ExperimentPlantsPageClient.tsx`
    - `frontend/src/features/experiments/plants/components/PlantsPanels.tsx`
    - `frontend/src/features/experiments/recipes/ExperimentRecipesPageClient.tsx`
    - `frontend/src/features/experiments/recipes/components/RecipePanels.tsx`
    - `frontend/src/features/experiments/rotation/ExperimentRotationPageClient.tsx`
    - `frontend/src/features/experiments/rotation/components/RotationPanels.tsx`
    - `frontend/src/features/experiments/overview/ExperimentOverviewPageClient.tsx`
    - `frontend/src/features/experiments/overview/components/OverviewPanels.tsx`
  - Refs: `81909ae`

### 2026-02-19 (Frontend Phase 3 Route Architecture Normalization)
- `Completed` Frontend route architecture now follows a thin-wrapper pattern across interactive app routes.
  - Route files under `frontend/app/**/page.tsx` are now thin server wrappers that parse route params via `getParamString(...)` and render feature `*PageClient` modules.
  - Interactive page implementations were moved out of route files into `frontend/src/features/**/**/*PageClient.tsx`.
  - Added controller-hook convention callsites for normalized page state ownership on core entry/checklist pages:
    - `useHomeController`
    - `useExperimentsListController`
    - `useNewExperimentController`
    - `useExperimentLandingController`
    - `useExperimentSetupController`
  - Existing placement wizard architecture remains canonical (`PlacementWizardPageClient` + `usePlacementWizard`).
  - Relevant files:
    - `frontend/app/page.tsx`
    - `frontend/app/experiments/page.tsx`
    - `frontend/app/experiments/new/page.tsx`
    - `frontend/app/experiments/[id]/page.tsx`
    - `frontend/app/experiments/[id]/setup/page.tsx`
    - `frontend/app/experiments/[id]/overview/page.tsx`
    - `frontend/app/experiments/[id]/baseline/page.tsx`
    - `frontend/app/experiments/[id]/feeding/page.tsx`
    - `frontend/app/experiments/[id]/plants/page.tsx`
    - `frontend/app/experiments/[id]/recipes/page.tsx`
    - `frontend/app/experiments/[id]/rotation/page.tsx`
    - `frontend/app/experiments/[id]/schedule/page.tsx`
    - `frontend/app/p/[id]/page.tsx`
    - `frontend/src/features/home/HomePageClient.tsx`
    - `frontend/src/features/experiments/**/**/*PageClient.tsx`
    - `frontend/src/features/plants/cockpit/PlantCockpitPageClient.tsx`
  - Refs: `bba6348`

### 2026-02-19 (Frontend Phase 2 Data Layer Migration)
- `Completed` Frontend server-state reads/writes were migrated from `backendFetch + useEffect` loading patterns to shared `api + @tanstack/react-query` usage across active experiment/cockpit routes.
  - Removed route-level `backendFetch(...)` callsites from `frontend/app/*` and `frontend/src/features/*`; the legacy helper was later removed in Phase 7.
  - Standardized query keys through `frontend/src/lib/queryKeys.ts` (including new `queryKeys.plant.cockpit(...)`) and removed ad-hoc inline query key arrays.
  - Migrated high-traffic pages to query/mutation flows with existing UX preserved:
    - experiment index/new/landing/setup
    - overview-adjacent operation pages (plants, recipes, rotation, feeding, schedule, baseline)
    - public plant cockpit (`/p/{id}`)
    - placement wizard controller hook (`usePlacementWizard`) load + mutation paths
  - Added/normalized query invalidation and fetch refresh behavior for sequential apply flows (placement, recipes, schedule, feeding) and upload flows (baseline/cockpit photos).
  - Relevant files:
    - `frontend/app/page.tsx`
    - `frontend/app/experiments/page.tsx`
    - `frontend/app/experiments/new/page.tsx`
    - `frontend/app/experiments/[id]/page.tsx`
    - `frontend/app/experiments/[id]/setup/page.tsx`
    - `frontend/app/experiments/[id]/baseline/page.tsx`
    - `frontend/app/experiments/[id]/feeding/page.tsx`
    - `frontend/app/experiments/[id]/plants/page.tsx`
    - `frontend/app/experiments/[id]/recipes/page.tsx`
    - `frontend/app/experiments/[id]/rotation/page.tsx`
    - `frontend/app/experiments/[id]/schedule/page.tsx`
    - `frontend/app/p/[id]/page.tsx`
    - `frontend/src/features/placement/wizard/usePlacementWizard.ts`
    - `frontend/src/lib/queryKeys.ts`
    - `frontend/lib/experiment-status.ts`
  - Refs: `ca8c706`, `61eeca4`, `ffa44d3`, `50ba5a9`

### 2026-02-19 (Frontend Phase 1.5 Mechanical Helper Rollout)
- `Completed` Frontend route/page conventions from Phase 1 were rolled out mechanically across the active experiment/cockpit pages without feature-flow changes.
  - Route-param parsing boilerplate (`params.id` with `string | string[]` checks) was standardized to `useRouteParamString("id")` for client pages and existing `getParamString(...)` wrapper usage for route wrappers.
  - Standard top-of-page status slabs were consolidated onto shared `PageAlerts` (loading/error/notice/offline/not-invited) where behavior mapped 1:1.
  - ClassName assembly in page-level JSX was normalized to `cn(...)`; className `[].join(" ")`/`filter(Boolean).join(" ")` patterns were removed from frontend page callsites.
  - Existing React Query usage on `overview` was normalized to generic `queryKeys.experiment.*` helpers (`status`, `feature`) and invalidations were updated to match.
  - Relevant files:
    - `frontend/app/experiments/page.tsx`
    - `frontend/app/experiments/new/page.tsx`
    - `frontend/app/experiments/[id]/page.tsx`
    - `frontend/app/experiments/[id]/overview/page.tsx`
    - `frontend/app/experiments/[id]/setup/page.tsx`
    - `frontend/app/experiments/[id]/plants/page.tsx`
    - `frontend/app/experiments/[id]/recipes/page.tsx`
    - `frontend/app/experiments/[id]/rotation/page.tsx`
    - `frontend/app/experiments/[id]/schedule/page.tsx`
    - `frontend/app/experiments/[id]/baseline/page.tsx`
    - `frontend/app/p/[id]/page.tsx`
    - `docs/agent-guidebook.md`
    - `docs/unified-project-notes.md`
  - Refs: `1b8d0c5`

### 2026-02-19 (Placement Wizard Modular Refactor)
- `Completed` Placement route was refactored into a thin wrapper plus modular wizard feature implementation without changing operator behavior.
  - Route wrapper now parses `searchParams.step` once and passes `initialStep` into the client orchestrator.
  - Added `frontend/src/features/placement/wizard/*` with `PlacementWizardPageClient`, `usePlacementWizard`, and step modules (`Step1Tents`, `Step2Trays`, `Step3PlantsToTrays`, `Step4TraysToSlots`).
  - Added shared generic workflow helpers:
    - `frontend/src/lib/async/useSavingAction.ts` (`ensureUnlocked`, `useSavingAction`)
    - `frontend/src/lib/errors/backendErrors.ts` (`parseBackendErrorPayload`)
  - Removed duplicate placement initial-load status fetch by reusing the first status payload.
  - Moved placement className join/filter patterns to `cn(...)` in extracted step modules and placement shared components.
  - Reused shared backend-error parsing on `recipes` as a bounded non-wizard adoption.
  - Relevant files:
    - `frontend/app/experiments/[id]/placement/page.tsx`
    - `frontend/src/features/placement/wizard/PlacementWizardPageClient.tsx`
    - `frontend/src/features/placement/wizard/usePlacementWizard.ts`
    - `frontend/src/features/placement/wizard/steps/Step1Tents.tsx`
    - `frontend/src/features/placement/wizard/steps/Step2Trays.tsx`
    - `frontend/src/features/placement/wizard/steps/Step3PlantsToTrays.tsx`
    - `frontend/src/features/placement/wizard/steps/Step4TraysToSlots.tsx`
    - `frontend/src/features/placement/components/placement-cells.tsx`
    - `frontend/src/features/placement/components/tent-slot-board.tsx`
    - `frontend/src/lib/async/useSavingAction.ts`
    - `frontend/src/lib/errors/backendErrors.ts`
    - `frontend/app/experiments/[id]/recipes/page.tsx`
    - `docs/agent-guidebook.md`
  - Refs: `e274b4e`, `92c3a55`, `cb1e288`

### 2026-02-18 (Placement Step 2 Mobile Tray Controls)
- `Completed` Placement Step 2 tray setup now uses staged mobile-first count/capacity controls.
  - Removed standalone `Add Tray` form and tray-delete icon flow from Step 2.
  - Added `+/-` tray count controls in the `Tray Manager` summary row.
  - Added in-card `+/-` controls for per-tray capacity drafting.
  - Placement Step 1 tent setup now uses shared `+/-` count controls in `Tent Manager` above tent shelf/slot layouts, replacing the standalone add-tent form flow.
  - Step 1 shelf add/remove controls were refactored to the same shared `+/-` count-toolbar primitive used by tent/tray manager toolbars.
  - Step 1 tent name/ID + restriction drafts now save through bottom `Save & Next`; per-tent `Save tent` actions were removed.
  - Shared step navigation now uses a dedicated primitive for all steps (`StepNavBar`), and blocker hints were moved into the bottom back/save-next bar.
  - `StepNavBar` now includes `Reset` to discard current-step draft changes.
  - Step 1 next/save gating is now draft-aware for shelf layouts, so unsaved valid tent-slot drafts are not blocked before `Save & Next`.
  - Step 1 shelf preview cards now auto-size to slot-cell rows (content-fit) rather than fixed minimum shelf widths.
  - Step 1 shelf preview lane now wraps shelf cards to new rows on narrow viewports.
  - Draft highlights now use shared primitives/styles across all 4 steps (`DraftChangeChip` + shared ring/dot draft markers on changed cards/cells).
  - Draft removal highlighting now marks affected container cells (source/destination tray/slot containers), not just moved item cells.
  - Draft highlighting was tightened to cell-level only (no toolbar highlighting); Step 2 tray removals now mark specific tray cells as pending removal.
  - Placement apply flow now uses shared bottom navigation save+advance behavior (`Save & Next`) when pending changes exist.
  - Draft-change chip now renders in the shared nav bar instead of per-step apply rows.
  - Relevant files:
    - `frontend/app/experiments/[id]/placement/page.tsx`
    - `frontend/src/components/ui/count-adjust-toolbar.tsx`
    - `frontend/src/components/ui/draft-change-chip.tsx`
    - `frontend/src/components/ui/draft-change-marker.tsx`
    - `frontend/src/components/ui/step-nav-bar.tsx`
    - `frontend/src/components/ui/step-adjust-button.tsx`
    - `docs/agent-guidebook.md`
    - `docs/unified-project-notes.md`
  - Refs: `0e9d52a`

### 2026-02-18 (Placement Shelf Container Hierarchy)
- `Completed` Placement Step 4 `Tent Slot Containers` now renders grouped shelf cells per tent (`Tent -> Shelf -> Slot/Tray`) instead of a single flat slot grid.
  - Shelf groups render as stacked rows per tent, and each shelf row presents slot/tray cells in a horizontal lane with overflow fallback.
  - Tent cards now use auto-fit sizing so two-up rendering occurs when space allows and stacks when constrained.
  - In two-up layout, shelf lanes target four visible slot/tray cells before horizontal scroll is needed.
  - Step 4 tent/shelf grid now renders directly on the step surface (outer section wrapper removed) to match Step 1 preview presentation.
  - Empty slot destination selection now toggles on repeat click (click selected slot again to clear destination).
  - Filled slots render tray cards directly so trays take the full slot footprint; empty slots retain `Slot x` + `Empty`.
  - Relevant files:
    - `frontend/app/experiments/[id]/placement/page.tsx`
    - `frontend/src/components/ui/experiments-styles.ts`
  - Refs: `c488672`, `7883f74`, `b89fb81`, `1cf39f5`, `2dec785`

### 2026-02-18 (Overview Shelf Row Orientation)
- `Completed` Overview shelf groups now render horizontally inside each tent card instead of vertical stacking.
  - Uses shared style-map layout (`overviewTentShelfStack`) with horizontal flow and narrow-screen overflow handling.
  - Relevant files:
    - `frontend/src/components/ui/experiments-styles.ts`
    - `docs/agent-guidebook.md`
    - `docs/unified-project-notes.md`
  - Refs: `2fc4d95`

### 2026-02-18 (Overview Slot Label Simplification)
- `Completed` Overview nested slot display now omits slot labels for filled slots while preserving labeled empty slot placeholders.
  - Filled slots render tray content directly to use full cell space.
  - Empty slots still show `Slot x` + `Empty` to preserve layout affordance.
  - Relevant files:
    - `frontend/app/experiments/[id]/overview/page.tsx`
    - `docs/agent-guidebook.md`
    - `docs/unified-project-notes.md`
  - Refs: `372922c`

### 2026-02-18 (Tailwind Drift Guardrails)
- `Completed` Lightweight repo guardrails were added to prevent migration regressions.
  - Added `infra/scripts/check-tailwind-drift.sh` plus root alias `pnpm frontend:tailwind-drift`.
  - Script checks:
    - CSS module imports in high-traffic routes (`frontend/app/experiments`, `frontend/app/p`)
    - `!important` usage
    - dynamic class interpolation patterns (`className={\`...\`}`, `bg-${...}` style utility interpolation)
    - legacy `gt-*` class token reintroduction
    - non-token hex literal and arbitrary utility counts against configurable thresholds
  - Removed unused styling keys from `experiments-styles` to reduce dead-style drift surface.
  - Relevant files:
    - `infra/scripts/check-tailwind-drift.sh`
    - `package.json`
    - `frontend/src/components/ui/experiments-styles.ts`
    - `docs/agent-guidebook.md`
    - `docs/unified-project-notes.md`
    - `docs/ui-tailwind-migration-audit.md`
  - Refs: `f32a672`

### 2026-02-18 (Primitive Drift Consolidation)
- `Completed` Duplicate route-level UI primitive patterns were consolidated behind shared components.
  - Added shared `TooltipIconButton` and replaced route-local icon+tooltip wrappers in placement/recipes.
  - Added shared `NativeSelect` and replaced route-local native select class usage in experiment and cockpit routes.
  - Replaced route-level raw Radix popover composition with shared `popover` wrapper in cockpit.
  - Removed unused `frontend/src/components/ui/select.tsx`.
  - Relevant files:
    - `frontend/src/components/ui/tooltip-icon-button.tsx`
    - `frontend/src/components/ui/native-select.tsx`
    - `frontend/src/components/ui/select.tsx` (removed)
    - `frontend/app/experiments/[id]/recipes/page.tsx`
    - `frontend/app/experiments/[id]/placement/page.tsx`
    - `frontend/app/p/[id]/page.tsx`
    - `frontend/src/components/ui/ResponsiveList.tsx`
  - Refs: `acb0531`
- `Completed` Route-level button class wrestling and styling overrides were removed.
  - `buttonVariants` now owns border styling for `default`/`secondary`/`destructive`.
  - Route-level `cn(buttonVariants(...), "border border-border")` usage was removed.
  - Placement-specific `styles.buttonChrome` indirection was removed from style maps and callsites.
  - Success/status text now uses shared `Notice` in core operator routes instead of ad-hoc `text-emerald-*` classes.
  - Relevant files:
    - `frontend/src/components/ui/button.tsx`
    - `frontend/src/components/ui/experiments-styles.ts`
    - `frontend/app/experiments/[id]/overview/page.tsx`
    - `frontend/app/experiments/[id]/baseline/page.tsx`
    - `frontend/app/experiments/[id]/feeding/page.tsx`
    - `frontend/app/experiments/[id]/rotation/page.tsx`
    - `frontend/app/experiments/[id]/schedule/page.tsx`
    - `frontend/app/experiments/[id]/plants/page.tsx`
    - `frontend/app/experiments/[id]/recipes/page.tsx`
    - `frontend/app/experiments/[id]/placement/page.tsx`
    - `frontend/app/p/[id]/page.tsx`
  - Refs: `251b6fa`

### 2026-02-18 (Tailwind Migration Straggler Removal)
- `Completed` Remaining frontend styling stragglers were removed to lock a Tailwind-first scan-safe baseline.
  - Removed route/component CSS modules and migrated surfaces to shared primitives + utility classes.
  - Removed remaining inline style objects in overview slot grid rendering by switching to static lookup classes.
  - Runtime stylesheet scope now stays within `globals.css`, `tokens.css`, and `tailwind-theme.css`.
  - Added explicit audit-time `rg` verification commands/results for legacy pattern checks.
  - Relevant files:
    - `frontend/app/page.tsx`
    - `frontend/app/offline/page.tsx`
    - `frontend/app/experiments/[id]/overview/page.tsx`
    - `frontend/src/components/AppMarkPlaceholder.tsx`
    - `frontend/src/components/IllustrationPlaceholder.tsx`
    - `frontend/src/components/ui/OfflineBanner.tsx`
    - `frontend/app/page.module.css` (removed)
    - `frontend/app/offline/page.module.css` (removed)
    - `frontend/src/components/AppMarkPlaceholder.module.css` (removed)
    - `frontend/src/components/IllustrationPlaceholder.module.css` (removed)
    - `frontend/src/components/ui/OfflineBanner.module.css` (removed)
    - `docs/ui-tailwind-migration-audit.md`
  - Refs: `f45f670`

### 2026-02-18 (Tailwind A11y + Mobile Interaction Polish)
- `Completed` Shared UI primitives and state styles were tuned for keyboard visibility, touch ergonomics, and dark-theme contrast.
  - Strengthened focus-visible behavior across selectable cell patterns and Radix menu/popover primitives.
  - Standardized selected states with ring + surface treatment for cell/list interactions.
  - Raised baseline touch target sizing for shared controls:
    - `Button` (`h-10` default, `h-11` large)
    - `IconButton` (`h-11 w-11` default, `h-10 w-10` compact minimum)
    - `Input` + `NativeSelect` (`h-10`)
  - Replaced low-contrast success chip styling in experiment style maps with semantic success tokens.
  - Added manual smoke-check runbook for keyboard and mobile validation.
  - Relevant files:
    - `frontend/src/components/ui/ui-foundations.ts`
    - `frontend/src/components/ui/button.tsx`
    - `frontend/src/components/ui/icon-button.tsx`
    - `frontend/src/components/ui/input.tsx`
    - `frontend/src/components/ui/native-select.tsx`
    - `frontend/src/components/ui/dropdown-menu.tsx`
    - `frontend/src/components/ui/popover.tsx`
    - `frontend/src/components/ui/tabs.tsx`
    - `frontend/src/components/ui/experiments-styles.ts`
    - `frontend/app/experiments/[id]/placement/page.tsx`
    - `docs/ui-tailwind-smoke.md`
  - Refs: `8662a1c`

### 2026-02-18 (Tailwind Primitive Backbone Stabilization)
- `Completed` Shared Tailwind primitive foundation and variant conventions were consolidated to make route work token-first by default.
  - Added shared primitive foundations for interaction, controls, surfaces, and selectable states.
  - Core primitive variant naming aligned across `button`, `badge/chip`, `notice`, `icon-button`, `panel-surface`, and `dense-selectable-cell`.
  - Shared shells (`PageShell`, `SectionCard`, `StickyActionBar`) now consume the same surface variant system.
  - `input`/`textarea`/`select` now share a single token-driven control base class.
  - Unused `frontend/src/styles/theme.css` removed to keep token/theme authority in `tokens.css` + `tailwind-theme.css`.
  - Relevant files:
    - `frontend/src/components/ui/ui-foundations.ts`
    - `frontend/src/components/ui/button.tsx`
    - `frontend/src/components/ui/badge.tsx`
    - `frontend/src/components/ui/notice.tsx`
    - `frontend/src/components/ui/icon-button.tsx`
    - `frontend/src/components/ui/panel-surface.tsx`
    - `frontend/src/components/ui/dense-selectable-cell.tsx`
    - `frontend/src/components/ui/toolbar-row.tsx`
    - `frontend/src/components/ui/PageShell.tsx`
    - `frontend/src/components/ui/SectionCard.tsx`
    - `frontend/src/components/ui/StickyActionBar.tsx`
    - `frontend/src/components/ui/input.tsx`
    - `frontend/src/components/ui/textarea.tsx`
    - `frontend/src/components/ui/select.tsx`
    - `frontend/src/components/ui/card.tsx`
    - `frontend/src/styles/tokens.css`
    - `frontend/src/styles/tailwind-theme.css`
    - `frontend/src/styles/theme.css` (removed)
  - Refs: `5aa8f26`

### 2026-02-13 (Foundation)
- `Completed` Backend stack foundation: Django + DRF + Postgres.
  - Relevant files: `backend/pyproject.toml`, `backend/api/`, `backend/growtriallab/`
  - Refs: `d1268cc7`, `fddd4d07`, `fe4128f6`
- `Completed` Frontend stack foundation: Next.js App Router + TypeScript.
  - Relevant files: `frontend/app/`, `frontend/package.json`
  - Refs: `d1268cc7`, `948a8a7a`, `53ace4f8`
- `Completed` Local runtime and basic verification flow.
  - Relevant files: `docker-compose.yml`, `infra/scripts/verify.sh`
  - Refs: `d1268cc7`, `0a2e3228`
- `Completed` Cloudflare Access invite-only auth model.
  - Relevant files: `backend/api/middleware.py`, `backend/api/views.py`, `backend/api/models.py`
  - Refs: `262849c8`, `5d5ee41d`, `bba65cd9`, `f00306e5`
- `Completed` Media storage and dark/mobile-first UI baseline.
  - Relevant files: `backend/growtriallab/settings.py`, `frontend/app/globals.css`
  - Refs: `5cd1e423`, `097da4cc`, `39297c07`, `ee6bc25e`

### 2026-02-14 (Core Workflow Expansion)
- `Completed` LAN-safe same-origin frontend API proxy model.
  - Relevant files: `frontend/next.config.ts`, frontend route fetch calls under `frontend/app/`
  - Refs: `244c69c5`
  - Notes: trailing-slash-sensitive DRF route behavior preserved.
- `Completed` Setup/Overview model finalized:
  - setup bootstrap-only, overview as steady-state hub.
  - Relevant files: `frontend/app/experiments/[id]/page.tsx`, `frontend/app/experiments/[id]/setup/page.tsx`, `frontend/app/experiments/[id]/overview/page.tsx`
  - Refs: `f2b49938`, `c61be2e7`, `310f00b5`, `41599236`, `669ae104`
- `Completed` Status summary as canonical readiness contract.
  - Relevant files: `backend/api/status_views.py`
  - Route: `GET /api/v1/experiments/{id}/status/summary`
  - Refs: `ee000fab`, `c8b7db72`, `d302abd6`
- `Completed` Lifecycle primitives:
  - `draft -> running -> stopped`, with start/stop endpoints.
  - Relevant files: `backend/api/status_views.py`, `backend/api/models.py`
  - Routes: `POST /api/v1/experiments/{id}/start`, `POST /api/v1/experiments/{id}/stop`
  - Refs: `8f3f79c8`, `f9cb600a`, `dd7a6279`, `b86db9f1`
- `Completed` Placement MVP with tray composition and constraints.
  - Relevant files: `backend/api/placement_views.py`, `frontend/app/experiments/[id]/placement/page.tsx`
  - Routes: placement summary, auto-place, tray CRUD/plant assignment
  - Refs: `47eef321`, `b86db9f1`
- `Completed` Rotation MVP (running-only tray movement logging).
  - Relevant files: `backend/api/rotation_views.py`, `frontend/app/experiments/[id]/rotation/page.tsx`
  - Routes: rotation summary/log
  - Refs: `3b52663c`, `9798c9fe`, `ec06d079`, `b80218ae`
- `Completed` Feeding MVP (running-only queue + feed log).
  - Relevant files: `backend/api/feeding_views.py`, `frontend/app/experiments/[id]/feeding/page.tsx`
  - Routes: queue, feed write, recent feed history
  - Refs: `90aa50fb`, `af3c5c71`, `6146269d`
- `Completed` Schedule MVP (timeframe/exact-time grouped plan).
  - Relevant files: `backend/api/schedule_views.py`, `frontend/app/experiments/[id]/schedule/page.tsx`
  - Routes: schedules CRUD + plan
  - Refs: `de03652d`, `4a775bfe`
- `Completed` Tray-canonical recipe assignment and feed/readiness locking. (Superseded by 2026-02-17 plant-canonical refactor.)
  - Relevant files: `backend/api/feeding_views.py`, `backend/api/status_views.py`, `backend/api/overview_views.py`
  - Refs: `fec05082`, `a3fd3a1d`
- `Completed` Multi-tent hierarchy + species restriction enforcement.
  - Relevant files: `backend/api/tents_views.py`, `backend/api/placement_views.py`, `backend/api/rotation_views.py`
  - Refs: `cd9e2cf6`, `4e74e10d`, `8157c551`
- `Completed` Placement/rotation polish:
  - restriction-aware destination filtering, tray capacity, deterministic auto-place diagnostics.
  - Relevant files: `backend/api/placement_views.py`, placement/rotation frontend pages
  - Refs: `35513ef9`, `ee65db44`, `edcc4142`
- `Completed` Baseline workflow and metric template integration.
  - Relevant files: `backend/api/baseline_views.py`, `backend/api/models.py`, `frontend/app/experiments/[id]/baseline/page.tsx`
  - Routes: baseline status/queue, plant baseline get/save, baseline lock
  - Refs: `5571d379`, `2f919969`, `d0467ff4`, `4e599540`
  - Notes: lock behavior is UI guardrail oriented in current model.
- `Completed` Plant QR and cockpit workflow.
  - Relevant files: `frontend/app/p/[id]/page.tsx`, `backend/api/cockpit_views.py`, `backend/api/plants_views.py`
  - Routes: `/p/{uuid}`, `GET /api/v1/plants/{uuid}`, `GET /api/v1/plants/{uuid}/cockpit`
  - Refs: `7352300e`, `c8aa364c`, `6e26cb27`, `2ff247c6`, `3ae322ad`
- `Completed` Plant replacement chain model/workflow.
  - Relevant files: `backend/api/plants_views.py`, `backend/api/models.py`
  - Route: `POST /api/v1/plants/{uuid}/replace`
  - Refs: `20032471`, `eea577e4`, `153922e9`, `e0800082`, `74506afa`, `325a7667`, `9169ace1`
- `Completed` PWA baseline (custom SW, offline fallback).
  - Relevant files: `frontend/public/sw.js`, `frontend/public/manifest.webmanifest`, `frontend/app/offline/page.tsx`
  - Refs: `f4e4b310`, `fe398ba3`, `e932c093`

### 2026-02-16 (Contract Canonicalization)
- `Completed` Envelope/location/diagnostics contract cleanup and slot/grade canonicalization.
  - Relevant files: `backend/api/contracts.py`, `backend/api/*_views.py`, frontend experiment pages
  - Refs: `9c5bc38`, `d5b76ba`
- `Completed` Plant setup quality pass with species preset helper.
  - Relevant files: `frontend/app/experiments/[id]/plants/page.tsx`
  - Refs: `53ace4f8`, `9c5bc38`
  - Notes: manual fallback preserved.

### 2026-02-17 (Data Layer + Testing Modernization)
- `Completed` React Query migration foundations + overview page migration.
  - Relevant files: `frontend/src/lib/queryKeys.ts`, `frontend/src/lib/api.ts`, `frontend/src/lib/usePageQueryState.ts`, `frontend/app/experiments/[id]/overview/page.tsx`
  - Refs: `e8aa02c`, `d08a56f`, `fd3fadf`
- `Completed` Testing modernization:
  - pytest scaffold/config, dev-auth test path alignment, monolith test split, verifier update.
  - Relevant files:
    - `backend/pytest.ini`
    - `backend/tests/`
    - `backend/growtriallab/test_settings.py`
    - `infra/scripts/verify.sh`
  - Refs: `584921e`, `0da774e`, `a2b9a22`, `ae1c0a9`
  - Notes: legacy per-test middleware override removed; contract tests now split by domain behavior.
- `Completed` Verification toolchain alignment:
  - Backend linting/type checks standardized on `ruff` + `pyright`.
  - Frontend type checks standardized on `pnpm run typecheck`.
  - Relevant files:
    - `backend/pyproject.toml`
    - `backend/uv.lock`
    - `frontend/package.json`
    - `frontend/tsconfig.json`
    - `package.json`
  - Refs: `a33467c`, `c34f94a`
- `Completed` Plant-canonical recipe assignment refactor:
  - `Plant.assigned_recipe` is now the only source of truth for recipe assignment.
  - Tray-level recipe field/logic removed; readiness and feeding blockers now use missing plant recipe assignment.
  - Relevant files:
    - `backend/api/models.py`
    - `backend/api/status_summary.py`
    - `backend/api/feeding_views.py`
    - `backend/api/overview_views.py`
    - `backend/api/cockpit_views.py`
    - `backend/api/schedules.py`
    - `frontend/app/experiments/[id]/overview/page.tsx`
    - `frontend/app/experiments/[id]/feeding/page.tsx`
    - `frontend/app/experiments/[id]/schedule/page.tsx`
    - `frontend/app/experiments/[id]/placement/page.tsx`
    - `frontend/app/p/[id]/page.tsx`
  - Refs: `192d4e5`, `bc90c64`, `36ba433`
- `Completed` Assignment API ergonomics and tray convenience apply endpoint:
  - `PATCH /api/v1/plants/{id}` accepts `assigned_recipe_id` for per-plant set/clear assignment.
  - `POST /api/v1/trays/{id}/plants/apply-recipe` bulk-applies a recipe to active tray plants and returns envelope summary.
  - Placement summary plant rows now include nested `assigned_recipe`.
  - Relevant files:
    - `backend/api/viewsets.py`
    - `backend/api/serializers.py`
    - `backend/api/placement_views.py`
    - `backend/api/urls.py`
    - `backend/tests/test_recipe_assignment.py`
    - `backend/tests/test_location_payloads.py`
  - Refs: `192d4e5`, `59a5003`, `36ba433`
- `Completed` Frontend per-plant recipe UX alignment:
  - Route and navigation moved from `/experiments/{id}/assignment` to `/experiments/{id}/recipes` (legacy assignment route removed).
  - Placement page now remains physical-location focused (plants/trays/slots only); recipe assignment UI lives on `/experiments/{id}/recipes`.
  - Recipes page now uses tray-grouped plant cell grids + draft per-plant mapping with explicit save (`PATCH /api/v1/experiments/{id}/plants/recipes`), plus compact multi-select recipe delete cells.
  - Overview roster now renders as nested `Tent -> Slot -> Tray -> Plant` containers with compact centered plant cells and per-plant status chips (grade, recipe, non-active state), and cockpit surfaces continue to show inline recipe status/change controls.
  - Overview `Experiment State` now owns readiness counters + operations controls with dynamic chips (green at zero), while the former `Readiness` card is streamlined to `Schedule` and now hosts the schedule navigation action.
  - Overview nav controls now apply primary styling only when linked workflows have pending actions, and `Start` stays disabled until readiness requirements are satisfied.
  - Overview tent/slot/tray/plant nested grid now drops fixed slot-column minimum widths and applies mobile-specific compact sizing so portrait phone layouts avoid horizontal overflow.
  - Overview tent cards are top-aligned/content-sized and slot maps now render by real shelf/slot indices to prevent uneven vertical spacing while preserving true tent row/column layout.
  - Relevant files:
    - `frontend/app/experiments/[id]/recipes/page.tsx`
    - `frontend/app/experiments/[id]/placement/page.tsx`
    - `frontend/app/experiments/[id]/overview/page.tsx`
    - `frontend/app/experiments/[id]/setup/page.tsx`
    - `frontend/app/p/[id]/page.tsx`
    - `frontend/app/experiments/experiments.module.css`
    - `frontend/app/p/[id]/page.module.css`
  - Refs: `bc90c64`, `adbd34f`
- `Completed` Placement minified grid staging workflow:
  - Placement now uses compact multi-select plant cells for unplaced and tray containers.
  - Bulk move/remove actions are staged in UI and applied only via explicit save/confirm.
  - Save computes membership diffs from persisted vs staged tray mappings and applies deterministic remove-then-add backend mutations.
  - Relevant files:
    - `frontend/app/experiments/[id]/placement/page.tsx`
    - `frontend/app/experiments/experiments.module.css`
  - Refs: local workspace (uncommitted changes)
- `Completed` Placement wizard consolidation (`/slots` merged into `/placement`):
  - Placement is now a 4-step in-page flow: Tents+Slots -> Trays+Capacity -> Plants->Trays -> Trays->Slots.
  - Slot setup operations moved into Placement Step 1 and `/slots` route removed from frontend navigation.
  - Setup/rotation/schedule links now direct tent/slot edits to Placement Step 1.
  - Step navigation keeps Step 1 forward-only (no Back) and uses a final-step gated action to return to Overview.
  - Relevant files:
    - `frontend/app/experiments/[id]/placement/page.tsx`
    - `frontend/app/experiments/[id]/setup/page.tsx`
    - `frontend/app/experiments/[id]/rotation/page.tsx`
    - `frontend/app/experiments/[id]/schedule/page.tsx`
    - `frontend/app/experiments/[id]/slots/page.tsx` (removed)
    - `frontend/app/experiments/experiments.module.css`
  - Refs: local workspace (uncommitted changes)
- `Completed` CSS Phase 3 unification sweep (Tailwind prep, no Tailwind yet):
  - Rebased UI spacing/radius usage onto a compact token ladder with shared density controls for mobile/desktop consistency.
  - Added shared layout shells (`gt-page`, `gt-section`, `gt-card`, `gt-panel`, `gt-toolbar`) and rewired route/component CSS spacing declarations to token-only values.
  - Kept experiments route CSS focused on page geometry/state styling while shared primitives remain centralized in `frontend/src/styles/primitives.css`.
  - Report:
    - `docs/ui-css-phase3-report.md`
  - Refs: `fff2eef`
- `Completed` CSS Phase 3 spacing regression stabilization:
  - Fixed global spacing collapse caused by an invalid `--gt-density` expression that broke shared `var(--gt-space-*)` declarations.
  - Updated token pipeline to base spacing (`--gt-space-base-*`) + single-pass scaled spacing (`--gt-space-*`) with unitless default density and compact mobile floor.
  - Relevant files:
    - `frontend/src/styles/tokens.css`
    - `docs/ui-css-phase3-report.md`
  - Refs: `7a8cb8a`

- `Completed` Tailwind + shadcn-style Phase S scaffold (no broad migration yet):
  - Added minimal Tailwind config for migration scaffolding:
    - `frontend/tailwind.config.ts`
  - Added CSS-first theme bridge:
    - `frontend/src/styles/tailwind-theme.css`
  - Added shadcn/ui-style scaffolding:
    - `frontend/components.json`
    - `frontend/src/lib/utils.ts`
    - `frontend/src/components/ui/button.tsx`
    - `frontend/src/components/ui/badge.tsx`
    - `frontend/src/components/ui/card.tsx`
    - `frontend/src/components/ui/dialog.tsx`
  - Expanded probe route to render scaffold primitives:
    - `frontend/app/tailwind-probe/page.tsx`
  - Refs: `b2010d9`

- `Completed` Tailwind migration baseline component expansion + shared layout utility pivot:
  - Added missing shadcn-style primitives for form/nav/overlay/scroll coverage under `frontend/src/components/ui/` (`input`, `textarea`, `select`, `tabs`, `tooltip`, `dropdown-menu`, `popover`, `separator`, `scroll-area`).
  - Reworked shared shells/lists to Tailwind-first JSX utilities and removed their route-agnostic CSS modules (`PageShell`, `SectionCard`, `StickyActionBar`, `ResponsiveList`).
  - Relevant files:
    - `frontend/src/components/ui/PageShell.tsx`
    - `frontend/src/components/ui/SectionCard.tsx`
    - `frontend/src/components/ui/StickyActionBar.tsx`
    - `frontend/src/components/ui/ResponsiveList.tsx`
    - `frontend/src/components/ui/input.tsx`
    - `frontend/src/components/ui/textarea.tsx`
    - `frontend/src/components/ui/select.tsx`
    - `frontend/src/components/ui/tabs.tsx`
    - `frontend/src/components/ui/tooltip.tsx`
    - `frontend/src/components/ui/dropdown-menu.tsx`
    - `frontend/src/components/ui/popover.tsx`
    - `frontend/src/components/ui/separator.tsx`
    - `frontend/src/components/ui/scroll-area.tsx`
  - Refs: local workspace (this change)

- `Completed` Tailwind-first route migration and legacy CSS retirement:
  - Migrated target routes to Tailwind/shadcn-first styling while preserving existing behavior/workflow contracts:
    - `/experiments/{id}/overview`
    - `/experiments/{id}/recipes`
    - `/experiments/{id}/placement`
    - `/experiments/{id}/baseline`
    - `/experiments/{id}/feeding`
    - `/experiments/{id}/rotation`
    - `/experiments/{id}/schedule`
    - `/experiments/{id}/setup` (+ supporting setup flows: plants/create/list)
    - `/p/{id}` cockpit
  - Removed legacy style layers:
    - `frontend/app/experiments/experiments.module.css` (deleted)
    - `frontend/app/p/[id]/page.module.css` (deleted)
    - `frontend/src/styles/primitives.css` (deleted)
  - Added shared Tailwind-first style maps/pattern primitives for dense-grid and panel/toolbar reuse:
    - `frontend/src/components/ui/experiments-styles.ts`
    - `frontend/src/components/ui/cockpit-styles.ts`
    - `frontend/src/components/ui/icon-button.tsx`
    - `frontend/src/components/ui/table-shell.tsx`
    - `frontend/src/components/ui/skeleton.tsx`
    - `frontend/src/components/ui/empty-state.tsx`
    - `frontend/src/components/ui/notice.tsx`
    - `frontend/src/components/ui/panel-surface.tsx`
    - `frontend/src/components/ui/toolbar-row.tsx`
    - `frontend/src/components/ui/dense-selectable-cell.tsx`
  - Refs: local workspace (uncommitted changes)

- `Completed` Frontend dev cache hygiene for `.next` permission safety:
  - Added preflight script:
    - `frontend/scripts/prepare-dev-cache.mjs`
  - Updated dev command to run preflight before `next dev`:
    - `frontend/package.json`
  - Isolated frontend build cache in Docker with `/app/.next` volume:
    - `docker-compose.yml`
  - Refs: `b2010d9`

- `Completed` CSS Phase 2 drift-reduction sweep (Tailwind prep, no Tailwind yet):
  - Migrated setup/rotation/feeding/schedule/cockpit + experiment list/create/plants pages to shared `gt-*` primitives for repeated buttons/forms/notices/chips/cell scaffolds.
  - Reduced cockpit module primitives to route-specific layout rules and removed duplicated popover/chip/hidden-input primitives.
  - Reduced `experiments.module.css` primitive duplication by removing top-level shared button/form/text blocks now provided by `frontend/src/styles/primitives.css`.
  - Added shared modal/popover/visually-hidden helpers:
    - `frontend/src/styles/primitives.css`
  - Report:
    - `docs/ui-css-phase2-report.md`
  - Refs: local workspace (uncommitted changes)

- `Completed` CSS Phase 1 token/primitives cleanup (Tailwind prep, no Tailwind yet):
  - Added shared design tokens and a small global primitive layer to reduce module drift while preserving the existing dark/material look.
  - Placement and Recipes were rewired first (with Overview/Baseline plus shared button/form/tooltip primitive adoption) to use shared `gt-*` surface/grid/cell primitives and attribute-driven cell sizing (`data-cell-size="sm|md|lg"`).
  - Relevant files:
    - `frontend/src/styles/tokens.css`
    - `frontend/src/styles/primitives.css`
    - `frontend/app/layout.tsx`
    - `frontend/app/experiments/[id]/placement/page.tsx`
    - `frontend/app/experiments/[id]/recipes/page.tsx`
    - `frontend/app/experiments/[id]/overview/page.tsx`
    - `frontend/app/experiments/[id]/baseline/page.tsx`
    - `frontend/app/experiments/experiments.module.css`
    - `docs/ui-css-phase1-report.md`
  - Refs: local workspace (uncommitted changes)
- `Completed` Baseline capture UX compact-grid update:
  - Capture controls now render above queue; queue now uses compact plant cells where selecting any cell activates that plant in the capture panel.
  - Queue cells keep a square minimum-height footprint to prevent row misalignment when content density changes.
  - Baseline v2 now uses fixed species-aware 1-5 sliders persisted in `metrics.baseline_v1`.
  - Auto-grade uses backend-deterministic scoring with guardrails; manual override persists `grade_source` and selected grade.
  - Auto-`A` gate was tightened so `A` aligns closer to ~4/5 average slider outcomes.
  - First-capture slider state now defaults to neutral `3` values.
  - Slider cards now use concise single-word descriptor labels rendered below each slider with small single-line species-aware metric titles and no per-slider helper text lines.
  - Top-row baseline save action remains visible and adapts label/state:
    - `Save & Next` while uncaptured plants remain.
    - `Save` for already-captured selected plants.
    - disabled for no selected plant/read-only/no-op edits on already-captured selections.
  - Baseline photo retrieval is now deterministic and non-paginated for capture UI:
    - `GET /api/v1/experiments/{id}/baseline/queue` rows include `baseline_photo`.
    - `GET /api/v1/plants/{id}/baseline` includes `baseline_photo`.
    - Baseline page thumbnail recall now uses those payloads instead of scanning `/api/v1/photos`.
  - Baseline captures now persist a deterministic timestamp metric (`metrics.baseline_v1.captured_at`) and expose `baseline_captured_at` in queue/detail payloads for UI recall.
  - Baseline capture UI shows a compact `Last baseline capture` timestamp per selected plant directly beneath grade controls/chip row.
  - Baseline queue chips now show baseline capture state only (`No baseline`/`Captured`), with `Captured` rendered green and chip placement anchored at the bottom of each queue cell.
  - Baseline photo upload remains available per selected plant using baseline tag + week 0 metadata, with inline thumbnail preview and persistent `No media` empty-state cell.
  - Baseline file selector button/text are themed to match existing monochrome input/button styles.
  - `GET/POST /api/v1/plants/{id}/baseline` now roundtrip `metrics.baseline_v1` + top-level `grade_source`.
  - Relevant files:
    - `backend/api/baseline_grade.py`
    - `backend/api/baseline_views.py`
    - `backend/api/serializers.py`
    - `backend/tests/test_baseline_v2.py`
    - `frontend/app/experiments/[id]/baseline/page.tsx`
    - `frontend/app/experiments/experiments.module.css`
  - Refs: local workspace (uncommitted changes)

## In Progress Features

| Area | Feature | Status | Relevant files/routes | Commit refs | Notes |
| --- | --- | --- | --- | --- | --- |
| Frontend data layer | Expand React Query + RHF/Zod migration beyond Overview | In Progress | `frontend/app/experiments/[id]/baseline/page.tsx`, `frontend/app/experiments/[id]/placement/page.tsx`, `frontend/app/experiments/[id]/rotation/page.tsx`, `frontend/app/experiments/[id]/feeding/page.tsx`, `frontend/app/experiments/[id]/schedule/page.tsx` | `e8aa02c`, `d08a56f`, `fd3fadf` | Foundations exist; additional page-by-page migrations pending. |
| Overview UX | Stabilize action tiles into runbook-like operator workflow | In Progress | `frontend/app/experiments/[id]/overview/page.tsx` | `d08a56f` | Keep Overview as primary launchpad; avoid navigation sprawl reintroduction. |
| Baseline policy | Tighten baseline completion criterion from MVP threshold to stricter all-active coverage | In Progress | `backend/api/status_views.py`, `backend/api/baseline_views.py` | `2f919969`, `d0467ff4`, `4e599540` | Current model is intentionally less strict than likely final policy. |
| Metric governance | Expand metric template governance/migration strategy | In Progress | `backend/api/models.py` (`MetricTemplate`), `backend/api/viewsets.py` (`MetricTemplateViewSet`) | `5571d379` | Needs clearer versioning and category coverage plan. |
| Photo workflows | Expand beyond cockpit inline upload to broader review/report flows | In Progress | `frontend/app/p/[id]/page.tsx`, `frontend/app/experiments/[id]/overview/page.tsx`, `/api/v1/photos` | `6e26cb27`, `2ff247c6`, `3ae322ad` | Cockpit baseline is implemented; larger media UX remains. |
| Verification governance | Define explicit version-pinned local/CI verification matrix | In Progress | `README.md`, `infra/scripts/verify.sh` | `0a2e3228`, `ae1c0a9`, `a33467c` | Commands exist; matrix policy documentation is incomplete. |

## Not Started Features

| Area | Feature | Status | Relevant files/routes | Commit refs | Notes |
| --- | --- | --- | --- | --- | --- |
| Lifecycle hardening | Enforce full running-state immutability/deletion policy across all structural edits | Not Started | `backend/api/*_views.py`, `backend/api/viewsets.py` | `8f3f79c8`, `f9cb600a`, `dd7a6279`, `b86db9f1` | Lifecycle primitives are live, but policy hardening is intentionally deferred. |
| Data integrity/audit | Add explicit audit trail for critical experiment mutations | Not Started | `backend/api/models.py`, mutation views | none yet | Current diagnostics are good; audit trail remains minimal. |
| Lots workflow | Build lot preparation/assignment operator workflow | Not Started | `/api/v1/lots`, recipes/feeding surfaces | `fddd4d07`, `fe4128f6` | Core models/routes exist; workflow UX not implemented. |
| Weekly ritual loop | Build week session execution UX for feeding/events/metrics | Not Started | `/api/v1/weekly-sessions`, `/api/v1/feeding-events`, `/api/v1/adverse-events`, `/api/v1/plant-weekly-metrics` | `fddd4d07`, `fe4128f6` | Underlying endpoints exist; integrated operator flow pending. |
| Scheduling follow-through | Add execute/skip completion actions and richer schedule aggregates | Not Started | `frontend/app/experiments/[id]/schedule/page.tsx`, schedule APIs | `de03652d`, `4a775bfe` | Current schedule is planning/guidance, not execution tracking. |
| Reporting/exports | Define V1 report set and add export APIs/UI | Not Started | backend report endpoints (TBD), frontend download surfaces | none yet | Explicit deliverables not implemented yet. |
| Production ops | Backup/restore automation + tested restore drill | Not Started | `infra/scripts/` (new scripts TBD) | `b8ac31e9` | High-priority risk item before production readiness. |
| Deployment runbook | Production deployment topology/runbook (proxy/TLS/tunnel mapping) | Not Started | deployment docs/scripts (TBD) | none yet | Self-host target exists; formal runbook incomplete. |
| PWA finalization | Cross-device PWA validation matrix + release cache version policy | Not Started | `frontend/public/sw.js`, `/offline` | `f4e4b310`, `fe398ba3`, `e932c093` | Baseline exists but release/device validation process is not complete. |
| Security hardening pass | Production-grade settings/auth configuration validation checklist | Not Started | `backend/growtriallab/settings.py`, deployment env | `262849c8`, `bba65cd9`, `f00306e5`, `0da774e` | Explicit checklist execution remains open. |

## Superseded / Legacy Feature Lines (For Timeline Accuracy)

These were real historical implementation lines from legacy docs, but they are not current canonical behavior:

- `Superseded` Packet/setup-state compatibility model and packet endpoints as primary setup contract.
  - Reason: active canonical flow now uses status summary + dedicated readiness pages.
  - Refs: `94f306a2`, `80789485`
- `Superseded` Groups/randomization compatibility endpoints as active assignment model.
  - Reason: active canonical assignment uses experiment-scoped recipes and plant-canonical operational assignment.
  - Refs: `a6b19d01`, `990b1c6b`, `ea4373b7`
- `Superseded` `Block` / `bin` terminology and block-centric placement model.
  - Reason: replaced by slot/grade and tent-slot-tray-plant hierarchy.
  - Refs: `9c5bc38`, `d5b76ba`

## Notes That Need Continued Tracking
- Determinism guarantees are part of product correctness:
  - queue ordering, auto-place ordering, schedule slot grouping.
- Dev bypass safety must remain strict:
  - development-only, explicit opt-in, never production.
- Readiness blockers are intentionally strict:
  - missing placement/recipe assignment are explicit blockers for feeding/start.
- UI/API terminology consistency:
  - reject new legacy term drift in reviews.
