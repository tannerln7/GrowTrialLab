# GrowTrialLab Agent Guidebook

Last updated: 2026-02-18

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
- Local runtime: `docker-compose.yml`
- Canonical docs: `docs/`

## Canonical product flow (current)
- Entry route: `/experiments/{id}`
- Redirect behavior:
  - Bootstrap incomplete → `/experiments/{id}/setup`
  - Bootstrap complete → `/experiments/{id}/overview`
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

### Step 1: Tents + Slots
- Define tents, restrictions/parameters, and slot layout (shelves/slots).
- Tent count is managed with shared `+/-` controls in `Tent Manager` (above the tent shelf/slot layout cards).
- Shelf count per tent is managed with the same shared `+/-` toolbar pattern in each tent's `Shelves layout` section.
- Tent name/ID and species restriction edits are staged per tent card and persisted by the shared bottom `Save & Next` action (no per-card save button).
- Step 1 shelf preview cards auto-size to their slot cells (content-fit) instead of relying on fixed shelf-card minimum widths.
- Goal: stable physical map that mirrors IRL layout.

### Step 2: Trays + Capacity
- Define tray container count and default capacity.
- Tray count is staged with `+/-` controls in `Tray Manager`, and each tray cell has in-card `+/-` controls for per-tray capacity.
- The bottom navigation action persists pending changes for the current step, then advances.
- Goal: containers exist with constraints, but no placement yet.

### Step footer draft chips
- Draft-change chips render in the shared back/next navigation bar and only when pending change count is greater than `0`.
- Draft-change labels use singular/plural forms automatically (`1 ... change` vs `N ... changes`).
- Step blocker hints render in that same bottom nav bar (instead of a separate top blocker card).
- Step 1 blocker gating is draft-aware for shelf layouts, so valid unsaved Step 1 tent/slot drafts can be committed via `Save & Next`.

### Step 3: Plants → Trays (draft then apply)
- Dense, mobile-first selection grid.
- Selection is multi-select; bulk move into trays is staged in UI state.
- Nothing persists until explicit save/confirm.

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
### Data layer
- React Query provider scaffold exists and query key discipline is required.
- Shared helpers:
  - `frontend/src/lib/queryKeys.ts`
  - `frontend/src/lib/api.ts`
  - `frontend/src/lib/usePageQueryState.ts`

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
- Shared primitive foundations:
  - `frontend/src/components/ui/ui-foundations.ts` is the single source for:
    - focus/disabled interaction classes (`uiInteraction`)
    - shared control base class (`controlBaseClass`)
    - surface variants (`surfaceVariants`, `panelSurfaceVariants`, `toolbarRowVariants`)
    - selectable cell state variants (`selectableCellVariants`)
- Shared primitive usage conventions:
  - Use `CountAdjustToolbar` (`frontend/src/components/ui/count-adjust-toolbar.tsx`) for shared add/remove count toolbars (tent/shelf/tray manager rows).
  - Use `StepNavBar` (`frontend/src/components/ui/step-nav-bar.tsx`) for the placement-style back/save-next bar with blocker hints + draft indicators.
  - Use `TooltipIconButton` (`frontend/src/components/ui/tooltip-icon-button.tsx`) for icon-only actions that need tooltip labels.
  - Use `StepAdjustButton` (`frontend/src/components/ui/step-adjust-button.tsx`) for shared `+/-` count controls instead of route-local button styling.
  - Use `NativeSelect` (`frontend/src/components/ui/native-select.tsx`) for native `<select>` controls instead of route-local select class strings.
  - Use `Notice` (`frontend/src/components/ui/notice.tsx`) for status/success messages instead of ad-hoc `text-emerald-*` text classes.
  - `buttonVariants` owns border styling for `default`/`secondary`/`destructive`; do not append `border border-border` at callsites.
  - Avoid inline style objects in route components for utility-friendly layout; prefer static utility class maps or bounded lookup classes.
  - Mobile touch target baseline:
    - `Button` default/min interactive height is `h-10` (40px) and large controls are `h-11` (44px).
    - `IconButton` defaults to `h-11 w-11` (44px); compact icon actions should not go below `h-10 w-10` (40px).
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
