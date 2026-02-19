# GrowTrialLab Agent Guidebook

Last updated: 2026-02-19

## Purpose
This guide helps coding agents (including Codex) work effectively in this repo by explaining **current** architecture, flows, conventions, and where to look for canonical truth. Repo-wide invariants/guardrails live in `AGENTS.md`; this guide is allowed to evolve as the product evolves.

## Where instructions live (official split)
- **Global defaults**: `~/.codex/AGENTS.md`
- **Project invariants**: `AGENTS.md` (repo root)
- **“How it works right now”**: this file (`docs/agent-guidebook.md`)
- **Canonical current state + risk register + open work**: `docs/unified-project-notes.md`
- **Timeline + commit refs**: `docs/feature-map.md`
- **Historical context only**: `docs/legacy/*`

## Repository orientation
- Backend: `backend/` (Django + DRF)
- Frontend: `frontend/` (Next.js App Router + TypeScript)
- Infra scripts: `infra/scripts/`
  - `reset-dev.sh`: reset local compose Postgres volume + restart stack
  - `seed-plants-by-species.sh`: seed `N` plants per species via API into first (or newly created) experiment; can auto-create default species set when empty
- Local runtime: `docker-compose.yml`
- Canonical docs: `docs/`

## Canonical product flow (current)
- Entry route: `/experiments/{id}`
- Redirect behavior:
  - Bootstrap incomplete → `/experiments/{id}/setup`
  - Bootstrap complete → `/experiments/{id}/overview`
  - Direct placement route remains accessible during bootstrap (`/experiments/{id}/placement`) so setup checklist links can complete tent/slot/tray configuration.
- Bootstrap scope (minimal):
  - Plants, Tents + Slots, Recipes
- Operations pages:
  - Baseline: `/experiments/{id}/baseline`
  - Placement: `/experiments/{id}/placement` (4-step wizard)
  - Rotation: `/experiments/{id}/rotation`
  - Feeding: `/experiments/{id}/feeding`
  - Schedule: `/experiments/{id}/schedule`
  - Recipes: `/experiments/{id}/recipes`
- Plant cockpit (QR-first):
  - `/p/{uuid}`
- Canonical gating contract:
  - `GET /api/v1/experiments/{id}/status/summary`

## Domain model conventions (current behavior)
### Physical hierarchy
`Tent → Slot → Tray → Plant`

### Recipe assignment model
- Canonical assignment lives on **plants**:
  - `Plant.assigned_recipe` is the source of truth for readiness/feeding behaviors.
- Trays are recipe-agnostic containers.
- Recipes UI groups by tray for selection convenience, but writes per-plant mapping.

## Placement workflow (single route, 4 steps)
Placement lives entirely under `/experiments/{id}/placement`. Do not reintroduce standalone `/slots` navigation.

Implementation structure (current): keep `frontend/app/experiments/[id]/placement/page.tsx` as a thin route wrapper and place wizard behavior in `frontend/src/features/placement/wizard/*` (`PlacementWizardPageClient`, `usePlacementWizard`, and `steps/*`).
- Wizard step action wrappers are intentionally stable, but the internal action ref bridge must update in a layout effect (not passive effect) so user interactions right after data refresh never hit stale one-render-behind closures.

### Step 1: Tents + Slots
- Define tents, restrictions/parameters, and slot layout (shelves/slots).
- Tent count is managed with shared `+/-` controls in `Tent Manager` (above the tent shelf/slot layout cards).
- Shelf count per tent is managed with the same shared `+/-` toolbar pattern in each tent's `Shelves layout` section.
- Tent creation uses incremented name/code suggestions with duplicate-collision retry, so repeated `+` actions during bootstrap continue creating tents instead of failing on duplicate defaults.
- Tent name/ID and species restriction edits are staged per tent card and persisted by the shared bottom `Save & Next` action (no per-card save button).
- Step 1 shelf preview cards auto-size to their slot cells (content-fit) instead of relying on fixed shelf-card minimum widths.
- Step 1 shelf preview cards wrap onto new rows when horizontal space is constrained (instead of forcing shelf-to-shelf horizontal scroll).
- Goal: stable physical map that mirrors IRL layout.

### Step 2: Trays + Capacity
- Define tray container count and default capacity.
- Tray manager uses an add-only `+` toolbar control, multi-select tray cells, and a contextual toolbar trash action to stage removals.
- Selected persisted trays are staged for deletion and removed from the draft grid immediately; selected draft-added trays are removed from draft state.
- Each tray cell keeps in-card `+/-` controls for per-tray capacity.
- The bottom navigation action persists pending changes for the current step, then advances.
- Step 2 `Save & Next` readiness is draft-aware: at least one effective draft tray (persisted minus staged removals plus additions) with capacity `>= 1` is sufficient to proceed.
- Goal: containers exist with constraints, but no placement yet.

### Step footer draft chips
- Draft-change chips render in the shared back/next navigation bar and only when pending change count is greater than `0`.
- Draft-change labels use singular/plural forms automatically (`1 ... change` vs `N ... changes`).
- Step blocker hints render in that same bottom nav bar (instead of a separate top blocker card).
- Step 1 blocker gating is draft-aware for shelf layouts, so valid unsaved Step 1 tent/slot drafts can be committed via `Save & Next`.
- The same bottom nav bar now includes `Reset`, which discards current-step draft state without persisting.

### Step 3: Plants → Trays (draft then apply)
- Dense, mobile-first selection grid.
- Selection is multi-select; bulk move into trays is staged in UI state.
- Nothing persists until explicit save/confirm.
- Tray containers should use GridKit tray popout behavior (`TrayCellExpandable` under `TrayFolderProvider`) so clicking a tray opens the same folder-style plant view used in overview, with occupancy shown as a tray chip and plant taps routed to existing selection toggles. Remove-selected tray action belongs in the popout header (top-right inline with tray label).

### Step 4: Trays → Slots (draft then apply)
- Trays are placed into tent slots using the same multi-select → bulk move model.
- The tent/shelf nested grid renders directly on the step surface (no extra outer wrapper card), matching the Step 1 preview presentation.
- Slot containers render with shelf grouping (`Tent → Shelf → Slot/Tray`) to match physical tent layout.
- Tent cards auto-fit in two columns when viewport width allows and stack when constrained.
- Within each tent, shelves render as stacked rows; each shelf row stays horizontal with scroll fallback when slot count exceeds available width (target: up to 4 slot/tray cells visible in two-up tent layout).
- Empty slot cells use toggle selection: first click selects destination slot; clicking the same slot again clears destination selection.
- Selected empty slots use full-cell highlight/ring and show a check indicator, matching tray selection affordances.
- Filled slots render tray cards directly (tray takes full slot footprint); empty slots keep `Slot x` + `Empty` affordances.

### Placement staging state shape (convention)
- Persisted mapping: `persistedTrayByPlantId`
- Staged mapping: `stagedTrayByPlantId`
- Apply order (deterministic):
  1) remove stale memberships
  2) add staged memberships

## Recipes page UX (per-plant assignment with tray grouping)
- Page purpose: per-plant recipe mapping, tray grouping as a selection aid.
- Interactions:
  - select/deselect plants
  - tray-level toggle selects all plants in a tray
  - species-based bulk select anchored to last clicked plant cell
- Draft mapping persists only on explicit save.
- CRUD UI remains compact (create + multi-select delete grid).

## Baseline v2 capture (current)
- Baseline capture uses five 1–5 sliders stored in unified metrics keys:
  - `vigor`, `feature_count`, `feature_quality`, `color_turgor`, `damage_pests`
- Stored under: `metrics.baseline_v1` on baseline-week metrics.
- `captured_at` stored at: `metrics.baseline_v1.captured_at` and surfaced as `baseline_captured_at`.
- Grade behavior:
  - auto/manual grade sources supported; auto-grade is deterministic server-side
  - UI allows override via grade control

## Frontend engineering conventions (current)
### Route architecture
- App routes should be thin server wrappers (`frontend/app/**/page.tsx`) that do minimal orchestration:
  - parse params with `getParamString(...)`
  - pass compact props into feature clients
  - keep redirects/gating behavior equivalent to prior route behavior
- Interactive route logic should live in feature clients: `frontend/src/features/**/**/*PageClient.tsx`.
- Complex logic should use feature controller hooks (`use<Feature>Controller`, `use<Feature>Wizard`) with grouped return shapes (for example `ui`, `data`, `actions`, `wizard/nav`).
- Large UI sections should be extracted from page clients into feature modules (`features/<feature>/components/*` or `features/<feature>/wizard/steps/*`) using compact contracts:
  - `model`: render-ready values and derived state
  - `actions`: event callbacks
  - keep prop surfaces small; avoid passing scattered setters across many props
- Keep `model`/`actions` references stable (`useMemo`/`useCallback`) for dense grids/lists and wizard steps to avoid rerender churn.

### Data layer
- React Query provider scaffold exists and query key discipline is required.
- Active frontend route-level server state uses `api + react-query`; avoid introducing new `backendFetch + useEffect` loader patterns in UI code.
- QueryClient defaults are currently tuned in `frontend/src/app/providers.tsx` (`staleTime: 30_000`, `refetchOnWindowFocus: false`, `retry: 1`); keep page-level overrides intentional.
- Mutation refresh strategy should prefer targeted invalidation and direct cache updates (`queryClient.setQueryData`) for known payloads over broad root invalidation.
- Shared helpers:
  - `frontend/src/lib/queryKeys.ts`
  - `frontend/src/lib/api.ts`
  - `frontend/src/lib/usePageQueryState.ts`
- Regression guardrails:
  - `pnpm frontend:guardrails`
  - `pnpm frontend:no-backendfetch`
  - `pnpm frontend:no-inline-querykeys`
  - `pnpm frontend:no-filter-join-classnames`

### Shared page helpers
- Route params:
  - Use `frontend/src/lib/useRouteParamString.ts` (`useRouteParamString("id")`) in client pages instead of repeating `params.id` parsing boilerplate.
  - Use `frontend/src/lib/routing.ts` (`getParamString`) in wrappers/server contexts where `searchParams` or route params can be `string | string[]`.
- Top-of-page status slabs:
  - Use `frontend/src/components/ui/PageAlerts.tsx` for standard loading/error/notice/offline/not-invited rendering.
  - Keep bespoke/non-standard error sections (for example custom not-found or rich error cards) outside `PageAlerts`.
- Class composition:
  - Use `cn(...)` (`frontend/src/lib/utils.ts`) for className composition; avoid `[].join(" ")` and `filter(Boolean).join(" ")` in className paths.

### Shared utility modules
- Selection set operations:
  - Use `frontend/src/lib/collections/sets.ts` for immutable `Set` mutations (`toggleSet`, `addManyToSet`, `removeManyFromSet`, `setHasAll`, `setDifference`) instead of reimplementing `new Set(current)` loops in page/client code.
- Draft vs persisted comparisons:
  - Use `frontend/src/lib/state/drafts.ts` (`getDraftOrPersisted`, `isDirtyValue`, `buildChangeset`) for map-based draft workflows.
- Error helpers:
  - Canonical error paths are:
    - `frontend/src/lib/errors/normalizeError.ts`
    - `frontend/src/lib/errors/backendErrors.ts`
- Shared formatting:
  - Use `frontend/src/lib/format/labels.ts` for `formatRecipeLabel` and `formatTrayDisplay` to avoid per-feature duplicates.

### Styling
- Tailwind v4 + shadcn-style components are canonical.
- Theme bridging:
  - `frontend/src/styles/tailwind-theme.css` (`@theme inline`) maps to existing token variables.
- Token source of truth:
  - `frontend/src/styles/tokens.css` is canonical for color/radius/spacing tokens.
  - `frontend/src/styles/theme.css` is retired and should not be reintroduced.
- CSS file boundary (current target state):
  - Runtime CSS should be limited to:
    - `frontend/app/globals.css`
    - `frontend/src/styles/tokens.css`
    - `frontend/src/styles/tailwind-theme.css`
  - Route/component `.module.css` files are retired; if reintroduced, they must be geometry-only and justified.
- Spacing ladder (canonical):
  - Tailwind spacing utilities are bound to `--spacing: var(--gt-space-base-1)` (4px base).
  - Use ladder steps before arbitrary values:
    - `0` = 0px
    - `0.5` = 2px
    - `1` = 4px
    - `2` = 8px
    - `3` = 12px
    - `4` = 16px
    - `5` = 20px
    - `6` = 24px
    - `8` = 32px
    - `10` = 40px
- Shared UI primitives live in:
  - `frontend/src/components/ui/*`
- Shared route style maps exist for complex geometry reuse:
  - `experiments-styles.ts`, `cockpit-styles.ts`
  - Overview nested tray metadata rows should stay single-line with tray label left and occupancy chip right (use `overviewTrayMeta` pattern).
  - Overview shelf groups should render as horizontal rows within each tent (scrollable on narrow widths), not vertical stacks.
  - Overview slot display convention: empty slot cells show `Slot x` + `Empty`; filled slots render tray content directly without repeating slot labels.
  - Overview slot topology should be built from placement summary spine (`tent.layout.shelves[*].tray_count` plus tray location metadata) so shelves render configured slot capacity even when a slot has zero plants.
- Shared primitive foundations:
  - `frontend/src/components/ui/ui-foundations.ts` is the single source for:
    - focus/disabled interaction classes (`uiInteraction`)
    - shared control base class (`controlBaseClass`)
    - surface variants (`surfaceVariants`, `panelSurfaceVariants`, `toolbarRowVariants`)
    - selectable cell state variants (`selectableCellVariants`)
- Shared primitive usage conventions:
  - Use GridKit cell primitives for dense slot/tray/plant list/grid cells:
    - `CellChrome` (`frontend/src/lib/gridkit/components/CellChrome.tsx`) as the outer shell (selected/hover/focus/disabled/locked semantics).
    - `CellChips` (`frontend/src/lib/gridkit/components/CellChips.tsx`) for fixed-placement chip overlays (`tl`, `tr`, `bl`, `br`, `top`, `bottom`).
    - `CellTitle`/`CellSubtitle`/`CellMeta` (`frontend/src/lib/gridkit/components/CellText.tsx`) for repeatable text rows.
    - canonical leaf cells:
      - `SlotCell`: `frontend/src/lib/gridkit/components/cells/SlotCell.tsx`
    - `TrayCell`: `frontend/src/lib/gridkit/components/cells/TrayCell.tsx`
    - `PlantCell`: `frontend/src/lib/gridkit/components/cells/PlantCell.tsx`
    - leaf sizing contract (`frontend/src/lib/gridkit/components/cells/leafSizing.ts`) should keep `w-full` + `aspect-square` and avoid desktop `min-w` constraints that can collapse shelf strips from 4 columns to 3.
  - Use GridKit structural containers for tent/shelf scaffolding:
    - `TentGrid` for responsive tent layout (`1` column on small, `2` on `md+`).
    - `TentCard` as the tent wrapper (header + body).
    - `ShelfStack` for vertical shelf stacking inside tents.
    - `ShelfCard` as the shelf section wrapper (header + body).
    - Source: `frontend/src/lib/gridkit/components/containers/*`.
  - Use `PositionStrip` (`frontend/src/lib/gridkit/components/PositionStrip.tsx`) for shelf position paging:
    - one canonical native scroll-snap implementation (`snap-x`), no carousel libraries.
    - fixed page size is `4` positions (`POSITION_STRIP_PRESET.maxVisible`).
    - shelf strips should use fixed non-scroll column geometry (`columnsMode="fixed"`, `fixedColumns=4`) so 1-3 item shelves preserve the same 4-up density as 4-item shelves.
    - desktop arrow controls page by one viewport-width strip.
    - hide scrollbars with `.hide-scrollbar`; preserve touch momentum.
  - For shelf-position rendering, use renderer registry wiring instead of direct position lambdas:
    - default map: `frontend/src/lib/gridkit/renderers/defaultPositionRenderers.tsx`
    - wrapper: `frontend/src/lib/gridkit/renderers/PositionStripWithRenderers.tsx`
    - adapters/pages can override only specific occupant kinds while inheriting defaults.
  - Use GridKit layout wrappers instead of route-local tent/shelf mapping layers:
    - `OverviewTentLayout`: `frontend/src/lib/gridkit/components/layouts/OverviewTentLayout.tsx`
    - `PlacementTentLayout`: `frontend/src/lib/gridkit/components/layouts/PlacementTentLayout.tsx`
    - `PlacementShelfPreview`: `frontend/src/lib/gridkit/components/layouts/PlacementShelfPreview.tsx`
  - For tray folder expansion behavior, use GridKit overlay primitives (not ad-hoc route-local popovers/dialogs):
    - `TrayFolderOverlay`: `frontend/src/lib/gridkit/components/overlays/TrayFolderOverlay.tsx` (Radix Popover, non-modal, portal, Framer Motion animation).
    - `TrayCellExpandable`: `frontend/src/lib/gridkit/components/cells/TrayCellExpandable.tsx` (canonical tray trigger + folder overlay wiring).
    - `TrayPlantGrid`: `frontend/src/lib/gridkit/components/grids/TrayPlantGrid.tsx` (overlay plant grid content using canonical `PlantCell`).
    - `TrayFolderProvider`/`useTrayFolderManager`: `frontend/src/lib/gridkit/state/trayFolderManager.tsx` for single-open coordination in a logical view scope.
    - enable expansion per renderer context via `ctx.trayFolder`; keep it disabled for views that should remain static.
  - For virtualization/perf-sensitive GridKit surfaces:
    - use `VirtualList`/`VirtualGrid` from `frontend/src/lib/gridkit/components/virtual/*` for large vertical scroll collections.
    - keep deterministic thresholds so small sets stay static (`TrayPlantGrid`: static at `<=24`, virtualized above).
    - do not virtualize scroll-snap shelf strips; virtualization currently targets vertical list/grid containers (for example tray folder plant grids).
    - inventory scripts expose virtualization adoption and remaining scroll-container map hotspots:
      - `pnpm frontend:gridkit:inventory`
      - `pnpm frontend:gridkit:guardrail`
      - `pnpm guardrails` (full enforced frontend guardrail suite)
  - DnD seam metadata is helper-driven and passive in this phase:
    - helpers: `frontend/src/lib/dnd/attributes.ts`, `frontend/src/lib/dnd/shells.tsx`
    - no `DndContext`/sensors/hooks are active yet; only stable `data-*` attributes are emitted.
  - Use `CountAdjustToolbar` (`frontend/src/components/ui/count-adjust-toolbar.tsx`) for shared add/remove count toolbars where counts are the direct draft primitive (for example tent/shelf rows).
  - Use `DraftChangeChip` (`frontend/src/components/ui/draft-change-chip.tsx`) for consistent draft-highlight labels across step cards and nav controls.
- Use `DraftChangeMarker` (`frontend/src/components/ui/draft-change-marker.tsx`) only for non-GridKit surfaces that have not yet migrated to `CellChips`; combine with `experimentsStyles.draftChangedSurface` ring style when applicable.
  - Draft highlights must stay cell-local: do not highlight toolbars; when removals make items invisible, highlight the nearest visible container cell (for example tent/shelf/tray/slot container cells).
  - Use `StepNavBar` (`frontend/src/components/ui/step-nav-bar.tsx`) for the placement-style back/save-next bar with blocker hints + draft indicators.
  - Use `GridControlButton` (`frontend/src/components/ui/grid-control-button.tsx`) for dense GridKit icon-only controls (selection trash actions, `PositionStrip` arrows, compact grid toolbars).
  - Use `TooltipIconButton` (`frontend/src/components/ui/tooltip-icon-button.tsx`) for icon-only actions that need tooltip labels.
  - Use `StepAdjustButton` (`frontend/src/components/ui/step-adjust-button.tsx`) for shared `+/-` count controls; it composes `GridControlButton` for fixed dense-grid sizing.
  - Conditional grid controls that belong to card surfaces should render as absolute overlays on a `relative` parent (`absolute top-2 right-2 z-10`, wrapper `pointer-events-none`, button `pointer-events-auto`) with opacity/scale-only animation so control toggles do not reflow cell/grid content.
  - Use `NativeSelect` (`frontend/src/components/ui/native-select.tsx`) for native `<select>` controls instead of route-local select class strings.
  - Use `Notice` (`frontend/src/components/ui/notice.tsx`) for status/success messages instead of ad-hoc `text-emerald-*` text classes.
  - `buttonVariants` owns border styling for `default`/`secondary`/`destructive`; do not append `border border-border` at callsites.
  - Avoid inline style objects in route components for utility-friendly layout; prefer static utility class maps or bounded lookup classes.
  - Mobile touch target baseline:
    - `Button` default/min interactive height is `h-10` (40px) and large controls are `h-11` (44px).
    - `IconButton` defaults to `h-11 w-11` (44px); compact icon actions should not go below `h-10 w-10` (40px).
    - dense GridKit icon controls are the exception: `GridControlButton` uses `h-8 w-8` with `h-4 w-4` icons to prevent card-content compression in square cell layouts.
    - `Input` and `NativeSelect` controls use `h-10` for easier touch ergonomics.
  - Focus + state baseline:
    - Reuse `uiInteraction.focusRing` and cell-interactive focus classes for keyboard-visible focus.
    - Selected cell states should pair border/surface changes with a ring (`ring-1 ring-ring/50`) instead of color-only changes.
    - Success/status chips should use semantic success tokens (`border-success/*`, `bg-success/*`, `text-success-foreground`) for dark-theme contrast.
- Variant naming conventions (core primitives):
  - `Button`: `default | secondary | outline | ghost | destructive`
  - `Badge` / `Chip`: `default | secondary | outline | success | warning | destructive`
  - `Notice`: `default | success | warning | destructive` (legacy aliases `info`/`error` only for compatibility)
  - `IconButton`: `default | secondary | ghost | destructive` (legacy alias `danger` only for compatibility)
  - `PanelSurface` / `SectionCard` / shell surfaces: `variant` uses `default | muted | elevated`
  - `DenseSelectableCell`: `tone` (`default | muted`) + `state` (`default | selected`) with shared interactive/dirty states
- Avoid dynamic class generation; keep Tailwind scan-safe.
- Tailwind-first workflow (regression guardrail):
  - Prefer primitive/style-map updates over per-route CSS overrides.
  - Keep high-traffic routes (`/experiments/*`, `/p/*`) free of CSS module imports.
  - Run `pnpm frontend:tailwind-drift` before finalizing frontend styling work.
  - Drift check thresholds can be tuned via env vars:
    - `MAX_NON_TOKEN_HEX` (default `1`)
    - `MAX_ARBITRARY_UTILS` (default `120`)
  - Guardrail script path: `infra/scripts/check-tailwind-drift.sh`.

## Agent work pattern (practical)
- Confirm current behavior in code first (routes, views, serializers, contracts).
- Implement the smallest safe slice that preserves contracts and operator UX.
- Keep changes staged/draft-only where UX requires explicit confirm.
- Update canonical docs when behavior/contracts/workflows change (see `AGENTS.md`).
- For frontend page/controller conventions, use `frontend/docs/page-patterns.md`.

## Testing and verification (quick reference)
Source of truth is `AGENTS.md`, but common commands are:
- Backend:
  - `cd backend && uv run ruff check`
  - `cd backend && uv run pyright`
  - `cd backend && uv run pytest`
- Frontend:
  - `cd frontend && pnpm run lint`
  - `cd frontend && pnpm run typecheck`
  - `pnpm frontend:tailwind-drift`
- Full:
  - `infra/scripts/verify.sh`

## UI Smoke Checklist
- Manual keyboard/mobile smoke checks live in `docs/ui-tailwind-smoke.md`.

## Active risk register and “what’s next”
Do not duplicate the risk register here. Use:
- `docs/unified-project-notes.md` (risk register + open work + status)
- `docs/feature-map.md` (timeline + commit refs)
