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
