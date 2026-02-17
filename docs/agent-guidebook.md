# GrowTrialLab Agent Guidebook

Last updated: 2026-02-17

## Purpose
This guide is for coding agents (including Codex) working in this repository. It explains current architecture, canonical documentation, expected workflows, and update rules so work stays consistent across sessions.

## Codex Instructions Location (Official)
Per OpenAI Codex docs, project-level persistent instructions belong in `AGENTS.md` at the repository root, with optional nested overrides in subdirectories when needed.

Primary sources:
- https://developers.openai.com/codex/guides/agents-md
- https://developers.openai.com/codex/config-advanced
- https://developers.openai.com/codex/cli/slash-commands

## Repository Orientation
- Backend: `backend/` (Django + DRF)
- Frontend: `frontend/` (Next.js App Router + TypeScript)
- Infra scripts: `infra/scripts/`
- Local runtime: `docker-compose.yml`
- Canonical docs: `docs/`

## Canonical Docs Map
Use these first:
- `docs/unified-project-notes.md`
  - Consolidated architecture/status/risk source of truth.
- `docs/feature-map.md`
  - Timeline-accurate feature map with `Completed` / `In Progress` / `Not Started` and commit references.
- `AGENTS.md`
  - Stable policy guardrails (security, required verification, documentation reconciliation).

Historical context only:
- `docs/legacy/decisions.md`
- `docs/legacy/v1-checklist.md`
- `docs/legacy/watch-outs.md`
- `docs/legacy/phase0-ui-refactor-findings.md`
- `docs/legacy/testing-migration-notes.md`
- `docs/legacy/ui-illustration-inventory.md`

## Product Flow (Current Canonical)
- Entry route: `/experiments/{id}`
- Redirect behavior:
  - Bootstrap incomplete -> `/experiments/{id}/setup`
  - Bootstrap complete -> `/experiments/{id}/overview`
- Bootstrap scope:
  - Plants, Tents + Slots, Recipes
- Readiness/ops pages:
  - Baseline, Placement, Rotation, Feeding, Schedule, Recipes (recipe management)
  - Placement is a single-route 4-step workflow:
    - Step 1: Tents + Slots
    - Step 2: Trays + Capacity
    - Step 3: Plants -> Trays (draft then apply)
    - Step 4: Trays -> Slots (draft then apply)
- Recipe assignment model:
  - `Plant.assigned_recipe` is canonical for operations/readiness/feeding.
  - Trays are recipe-agnostic containers.
- Plant cockpit:
  - `/p/{uuid}`
- Canonical status/gating contract:
  - `GET /api/v1/experiments/{id}/status/summary`

## API Contract Rules
- List responses use envelope shape: `{count, results, meta}`.
- Blocked operations return `{detail, diagnostics}`.
- Location payloads use nested location objects.
- Endpoints that return entity location must use nested `location` payloads (avoid `tent_*`, `slot_*`, `tray_*` field sprawl).
- Plant payloads that surface assignment should expose `assigned_recipe` as `{id, code, name} | null`.
- Assignment API conventions:
  - Staged per-plant batch save uses `PATCH /api/v1/experiments/{id}/plants/recipes` with `updates[]`.
  - Per-plant assignment set/clear uses `PATCH /api/v1/plants/{id}` with `assigned_recipe_id`.
  - Tray convenience bulk assignment uses `POST /api/v1/trays/{id}/plants/apply-recipe`.
- List endpoints must always include `meta` (even when empty).
- `409` blocked operations must include at least `diagnostics.reason_counts`.
- Canonical terms:
  - `grade` (not `bin`)
  - `slot` (not `block`)

## Frontend Data Layer Guidance (Current Conventions)
- Keep App Router server/client boundaries clean.
- Use shared query keys and API helpers:
  - `frontend/src/lib/queryKeys.ts`
  - `frontend/src/lib/api.ts`
  - `frontend/src/lib/usePageQueryState.ts`
- Do not inline ad-hoc React Query keys; derive keys from `queryKeys.ts`.
- Mutations should invalidate only the narrowest affected keys plus relevant derived aggregates:
  - status summary
  - overview roster
  - placement summary
  - feeding queue
  - schedule plan

## Frontend Styling Guidance (Current Conventions)
- Token source of truth is `frontend/src/styles/tokens.css` (`--gt-*` variables); keep token names stable and minimal so they can map directly into future Tailwind theme config.
- Shared global primitives live in `frontend/src/styles/primitives.css`; prefer these over re-defining base card/grid/cell/chip styles in route CSS modules.
- For dense placement/recipe/baseline/overview cell layouts, use `gt-grid` with `data-cell-size="sm|md|lg"` plus `gt-cell` state modifiers instead of per-page min-width/padding forks.
- Keep route CSS modules focused on page-specific layout/behavior overrides, not shared visual primitives.

## Overview Page UX Conventions
- Keep overview roster visualization aligned with physical hierarchy: `Tent -> Slot -> Tray -> Plant`.
- Prefer compact plant cells inside tray containers (instead of table-style rows) for dense, mobile-friendly scanning.
- Render tent slot areas using real shelf/slot index geometry (rows by shelf, columns by slot index) instead of auto-fill-only slot wrapping.
- Surface key per-plant status as compact centered chips in each plant cell (grade, recipe, and non-active status when applicable).
- Keep tent cards top-aligned and content-sized (no equal-height stretch) so slot/tray stacks stay visually aligned without large vertical gaps.
- Keep readiness counters and operational navigation controls in the `Experiment State` card, using dynamic status chips that render green when each counter is `0`; keep the `Schedule` navigation button with scheduling details in the `Schedule` card.
- Keep overview action buttons stateful: nav buttons use primary styling when their corresponding workflow has pending work (baseline/placement/recipes/rotation/feeding/schedule) and secondary styling when clear.
- Keep `Start` disabled until `readiness.ready_to_start` is true.
- Keep overview slot/tray/plant grids mobile-safe: avoid hard minimum widths that cause horizontal overflow in portrait mode; cells must shrink responsively on narrow screens.

## Placement Page UX Conventions
- Keep tent/slot setup in Placement Step 1; do not reintroduce standalone `/slots` navigation links.
- Keep Placement Step 3 focused on physical plant->tray membership only; do not embed recipe assignment controls in this step.
- Keep step navigation intentional:
  - do not render a Back button on Step 1
  - final-step primary action routes to `/overview` only when Step 4 requirements are satisfied
- Keep placement membership changes staged in page state until explicit save/confirm.
- Canonical placement staging shape is plant-centric mapping:
  - persisted: `persistedTrayByPlantId`
  - staged: `stagedTrayByPlantId`
- Enforce capacity and tent-restriction checks at staging time for fast operator feedback, then rely on backend as final source-of-truth on save.
- Save placement membership changes in deterministic order:
  - remove stale tray memberships first
  - add staged tray memberships second
- Keep multi-select behavior container-aware:
  - main grid bulk move applies only to selected unplaced/main-grid plants
  - tray trash removal applies only to selected plants in that tray

## Recipes Page UX Conventions
- Keep `/experiments/{id}/recipes` focused on per-plant recipe assignment with tray grouping as a selection aid only.
- Use tray/unplaced plant container grids with Placement Step 3-style selection behavior:
  - per-plant select/deselect
  - tray-level select toggle for all plants in a tray
  - species-based bulk select anchored to last clicked plant cell
- Keep recipe assignment draft-only until explicit save:
  - canonical state from placement summary + plant `assigned_recipe`
  - draft mapping in page state
  - save via `PATCH /api/v1/experiments/{id}/plants/recipes` diff updates
- Keep recipe CRUD UI compact:
  - compact create controls
  - compact multi-select recipe cell grid with contextual delete action

## Baseline Page UX Conventions
- Keep baseline capture controls above the plant queue so selected-plant editing is always in view.
- Use compact plant cell grids for queue navigation (no large row/table layout); clicking anywhere on a tile should select that plant as active for the capture panel.
- Keep baseline queue tiles visually stable with a square footprint and minimum height so row alignment remains consistent after content changes.
- Do not expose raw JSON editing in baseline capture UI.
- Baseline v2 capture uses five unified sliders (1-5):
  - `vigor`, `feature_count`, `feature_quality`, `color_turgor`, `damage_pests`
  - persist under `metrics.baseline_v1` on baseline week metrics
  - baseline capture timestamp persists as `metrics.baseline_v1.captured_at` and is exposed as `baseline_captured_at` in baseline API payloads
- Baseline sliders default to `3` on first capture.
- Baseline slider cards use small single-line metric titles (species-aware) and single-word value descriptors rendered below each slider; avoid long helper text blocks below each slider.
- Slider labels are species/category-aware in UI only; backend schema remains unified across species.
- Grade behavior:
  - `grade_source=auto` computes deterministic grade server-side from slider values and stores `Plant.grade`
  - `grade_source=manual` requires explicit grade override (`A|B|C`) and persists source in baseline metrics
  - Auto-grade uses a stricter `A` threshold tuned around roughly 4/5 average slider performance.
- Baseline save action is presented in the top Queue Status action row above capture fields (not sticky at page bottom), always visible with dynamic label behavior:
  - show `Save & Next` while uncaptured plants remain
  - show `Save` for already-captured selected plants
  - keep disabled when no plant is selected, read-only is active, or an already-captured selection has no edits
- Baseline photo capture/upload is per selected plant and should write with `tag=baseline` and `week_number=0`.
- Baseline photo UI should use an inline thumbnail cell (always present) with `No media` empty-state text, positioned left of upload controls, instead of external-link navigation.
- Baseline photo recall should be sourced from baseline endpoints (`baseline_photo` on queue rows and plant baseline payload), not from paginated global photo scans.
- Baseline capture UI should display a small `Last baseline capture` timestamp for the selected plant, sourced from `baseline_captured_at`, directly below the grade controls/chip row.
- Baseline queue status chips should show baseline capture state only (`No baseline`/`Captured`), with captured rendered as a green indicator and the chip anchored at the bottom of each queue tile.
- Baseline file selector control should match the same monochrome button/input theme as the rest of the page.

## Auth and Environment Rules
- Auth middleware is Cloudflare Access-based.
- Dev bypass must remain development-only and explicit.
- Do not weaken production safety defaults.
- Any auth changes must be reflected in:
  - `backend/growtriallab/settings.py`
  - `README.md`
  - `docs/unified-project-notes.md` and `docs/feature-map.md` when behavior changes

## Testing and Verification Rules
- Backend lint/type checks:
  - `cd backend && uv run ruff check`
  - `cd backend && uv run pyright`
- Backend tests use pytest:
  - `cd backend && uv run pytest`
- Frontend lint/type checks:
  - `cd frontend && pnpm run lint`
  - `cd frontend && pnpm run typecheck`
- Contract tests are split under `backend/tests/`.
- Keep tests deterministic (ordering-sensitive logic covered).
- Update, extend, or add tests for behavior changes (especially envelopes, diagnostics, lifecycle, placement/feeding gates).
- Full verification script:
  - `infra/scripts/verify.sh`

## Agent Doc Update Policy
When behavior changes, update docs in the same change set:
1. Update `docs/unified-project-notes.md` for canonical behavior/risk changes.
2. Update `docs/feature-map.md` for status/timeline/commit-ref changes.
3. If legacy-only context is relevant, append to `docs/legacy/*` only as historical notes (do not re-promote legacy docs as canonical).

## Recommended Work Pattern for Agents
1. Confirm current behavior in code (`backend/api/urls.py`, relevant views, frontend route pages).
2. Implement smallest safe change.
3. Run targeted tests, then broader verification as appropriate.
4. Update canonical docs for any contract or workflow change.
5. Keep commit messages scoped and explicit.

## Scope Boundaries
- Avoid reintroducing removed legacy flows (packet/setup-state/groups compatibility contracts) as active behavior.
- Keep schedule semantics explicit: planning guidance, not auto-execution.
- Preserve readiness blockers and diagnostics visibility in UI/API.
