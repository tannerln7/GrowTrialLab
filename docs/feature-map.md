# GrowTrialLab Feature Map

Last updated: 2026-02-17  
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
