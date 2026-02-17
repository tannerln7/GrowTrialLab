# GrowTrialLab Unified Project Notes

Last consolidated: 2026-02-17  
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
- [x] Recipes page now mirrors placement-grid interaction patterns for per-plant recipe mapping (tray-grouped selection, draft mapping, explicit save).
- [x] Overview roster now uses a nested `Tent -> Slot -> Tray -> Plant` grid presentation with compact plant cells and per-plant status chips (grade, recipe, plus non-active state) instead of row-style list rendering, with top-aligned/content-sized tent cards and shelf/slot-index layout rendering to preserve real tent row/column geometry and avoid uneven spacing between adjacent tents. Overview readiness counters + operation controls now live in `Experiment State` as dynamic chips (green when value is `0`), while schedule details and the `Schedule` navigation action live in the `Schedule` card. Overview nav buttons now switch to primary styling when their linked workflow has pending work, and `Start` remains disabled until readiness requirements are met. Overview slot/tray/plant layout now removes fixed slot-column minimums in favor of responsive shrink behavior so portrait mobile screens do not overflow.
- [x] Frontend styling foundation now includes a shared token and primitive layer for dark-theme consistency and Tailwind prep (`frontend/src/styles/tokens.css`, `frontend/src/styles/primitives.css`), with placement/recipes/overview/baseline rewired to consume shared global primitives (surfaces, grids/cells, buttons/forms, icon tool actions, status text) instead of duplicating page-specific base styles.
- [x] CSS Phase 2 broader sweep completed: setup/rotation/feeding/schedule/cockpit plus experiment list/create/plants routes now consume shared `gt-*` button/form/notice/badge/cell primitives; cockpit-specific primitive duplication was removed; shared primitive layer gained modal/popover/visually-hidden helpers for consistent token-driven reuse (`frontend/src/styles/primitives.css`, `frontend/app/p/[id]/page.module.css`, `frontend/app/experiments/experiments.module.css`, `docs/ui-css-phase2-report.md`).
- [x] CSS Phase 3 unification sweep completed: spacing/radius drift across experiments + shared route/component modules was normalized to a compact token ladder with shared layout primitives (`gt-page`, `gt-section`, `gt-card`, `gt-panel`, `gt-toolbar`) for consistent composition and future Tailwind utility mapping. A same-day stabilization fixed a global spacing collapse by replacing an invalid density expression with a unitless density default plus mobile compact override, and by splitting spacing into base + scaled token stages (`frontend/src/styles/tokens.css`, `frontend/src/styles/primitives.css`, `frontend/app/experiments/experiments.module.css`, `docs/ui-css-phase3-report.md`).
- [x] Tailwind scaffold was extended through Phase S for migration readiness (still scaffold-only, no broad module migration yet): added `frontend/tailwind.config.ts`, `frontend/src/styles/tailwind-theme.css` (`@theme inline` bridge to existing `--gt-*`/compat variables), shadcn/ui-style config at `frontend/components.json`, shared `cn(...)` helper at `frontend/src/lib/utils.ts`, foundational UI primitives under `frontend/src/components/ui/` (`button`, `badge`, `card`, `dialog`), and an expanded verification route at `frontend/app/tailwind-probe/page.tsx`.
- [x] Baseline v2 now uses species-aware 1-5 slider capture with unified `metrics.baseline_v1` keys (`vigor`, `feature_count`, `feature_quality`, `color_turgor`, `damage_pests`), auto/manual grade source handling, first-capture neutral default slider values (`3`), concise single-word descriptor labels displayed below each slider with small single-line metric titles (no per-slider helper lines), a top-row always-visible primary save action with dynamic `Save & Next`/`Save` labeling and dirty-state gating for already-captured baselines, and baseline photo upload per selected plant with inline thumbnail/`No media` empty-state behavior plus themed file-selector controls. Baseline queue and plant-baseline payloads now expose deterministic `baseline_photo` metadata so capture-page thumbnail recall does not depend on paginated global photo lists, and baseline saves persist `metrics.baseline_v1.captured_at` surfaced as `baseline_captured_at` for per-plant last-capture display shown below grade controls/chip row. Queue status chips now show baseline-only state (`No baseline`/`Captured`) with captured rendered green and anchored to the bottom of each queue tile, and queue cells retain a square minimum-height footprint for consistent alignment.
- [x] Plant cockpit QR route (`/p/{id}`) is active with operational context and links.
- [x] UI terminology aligns on `grade` and location context fields.
- [x] Phase 0 and Phase 1 data-layer improvements landed:
  - Query provider scaffold (`frontend/src/app/providers.tsx`)
  - shared query keys (`frontend/src/lib/queryKeys.ts`)
  - normalized API helper (`frontend/src/lib/api.ts`)
  - shared query-state hook (`frontend/src/lib/usePageQueryState.ts`)
  - overview page migration to query/mutation pattern

### In Progress / Not Complete
- [ ] Continue page-by-page React Query + RHF/Zod migration (baseline/placement/rotation/feeding/schedule forms and fetch orchestration).
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
