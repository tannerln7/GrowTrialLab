# GrowTrialLab Unified Project Notes

Last consolidated: 2026-02-19  
Consolidated from: `docs/README.md`, `docs/decisions.md`, `docs/v1-checklist.md`, `docs/watch-outs.md`, `docs/phase0-ui-refactor-findings.md`, `docs/ui-illustration-inventory.md`, `docs/testing-migration-notes.md`

This document is the single consolidated source for current status, architecture decisions, open work, risks, and historical context. Notes that were outdated relative to the current repository were either corrected here or moved into the historical section.

## Canonical Current State
- Stack:
  - Backend: Django + DRF (`backend/`)
  - Frontend: Next.js App Router + TypeScript (`frontend/`)
  - Runtime: Docker Compose (`docker-compose.yml`)
- Auth model:
  - Cloudflare Access JWT validation in middleware (`backend/api/middleware.py`)
  - Dev-only bypass is explicit and gated (`backend/growtriallab/settings.py`, `backend/growtriallab/test_settings.py`)
- Canonical experiment flow:
  - Entry: `/experiments/{id}` (`frontend/app/experiments/[id]/page.tsx`)
  - Redirects to setup until bootstrap complete: `/experiments/{id}/setup`
  - Redirects to steady-state hub after bootstrap: `/experiments/{id}/overview`
- Bootstrap setup scope (minimal):
  - Plants, Tents+Slots, Recipes
- Readiness/operations pages:
  - Baseline: `/experiments/{id}/baseline`
  - Placement: `/experiments/{id}/placement` (4-step in-page workflow)
  - Rotation: `/experiments/{id}/rotation`
  - Feeding: `/experiments/{id}/feeding`
  - Schedule: `/experiments/{id}/schedule`
  - Recipes (recipe management): `/experiments/{id}/recipes`
- Placement workflow structure:
  - Step 1: Tents + Slots layout/restrictions
  - Step 2: Trays + Capacity
  - Step 3: Plants -> Trays (draft, apply)
  - Step 4: Trays -> Slots (draft, apply)
  - Step navigation behavior:
    - Step 1 does not show Back action.
    - Final step primary action routes to `/overview` when slot mapping requirements are met.
- Canonical status/gating API:
  - `GET /api/v1/experiments/{id}/status/summary` (`backend/api/status_views.py`)
- Canonical physical hierarchy:
  - `Tent -> Slot -> Tray -> Plant`
- Placement UI behavior:
  - Placement membership changes are staged client-side first (`stagedTrayByPlantId`) and persisted only on explicit save/confirm.
  - Staging validates tray capacity and tent restriction compatibility before save, while backend remains source-of-truth on final apply.
  - Placement page is physical-location only; recipe assignment/editing is handled on `/experiments/{id}/recipes`.
- Recipes UI behavior:
  - Recipes page uses tray/unplaced grouped plant grids for selection, with per-plant recipe mapping as the only persisted assignment state.
  - Recipe apply/remove actions are staged in local draft mapping and persisted only on explicit save.
  - Recipe list management is compact and uses multi-select recipe cells with contextual delete.
- Canonical contract conventions:
  - List envelope: `{ count, results, meta }`
  - Blocked operations: `{ detail, diagnostics }`
  - Location object: nested `location` payload shape
- Canonical terminology:
  - `grade` and `slot` are canonical; legacy `bin`/`block` terms are deprecated and removed from active API/UI contracts.

## Category: Platform, Runtime, and Repo Structure

### Completed
- [x] Monorepo foundation with `backend/`, `frontend/`, `infra/`.
- [x] Local compose runtime bootstraps DB + backend + frontend (`docker-compose.yml`).
- [x] LAN-safe frontend same-origin proxy setup is active (`frontend/next.config.ts`, route fetch usage under `frontend/app/`).
- [x] Local DB reset workflow exists (`infra/scripts/reset-dev.sh`).
- [x] Frontend dev cache hygiene is now hardened for local Docker and host workflows: frontend compose service mounts `/app/.next` as an isolated volume, and `frontend/scripts/prepare-dev-cache.mjs` runs before `next dev` to quarantine non-writable/foreign-owned `.next/dev` caches without sudo.

### In Progress / Not Complete
- [ ] Pin and document one explicit local/CI version matrix for `pnpm`, `uv`, Docker, and expected verification output.
- [ ] Add reproducible seed/dev fixture commands for demos (without bypassing auth model semantics).

### Applicable files/code segments
- `docker-compose.yml`
- `infra/scripts/reset-dev.sh`
- `frontend/app/`
- `backend/manage.py`

## Category: Security and Auth

### Completed
- [x] Cloudflare Access middleware auth is implemented (`backend/api/middleware.py`).
- [x] Invite-only app user model with admin/user roles is implemented (`backend/api/models.py`, `backend/api/views.py`).
- [x] Admin user management routes are implemented:
  - `GET /api/admin/users`
  - `POST /api/admin/users`
  - `PATCH /api/admin/users/{id}`
- [x] Dev bypass is now explicit and safer by default:
  - Requires `NODE_ENV=development`, `ENABLE_DEV_AUTH_BYPASS=true`, debug mode, and non-real/missing Cloudflare config (`backend/growtriallab/settings.py`).

### In Progress / Not Complete
- [ ] Production security hardening run-through:
  - `DJANGO_DEBUG=0`
  - real `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD`
  - strict `DJANGO_ALLOWED_HOSTS`
  - `CSRF_TRUSTED_ORIGINS`
  - secure cookie/proxy settings
  - explicit `/healthz` exposure decision

### Applicable files/code segments
- `backend/api/middleware.py`
- `backend/growtriallab/settings.py`
- `backend/growtriallab/test_settings.py`
- `.env.example`
- `README.md`

## Category: Domain Model and API Contracts

### Completed
- [x] Core domain models and DRF endpoints are active (`backend/api/models.py`, `backend/api/urls.py`, `backend/api/viewsets.py`).
- [x] Status summary contract is canonical for setup/readiness/lifecycle/schedule gating.
- [x] Placement/rotation/feeding lifecycle gating and diagnostics are active in API behavior.
- [x] Schedule planning endpoints are active and grouped by date/timeframe semantics.
- [x] Plant-canonical recipe assignment is active for readiness + feeding behavior (`Plant.assigned_recipe` is source-of-truth).
- [x] Assignment APIs support both per-plant updates (`PATCH /api/v1/plants/{id}` with `assigned_recipe_id`) and tray convenience bulk apply (`POST /api/v1/trays/{id}/plants/apply-recipe`).
- [x] Batch per-plant recipe save endpoint is available for staged UI workflows (`PATCH /api/v1/experiments/{id}/plants/recipes`).
- [x] Multi-tent + slot generation + restriction-aware placement/rotation validation are active.
- [x] Plant replacement chain endpoint is active (`POST /api/v1/plants/{id}/replace`).

### In Progress / Not Complete
- [ ] Add stronger cross-model integrity validation and formal audit trail for key experiment mutations.
- [ ] Finalize lifecycle immutability/deletion policy enforcement beyond currently enforced running-state placement lock behavior.
- [ ] Build lot workflow and weekly ritual loop workflows using existing models/endpoints as base.

### Applicable routes/files
- Routes:
  - `GET /api/v1/experiments/{id}/status/summary`
  - `POST /api/v1/experiments/{id}/start`
  - `POST /api/v1/experiments/{id}/stop`
  - `GET /api/v1/experiments/{id}/overview/plants`
  - `GET /api/v1/experiments/{id}/placement/summary`
  - `POST /api/v1/experiments/{id}/placement/auto`
  - `GET /api/v1/experiments/{id}/rotation/summary`
  - `POST /api/v1/experiments/{id}/rotation/log`
  - `GET /api/v1/experiments/{id}/feeding/queue`
  - `POST /api/v1/plants/{id}/feed`
  - `PATCH /api/v1/experiments/{id}/plants/recipes`
  - `POST /api/v1/trays/{id}/plants/apply-recipe`
  - `GET /api/v1/experiments/{id}/schedules`
  - `GET /api/v1/experiments/{id}/schedules/plan`
- Files:
  - `backend/api/urls.py`
  - `backend/api/contracts.py`
  - `backend/api/*_views.py`
  - `backend/api/viewsets.py`

## Category: Frontend UX and Workflow Surfaces

### Completed
- [x] Hub-and-spoke workflow centered on Overview is active.
- [x] Setup is bootstrap-focused; readiness work is Overview-driven.
- [x] Dedicated pages for baseline/placement/rotation/feeding/schedule/recipes are active.
- [x] Standalone `/slots` navigation was merged into Placement Step 1 (single-route wizard flow).
- [x] Placement page now uses step-gated wizard UX and dense multi-select grid workflows for both plants->trays and trays->slots with explicit draft apply/discard controls.
- [x] Placement Step 1 now uses mobile-first `+/-` count toolbars for both tent count (`Tent Manager`) and per-tent shelf count (`Shelves layout`), replacing older add/remove text-button flows and keeping step controls consistent with shared primitives.
- [x] Placement Step 1 shelf preview cards now content-fit to slot-cell rows (auto-sized shelf width) instead of fixed shelf-card minimums, reducing empty horizontal slack and keeping shelf geometry tied to slot count.
- [x] Placement Step 1 shelf preview lane now wraps shelf cards to new rows when screen width is constrained; individual shelf slot rows can still scroll within a shelf card when a single shelf exceeds available width.
- [x] Placement Step 1 tent metadata and restriction edits now stage in-card and persist through the shared bottom `Save & Next` action (per-tent `Save tent` buttons removed); Step 1 blocker/help text reflects this single save path.
- [x] Placement Step 2 now uses mobile-first tray controls (`+/-`) staged in `Tray Manager`: top-level count controls adjust tray container count and in-card controls adjust per-tray capacity; the standalone add-tray form and delete icon flow were removed in favor of one consistent save pattern.
- [x] Placement Step 4 `Tent Slot Containers` now renders `Tent -> Shelf -> Slot/Tray` with shelves as stacked rows per tent, and each shelf row renders its slot/tray cells in a horizontal lane with overflow fallback. Tent cards auto-fit side-by-side when viewport width allows and stack when constrained; in two-up layout the shelf lane targets up to four visible slot/tray cells before horizontal scroll. The nested tent/shelf grid now renders directly on the step surface without an extra outer wrapper card. Filled slots render tray cards directly while empty slots retain `Slot x` + `Empty` affordances, and empty-slot destination selection now toggles on repeat click with full-cell highlight + check indicator.
- [x] Placement save/apply actions are now unified into the shared bottom navigation flow: when current-step drafts are pending, the primary action runs save+advance (`Save & Next`), draft-change chips render in the nav bar only when pending with singular/plural labels by count, step blocker hints are rendered in the same bottom bar for all four steps, and `Reset` in that bar discards current-step draft changes. Step 1 next/save gating now evaluates draft shelf layout validity so unsaved but valid tent/slot drafts can proceed through `Save & Next`.
- [x] Draft-change highlighting now uses shared treatment across all four placement steps (step-level draft chips plus a consistent ring+dot surface marker on changed cards/cells).
- [x] Removal drafts now highlight affected container cells consistently (for example, removing a plant from a tray highlights that tray container; removing a tray from a slot highlights the affected slot cell) using the same shared draft marker treatment.
- [x] Draft highlights are now constrained to cells only (no toolbar highlighting): additions highlight newly visible cells, while removals highlight the nearest visible container cell when removed items are no longer visible.
- [x] Recipes page now mirrors placement-grid interaction patterns for per-plant recipe mapping (tray-grouped selection, draft mapping, explicit save).
- [x] Overview roster now uses a nested `Tent -> Slot -> Tray -> Plant` grid presentation with compact plant cells and per-plant status chips (grade, recipe, plus non-active state) instead of row-style list rendering, with top-aligned/content-sized tent cards and shelf/slot-index layout rendering to preserve real tent row/column geometry and avoid uneven spacing between adjacent tents. Shelf groups render horizontally within each tent (with narrow-screen horizontal scroll) to match physical row orientation. Overview readiness counters + operation controls now live in `Experiment State` as dynamic chips (green when value is `0`), while schedule details and the `Schedule` navigation action live in the `Schedule` card. Overview nav buttons now switch to primary styling when their linked workflow has pending work, and `Start` remains disabled until readiness requirements are met. Overview slot/tray/plant layout now removes fixed slot-column minimums in favor of responsive shrink behavior so portrait mobile screens do not overflow.
- [x] Overview slot rendering now keeps slot labels for empty slots only; filled slots render tray cards directly so tray content occupies the full slot footprint without redundant `Slot x` labels.
- [x] Overview GridKit topology now uses placement summary spine data (`tent.layout.shelves[*].tray_count` + tray locations) as authoritative shelf capacity, so per-shelf slot arrays are generated from configured slot counts instead of inferred plant occupancy. Result: empty trailing slots remain visible and trays with zero plants still render when placement metadata is available.
- [x] GridKit cell chrome standardization is now active for dense slot/tray/plant surfaces (placement, recipes, baseline queue, overview roster, and GridKit legacy adapters):
  - canonical shell + interaction semantics: `frontend/src/lib/gridkit/components/CellChrome.tsx`
  - canonical chip overlays: `frontend/src/lib/gridkit/components/CellChips.tsx`
  - canonical text helpers: `frontend/src/lib/gridkit/components/CellText.tsx`
  - inventory/guardrail scripts now report `CellChrome` adoption and remaining bespoke shell/chip hotspots in report-only mode.
- [x] GridKit structural containers are now active for tent/shelf scaffolding:
  - canonical containers: `TentGrid`, `TentCard`, `ShelfStack`, `ShelfCard` under `frontend/src/lib/gridkit/components/containers/`
  - legacy tent/shelf adapters now render through these containers while preserving existing leaf content behavior
  - Step 1 tent wrappers now use `TentGrid`/`TentCard`, and inventory/guardrail scripts now report container adoption plus remaining bespoke tent/shelf wrapper heuristics.
- [x] GridKit shelf paging is now standardized with `PositionStrip` (`frontend/src/lib/gridkit/components/PositionStrip.tsx`) across legacy tent/shelf adapters:
  - native CSS scroll-snap (`snap-x snap-mandatory`) and touch momentum (`-webkit-overflow-scrolling: touch`)
  - fixed page size of 4 positions (`POSITION_STRIP_PRESET.maxVisible`)
  - shelf strips now use fixed non-scroll column geometry for `<=4` positions (`columnsMode="fixed"`, `fixedColumns=4`) so low-slot shelves do not upsize leaf cells.
  - desktop arrow paging (one full page per click) with reduced-motion fallback
  - stable DnD seam `data-*` attributes (`data-pos-id`, `data-draggable-id`, `data-droppable-id`, etc.) applied on position wrappers without enabling DnD behavior.
- [x] GridKit canonical leaf cells + renderer registry are now active for slot/tray/plant rendering paths:
  - canonical leaf cells: `frontend/src/lib/gridkit/components/cells/SlotCell.tsx`, `frontend/src/lib/gridkit/components/cells/TrayCell.tsx`, `frontend/src/lib/gridkit/components/cells/PlantCell.tsx`
  - canonical renderer registry + wrapper: `frontend/src/lib/gridkit/renderers/defaultPositionRenderers.tsx`, `frontend/src/lib/gridkit/renderers/PositionStripWithRenderers.tsx`
  - all GridKit tent/shelf layout wrappers now render through renderer maps (`OverviewTentLayout`, `PlacementTentLayout`, `PlacementShelfPreview`) instead of direct `renderPosition` lambdas
  - DnD seam metadata helpers now live in `frontend/src/lib/dnd/attributes.ts` and `frontend/src/lib/dnd/shells.tsx`, with canonical leaf cells emitting consistent `data-cell-kind`, `data-tent-id`, `data-shelf-id`, `data-position-index`, `data-draggable-id`, and `data-droppable-id` attributes without enabling active DnD behavior.
- [x] GridKit tray folder overlay behavior is now standardized for tent-layout tray expansion using Radix Popover + Framer Motion:
  - canonical folder overlay primitives:
    - `frontend/src/lib/gridkit/components/overlays/TrayFolderOverlay.tsx`
    - `frontend/src/lib/gridkit/components/cells/TrayCellExpandable.tsx`
    - `frontend/src/lib/gridkit/components/grids/TrayPlantGrid.tsx`
  - single-open coordination manager:
    - `frontend/src/lib/gridkit/state/trayFolderManager.tsx`
  - renderer context now supports tray-folder wiring (`ctx.trayFolder`) and default tray rendering can switch between static `TrayCell` and expandable tray-folder behavior without changing DnD mode.
  - overview tent/shelf adapter now scopes a `TrayFolderProvider` and renders tray occupants through expandable tray cells; placement adapters remain static (no new overlay behavior introduced there).
  - inventory/guardrail scripts now report tray-folder usage and remaining bespoke tray-overlay heuristics in report-only mode.
- [x] GridKit virtualization + targeted performance pass is now active for high-density overlay grids and renderer hot paths:
  - canonical virtualization primitives:
    - `frontend/src/lib/gridkit/components/virtual/VirtualList.tsx`
    - `frontend/src/lib/gridkit/components/virtual/VirtualGrid.tsx`
  - tray folder plant grids now use thresholded virtualization in `TrayPlantGrid` (`<=24` static render; `>24` virtualized rows), while preserving ordering/click semantics.
  - GridKit layout wrapper renderer/context objects are memoized in the hottest tent/shelf render paths (`OverviewTentLayout`, `PlacementTentLayout`, `PlacementShelfPreview`, `PositionStripWithRenderers`) to reduce avoidable rerender churn.
  - safe `content-visibility` hints are now available via `.perf-content-auto` and applied to GridKit tent/shelf card bodies (not to scroll-snap strip containers).
  - inventory/guardrail scripts now report:
    - `virtual_list_grid_usages`
    - `remaining_large_map_loops_in_scroll_containers`
- [x] GridKit dense control sizing and conditional-action layout stability are now standardized:
  - icon-only grid controls now use `GridControlButton` (`frontend/src/components/ui/grid-control-button.tsx`) with fixed `h-8 w-8` + `h-4 w-4` icon sizing.
  - placement/grid `+/-` controls (`StepAdjustButton`) and `PositionStrip` desktop arrows now share the same control footprint.
  - conditional destructive actions in tray/tent grid contexts now render via absolute overlay wrappers (`pointer-events-none` container + `pointer-events-auto` button) with opacity/scale animation only, preventing row/card height shifts when selection toggles.
- [x] Placement Step 3 tray containers now use the same GridKit tray popup/folder interaction model as overview (`TrayCellExpandable` + `TrayFolderProvider`) and no longer embed full-size placement plant cards inline in tray bodies.
  - tray click opens the tray folder popout; plant selection toggles continue to run through the existing staged placement handlers.
  - remove-selected tray action now appears in the popup header (top-right inline with tray label), not on the tray trigger card surface.
  - tray occupancy is now a top-right tray chip (`placement: "tr"`) rather than summary-line text below metadata.
  - tray body children render in a shrinkable content region (`min-h-0 flex-1`) to prevent clipping while preserving selection and staged move/remove semantics.
- [x] GridKit shelf strip page geometry was corrected after leaf sizing regression:
  - canonical leaf sizing now keeps square cells without desktop `min-w` constraints (`frontend/src/lib/gridkit/components/cells/leafSizing.ts`), so shelf strips retain 4 columns at `POSITION_STRIP_PRESET.maxVisible = 4` when viewport width allows.
  - desktop horizontal paging in `PositionStrip` remains viewport-page-based and no longer competes with leaf min-width sizing.
- [x] GridKit Phase 8 finalization is active:
  - legacy adapter naming/path was retired (`components/adapters/*` removed) and replaced by canonical layout wrappers under `frontend/src/lib/gridkit/components/layouts/*`.
  - enforced guardrails now block regressions for:
    - legacy adapter references
    - legacy shelf-strip scroll logic outside `PositionStrip`
    - bespoke tray-overlay state patterns
    - large `.map()` loops in scroll containers without GridKit virtualization
  - root guardrail command is now `pnpm guardrails` (runs frontend guardrails including enforced GridKit checks).
  - durable GridKit usage guide is finalized at `frontend/docs/gridkit.md`.
- [x] Tailwind-first migration is now active across the primary operator routes (`overview`, `recipes`, `placement`, `baseline`, `feeding`, `rotation`, `schedule`, `setup` + supporting setup routes, and cockpit `/p/{id}`): legacy `gt-*` class usage was removed from these flows and styling is now driven by Tailwind utility composition plus shadcn-style components/primitives.
- [x] Route CSS modules for experiments/cockpit styling were retired in favor of shared Tailwind style maps and reusable UI primitives:
  - removed: `frontend/app/experiments/experiments.module.css`
  - removed: `frontend/app/p/[id]/page.module.css`
  - added: `frontend/src/components/ui/experiments-styles.ts`
  - added: `frontend/src/components/ui/cockpit-styles.ts`
- [x] Legacy shared primitive CSS layer was retired after route parity:
  - removed: `frontend/src/styles/primitives.css`
  - `frontend/app/layout.tsx` now imports `tokens.css` only (plus app globals).
- [x] Tailwind/shadcn component baseline was expanded for migration reuse with additional foundational primitives/patterns (`icon-button`, `table-shell`, `skeleton`, `empty-state`, `notice`, `panel-surface`, `toolbar-row`, `dense-selectable-cell`) under `frontend/src/components/ui/`.
- [x] Shared shell/list primitives now use Tailwind utility composition directly (`PageShell`, `SectionCard`, `StickyActionBar`, `ResponsiveList`) and no longer rely on local CSS modules, reducing drift in common layout scaffolding.
- [x] Expanded shadcn-style baseline component set under `frontend/src/components/ui/` for migration coverage (`input`, `textarea`, `select`, `tabs`, `tooltip`, `dropdown-menu`, `popover`, `separator`, `scroll-area`).
- [x] Tailwind primitive foundation and variant conventions are now centralized:
  - added `frontend/src/components/ui/ui-foundations.ts` as the single source for shared interaction classes (`focus`/`disabled`) and reusable surface/selectable variants.
  - core primitive variants aligned for `button`, `badge/chip`, `notice`, `icon-button`, `panel-surface`, and `dense-selectable-cell`.
  - shared form controls (`input`, `textarea`, `select`) now reuse one token-driven control base class.
  - removed unused `frontend/src/styles/theme.css`; token/theming authority is now `frontend/src/styles/tokens.css` + `frontend/src/styles/tailwind-theme.css`.
- [x] Primitive duplication and class-wrestling drift were reduced across route surfaces:
  - route-local icon action wrappers were replaced with shared `TooltipIconButton`.
  - route-local native select class strings were replaced with shared `NativeSelect`, and unused `frontend/src/components/ui/select.tsx` was removed.
  - route-local raw Radix popover usage was replaced with shared `popover` wrapper.
  - `ResponsiveList` now consumes shared `table-shell` primitives for desktop table rendering.
  - status/success notices now use shared `Notice` instead of ad-hoc `text-emerald-*` text styling.
  - `buttonVariants` now owns border styling for `default`/`secondary`/`destructive`; route-level `border border-border` add-ons and `styles.buttonChrome` were removed.
- [x] Frontend migration stragglers were removed to keep Tailwind production scanning deterministic:
  - removed route/component CSS modules (`app/page.module.css`, `app/offline/page.module.css`, `AppMarkPlaceholder.module.css`, `IllustrationPlaceholder.module.css`, `OfflineBanner.module.css`) in favor of utility + primitive composition.
  - removed remaining route inline style objects from overview shelf/slot rendering and replaced with bounded static grid column utility lookup classes.
  - retained runtime CSS files only in `frontend/app/globals.css`, `frontend/src/styles/tokens.css`, and `frontend/src/styles/tailwind-theme.css`.
- [x] Tailwind drift guardrails are now available as lightweight repo checks:
  - added `infra/scripts/check-tailwind-drift.sh` and root script alias `pnpm frontend:tailwind-drift`.
  - check covers: CSS module imports in high-traffic routes, `!important`, dynamic Tailwind interpolation, legacy `gt-*` class token reintroduction, non-token hex color count thresholds, and arbitrary utility count thresholds.
  - removed dead/unused style-map keys from `frontend/src/components/ui/experiments-styles.ts` (`previewCell`, `previewCells`, `previewGrid`, `previewRow`, `selectionGrid`, `slotGridInline`).
- [x] Accessibility and mobile ergonomics were hardened at primitive level:
  - standardized focus-visible ring behavior for selectable cells/list controls and Radix menu/popover surfaces.
  - aligned selected states to include both surface change and ring outline.
  - raised baseline touch target sizing for shared controls (`Button`, `IconButton`, `Input`, `NativeSelect`) toward mobile-safe minimums.
  - replaced low-contrast success chip styling (`emerald-*`) with semantic success token styling for dark-theme readability.
  - added manual operator QA checklist for keyboard + mobile smoke checks (`docs/ui-tailwind-smoke.md`).
- [x] Baseline v2 now uses species-aware 1-5 slider capture with unified `metrics.baseline_v1` keys (`vigor`, `feature_count`, `feature_quality`, `color_turgor`, `damage_pests`), auto/manual grade source handling, first-capture neutral default slider values (`3`), concise single-word descriptor labels displayed below each slider with small single-line metric titles (no per-slider helper lines), a top-row always-visible primary save action with dynamic `Save & Next`/`Save` labeling and dirty-state gating for already-captured baselines, and baseline photo upload per selected plant with inline thumbnail/`No media` empty-state behavior plus themed file-selector controls. Baseline queue and plant-baseline payloads now expose deterministic `baseline_photo` metadata so capture-page thumbnail recall does not depend on paginated global photo lists, and baseline saves persist `metrics.baseline_v1.captured_at` surfaced as `baseline_captured_at` for per-plant last-capture display shown below grade controls/chip row. Queue status chips now show baseline-only state (`No baseline`/`Captured`) with captured rendered green and anchored to the bottom of each queue tile, and queue cells retain a square minimum-height footprint for consistent alignment.
- [x] Plant cockpit QR route (`/p/{id}`) is active with operational context and links.
- [x] UI terminology aligns on `grade` and location context fields.
- [x] Phase 0 and Phase 1 data-layer improvements landed:
  - Query provider scaffold (`frontend/src/app/providers.tsx`)
  - shared query keys (`frontend/src/lib/queryKeys.ts`)
  - normalized API helper (`frontend/src/lib/api.ts`)
  - shared query-state hook (`frontend/src/lib/usePageQueryState.ts`)
  - overview page migration to query/mutation pattern
- [x] Phase 2 data-layer migration is complete for active frontend routes:
  - route/controller-level `backendFetch` usage was removed from app/feature UI code and replaced with `api + react-query`.
  - query keys are standardized through `frontend/src/lib/queryKeys.ts` (including plant-cockpit scoped keys).
  - setup/operation pages and cockpit pages now use `useQuery`/`useMutation` with targeted invalidation for persisted server state.
- [x] Phase 3 route architecture normalization is active across interactive frontend routes:
  - app-route `page.tsx` files are thin server wrappers.
  - interactive implementations live in feature `*PageClient.tsx` modules under `frontend/src/features/**`.
  - controller-hook pattern is established for entry/checklist pages and the placement wizard (`usePlacementWizard`) remains the canonical complex-flow controller pattern.
- [x] Phase 4 UI modularization is active across core experiment operation surfaces:
  - large inline JSX blocks were extracted into feature-level panel/component modules with compact `model/actions` contracts.
  - extracted panel modules now cover baseline, feeding, plants, recipes, rotation, and overview shared sections under `frontend/src/features/experiments/*/components/`.
  - page clients now focus on orchestration + controller state wiring while preserving existing labels/gating/lock semantics.
- [x] Phase 5 utility consolidation and legacy guardrails are active across frontend shared code:
  - canonical shared helpers were added for set-selection mutations (`frontend/src/lib/collections/sets.ts`) and draft-vs-persisted comparisons (`frontend/src/lib/state/drafts.ts`), with placement + recipes callsites migrated.
  - canonical error helpers now live under `frontend/src/lib/errors/*`; compatibility shim modules were removed after adoption.
  - duplicate label/format helpers were consolidated in `frontend/src/lib/format/labels.ts` and reused by placement/recipes/cockpit.
  - frontend guardrail script `infra/scripts/check-no-backendfetch.sh` + `pnpm frontend:no-backendfetch` now blocks reintroduction of `backendFetch(...)` usage in `frontend/src`.
- [x] Phase 6 performance and cache hardening is active for high-churn frontend surfaces:
  - controller return groups (`ui/data/actions/mutations`) are memoized on core entry/checklist hooks to avoid avoidable rerenders.
  - placement dense-cell surfaces now use memoized components (`PlantSelectableCell`, `TraySelectableCell`, and heavy step modules) with stable controller model/action contracts.
  - overview start/stop lifecycle mutations now update status cache via `queryClient.setQueryData(...)` and only invalidate the overview plant query instead of broad status+overview invalidation.
  - frontend guardrails now also include `infra/scripts/check-no-inline-querykeys.sh` + `pnpm frontend:no-inline-querykeys` to prevent ad-hoc inline `queryKey: [...]` arrays in `frontend/src`.
- [x] Phase 7 consistency lock-in and final cleanup is active:
  - removed unused legacy frontend fetch export (`backendFetch`) from `frontend/lib/backend.ts`.
  - removed unused compatibility shim modules (`frontend/src/lib/backend-errors.ts`, `frontend/src/lib/error-normalization.ts`).
  - added className guardrail script `infra/scripts/check-no-filter-join-classnames.sh` + `pnpm frontend:no-filter-join-classnames`.
  - added aggregate guardrail command `pnpm frontend:guardrails` and integrated it into `infra/scripts/verify.sh`.
  - added concise frontend architecture guide + smoke checklist:
    - `frontend/docs/page-patterns.md`
    - `frontend/docs/smoke-checks.md`
- [x] Phase 1.5 mechanical frontend helper rollout is complete for route/page conventions:
  - route/page param parsing now standardizes on `useRouteParamString("id")` / `getParamString(...)` across experiment and cockpit pages.
  - standard top-of-page alert slabs now use shared `PageAlerts` in core experiment routes.
  - className array joins in page-level className paths were replaced with shared `cn(...)`.
  - existing React Query usage (`overview`) now uses generic `queryKeys.experiment.*` helpers rather than legacy aliases.

### In Progress / Not Complete
- [ ] Continue form-controller normalization and validation unification (RHF/Zod) now that server-state migration is complete.
- [ ] Refine Overview action tiles into a stable operator runbook interaction pattern.
- [ ] Expand photo UX beyond cockpit inline capture into fuller experiment-level flows.

### Applicable files/code segments
- `frontend/app/experiments/[id]/overview/page.tsx`
- `frontend/app/experiments/[id]/setup/page.tsx`
- `frontend/app/experiments/[id]/baseline/page.tsx`
- `frontend/app/experiments/[id]/placement/page.tsx`
- `frontend/app/experiments/[id]/rotation/page.tsx`
- `frontend/app/experiments/[id]/feeding/page.tsx`
- `frontend/app/experiments/[id]/schedule/page.tsx`
- `frontend/app/experiments/[id]/recipes/page.tsx`
- `frontend/app/p/[id]/page.tsx`
- `frontend/src/lib/queryKeys.ts`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/usePageQueryState.ts`

## Category: Testing and Quality Gates

### Completed
- [x] Backend tests migrated to pytest + pytest-django.
- [x] Contract tests split into focused modules under `backend/tests/`.
- [x] Shared fixtures/helpers added in `backend/tests/conftest.py`.
- [x] Query-count guard added where stable.
- [x] Verification script updated to run pytest (`infra/scripts/verify.sh`).
- [x] Testing migration notes documented with docs/source references (`docs/testing-migration-notes.md`).
- [x] Verification tooling now includes backend lint/type checks (`ruff` + `pyright`) and frontend TS typecheck command (`pnpm run typecheck`).

### In Progress / Not Complete
- [ ] Decide whether to enable optional plugins (`pytest-randomly`, `factory_boy`) by default.
- [ ] Add explicit coverage threshold policy for CI (`--cov-fail-under`).

### Applicable files/code segments
- `backend/pytest.ini`
- `backend/tests/`
- `infra/scripts/verify.sh`
- `docs/testing-migration-notes.md`
- `README.md`

## Category: PWA, Media, and UI Asset Notes

### Completed
- [x] PWA baseline exists with custom service worker and offline route.
- [x] Media upload persistence path and local bind mount pattern are implemented.
- [x] UI illustration placeholder inventory exists and maps placeholder IDs to route usage.

### In Progress / Not Complete
- [ ] Cross-device PWA validation matrix (Android/iOS/desktop) and release cache versioning process.
- [ ] Decide whether offline mutation queueing is in V1 scope.
- [ ] Replace placeholder illustrations with finalized branded assets.

### Applicable files/code segments
- `frontend/public/manifest.webmanifest`
- `frontend/public/sw.js`
- `frontend/app/offline/page.tsx`
- `frontend/src/components/pwa/ServiceWorkerRegistration.tsx`
- `data/uploads/` (host bind target)
- `docs/ui-illustration-inventory.md`

## Category: Operations, Deployment, and Reliability

### Completed
- [x] Local dev startup and smoke-check flow is documented.
- [x] Local reset script avoids concurrent migration races.

### In Progress / Not Complete
- [ ] Production topology runbook (self-hosted deployment specifics, reverse proxy/TLS, Cloudflare tunnel mapping).
- [ ] Backup/restore automation and tested restore drill for DB + uploads.
- [ ] Migration safety/rollback procedure and operational metrics/alerts definition.

### Applicable files/code segments
- `docker-compose.yml`
- `infra/scripts/reset-dev.sh`
- `infra/scripts/verify.sh`
- `README.md`

## Consolidated Watch-Outs (Active Risk Register)

### High severity
- Production label URL correctness depends on valid `PUBLIC_BASE_URL`; localhost fallback is dev-only and unsafe for production labels.
- Production auth hardening can regress if dev bypass-style settings leak into deployment config.
- Dev-friendly wildcard hosts (`DJANGO_ALLOWED_HOSTS=*`) must not be used in internet-facing deployments.
- Backups/restores are not yet fully formalized and drilled.
- Readiness blockers (missing placement/recipe assignment) are intentional and must remain explicit in UI and diagnostics.
- Placement capacity/restriction conflicts can produce unplaceable plants; diagnostics must remain surfaced.

### Medium severity
- Baseline completion policy is still MVP-level and may need tightening to all-active-plant baseline capture.
- Deterministic ordering in queueing/auto-place/schedule grouping is critical to operator trust and test stability.
- Query key discipline and App Router client/server boundary discipline are required to avoid stale data and hydration regressions.
- Schedule plans are guidance only; they do not auto-execute actions.
- Rotation and placement writes must stay transactionally and diagnostically consistent.
- Replacement-chain one-link semantics must remain enforced and tested.

### Low severity
- Devtools and dev-only helpers must stay out of production bundles/UX.
- Terminology drift (`bin`/`block`) should continue to be rejected in active API/UI work.

## Timestamped Decisions (Condensed)

### 2026-02-17
- React Query pattern standardization (key factory + API helper + shared query-state classification) established for migration foundation.
- UI/data-layer migration stack formally documented (Radix, TanStack, RHF+Zod, AutoAnimate) and phased.
- Per-plant recipe assignment was made canonical; tray-level recipe assignment and tray-derived assignment fallback were removed.

### 2026-02-16
- Envelope/location/diagnostics contract standardization made canonical.
- Canonical schema terminology finalized around `slot` and `grade`.

### 2026-02-14
- Same-origin frontend proxy model adopted for LAN-safe usage.
- Setup reduced to bootstrap-only scope; Overview became canonical steady-state hub.
- Plant cockpit QR-first workflow introduced and expanded.
- Lifecycle primitives (`draft`/`running`/`stopped`) introduced.
- Placement, rotation, feeding, and schedule MVP workflows introduced and linked to lifecycle/readiness behavior.
- Tray-canonical recipe assignment and feed/readiness gating behavior finalized. (Superseded by plant-canonical assignment on 2026-02-17.)
- Multi-tent hierarchy and species restriction enforcement finalized.
- PWA baseline implemented using custom service worker path.

### 2026-02-13
- Core stack choices established: Django + DRF + Postgres, Next.js App Router, Docker Compose local runtime.
- Cloudflare Access invite-only auth direction established.

## Historical / Superseded Notes (Kept for Traceability)
- Packet/setup-state compatibility layers are no longer part of the active canonical flow.  
  Current active flow uses status summary + dedicated readiness pages.
- Legacy groups/randomization compatibility routes are removed from active canonical contracts.
- `Block`/`bin` terminology has been superseded by `slot`/`grade`.
- The Phase 0 findings doc remains useful as migration rationale and slice planning context, but parts of its “available tooling in-session” notes are time-bound and not current architecture facts.

## Quick Command Reference (Current)
- Backend lint/type checks:
  - `cd backend && uv run ruff check`
  - `cd backend && uv run pyright`
- Backend tests:
  - `cd backend && uv run pytest`
  - `cd backend && uv run pytest -q`
  - `cd backend && uv run pytest --maxfail=1`
- Frontend checks:
  - `cd frontend && pnpm run lint`
  - `cd frontend && pnpm run typecheck`
- Coverage:
  - `cd backend && uv run pytest --cov=api --cov-report=term-missing`
- Parallel tests:
  - `cd backend && uv run pytest -n auto`
- Full verification:
  - `infra/scripts/verify.sh`
