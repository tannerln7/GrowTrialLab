# GrowTrialLab V1 Checklist

## How We Keep This Updated
- After each Codex prompt, Codex must update this checklist, `docs/decisions.md`, and `docs/watch-outs.md`.
- Add any new routes/endpoints created in that prompt to the relevant checklist items.
- Update item status as done, in progress, or todo.
- For completed items, include commit hash references when possible.
- Add newly discovered constraints or risks as notes/watch-outs.

Status convention:
- `[x]` completed
- `[ ]` todo
- `[ ] (in progress)` currently active but not complete

## Current Status Summary
The repo has a working monorepo foundation with Docker Compose, Django + DRF backend, Next.js App Router frontend, Cloudflare Access invite-only auth, and a mobile-first dark UI baseline. Setup is now bootstrap-only (Plants, Blocks/Slots, Recipes), and readiness workflows (baseline + assignment) are centered in Overview and dedicated pages.

Core domain models and CRUD endpoints exist, plus PWA baseline assets (manifest/icons/custom `sw.js` and `/offline`). QR labels resolve to an in-app plant page and labels encode absolute URLs. Baseline and Groups/Assignment are implemented with UI-only lock semantics, and `/p/{uuid}` now functions as a mobile-first plant cockpit/task launcher.

The largest remaining V1 work is Placement/Rotation/Start step implementation, production-hardening/security/deployment details, and operational guardrails (backups, stricter step-lock governance, reporting/export paths).

## Completed Milestones
- [x] Monorepo scaffold and local compose runtime (owner: Codex)
  - Refs: `d1268cc7`, `ded5b193`
  - Notes: `backend/`, `frontend/`, `infra/`; services at `http://localhost:8000` and `http://localhost:3000`.
- [x] Local verification workflow script and docs (owner: Codex)
  - Refs: `0a2e3228`
  - Notes: `infra/scripts/verify.sh` runs tests/typecheck/build checks.
- [x] Cloudflare Access auth middleware with invite-only provisioning and bootstrap admin (owner: Codex)
  - Refs: `262849c8`, `bba65cd9`, `f00306e5`
  - Routes: `GET /api/me`, middleware exemption `GET /healthz`.
- [x] Admin user management API for invites/enable-disable (owner: Codex)
  - Refs: `5d5ee41d`
  - Routes: `GET/POST /api/admin/users`, `PATCH /api/admin/users/{id}`.
- [x] Core domain schema + migrations (owner: Codex)
  - Refs: `fddd4d07`
  - Notes: experiments, plants, recipes, lots, trays, blocks, sessions, metrics, feeding, adverse events, photos.
- [x] DRF v1 CRUD routes + experiment filtering baseline (owner: Codex)
  - Refs: `fe4128f6`, `0dc10442`
  - Routes: `/api/v1/species`, `/api/v1/experiments`, `/api/v1/plants`, `/api/v1/photos`, etc.
- [x] Setup state machine model and stable step identifiers (owner: Codex)
  - Refs: `94f306a2`
  - Routes: `GET/PATCH /api/v1/experiments/{id}/setup-state/`.
- [x] Environments step + Blocks APIs and completion validation (owner: Codex)
  - Refs: `80789485`
  - Routes: `PUT /api/v1/experiments/{id}/packets/environment/`, `POST /api/v1/experiments/{id}/packets/environment/complete/`, `GET/POST /api/v1/experiments/{id}/blocks/`, `PATCH /api/v1/blocks/{id}/`.
- [x] Wizard shell + Environments frontend (owner: Codex)
  - Refs: `948a8a7a`
  - Routes: `/experiments/{id}/setup`, `/experiments`, `/experiments/new`.
- [x] Plants step APIs (bulk import, ID generation, labels PDF, completion) (owner: Codex)
  - Refs: `a8766e1f`, `9e81428b`
  - Routes: `GET/POST /api/v1/experiments/{id}/plants/`, `POST /plants/bulk-import/`, `POST /plants/generate-ids/`, `GET /plants/labels.pdf`, `PUT /packets/plants/`, `POST /packets/plants/complete/`.
- [x] Plants frontend + plants list UX (owner: Codex)
  - Refs: `53ace4f8`
  - Routes: `/experiments/{id}/setup`, `/experiments/{id}/plants`.
- [x] UI placeholder foundation and illustration inventory tracking (owner: Codex)
  - Refs: `62e4a898`
  - Notes: `IllustrationPlaceholder`, `AppMarkPlaceholder`, `docs/ui-illustration-inventory.md`.
- [x] Dark theme tokens, mobile-first primitives, responsive retrofit, offline banner + normalized backend errors (owner: Codex)
  - Refs: `097da4cc`, `39297c07`, `ee6bc25e`
  - Notes: `PageShell`, `SectionCard`, `ResponsiveList`, `StickyActionBar`, `OfflineBanner`.
- [x] PWA baseline with manifest/icons/custom SW and offline route (owner: Codex)
  - Refs: `f4e4b310`, `fe398ba3`, `e932c093`
  - Routes/files: `/manifest.webmanifest`, `/sw.js`, `/offline`, `ServiceWorkerRegistration`.
- [x] Plant QR resolve page and plant detail API retrieval (owner: Codex)
  - Refs: `7352300e`, `c8aa364c`, `ea4373b7`
  - Routes: `/p/{uuid}` frontend route, `GET /api/v1/plants/{uuid}/`.
  - Notes: Plant detail now includes assigned group/recipe when present.
- [x] Labels export uses absolute QR URLs and prints Plant ID text (owner: Codex)
  - Refs: `66824a6e`, `c8aa364c`
  - Routes/env: `GET /api/v1/experiments/{id}/plants/labels.pdf`, `PUBLIC_BASE_URL`.
  - Notes: Production must set `PUBLIC_BASE_URL`; fallback is `http://localhost:3000`.
- [x] Metric template model seeded with baseline defaults (owner: Codex)
  - Refs: `5571d379`
  - Routes: `GET /api/v1/metric-templates/`, `GET /api/v1/metric-templates/{id}/`.
- [x] Baseline step APIs and lock state workflow (owner: Codex)
  - Refs: `2f919969`, `d0467ff4`
  - Routes: `GET /api/v1/experiments/{id}/baseline/status`, `GET/POST /api/v1/plants/{uuid}/baseline`, `POST /api/v1/experiments/{id}/baseline/lock`, `PUT /api/v1/experiments/{id}/packets/baseline/`, `POST /api/v1/experiments/{id}/packets/baseline/complete/`.
  - Notes: Baseline lock state is retained for UX/workflow signaling and step progression.
- [x] Baseline frontend workflow (owner: Codex)
  - Refs: `4e599540`
  - Routes: `/experiments/{id}/setup` (Baseline section), `/experiments/{id}/baseline`, `/p/{uuid}` baseline shortcut.
- [x] Baseline lock semantics switched to UI-only guardrail (owner: Codex)
  - Refs: `de058638`, `1cf9c9e6`, `e68610fc`
  - Notes: Backend no longer returns lock-based 403 for baseline/bin edits; baseline page is read-only by default when locked and supports local unlock/re-lock.
- [x] Groups/Assignment APIs with deterministic stratified assignment (owner: Codex)
  - Refs: `a6b19d01`, `990b1c6b`
  - Routes: `GET /api/v1/experiments/{id}/groups/status`, `POST /api/v1/experiments/{id}/groups/recipes`, `PATCH /api/v1/experiments/{id}/groups/recipes/{recipe_id}`, `POST /api/v1/experiments/{id}/groups/preview`, `POST /api/v1/experiments/{id}/groups/apply`, `PUT /api/v1/experiments/{id}/packets/groups/`, `POST /api/v1/experiments/{id}/packets/groups/complete/`.
  - Notes: Uses `stratified_v1` with strata `(bin, species.category)` and seed tracking in `packet_data["groups"]`.
- [x] Groups frontend flow with preview/apply and UI-only lock guardrail (owner: Codex)
  - Refs: `ea4373b7`
  - Routes: `/experiments/{id}/setup` (Recipes + Assignment sections).
- [x] Linear setup UX with descriptive step names and Recipes/Assignment UI split (owner: Codex)
  - Refs: `a6b19d01`, `ea4373b7`
  - Notes: User-facing copy now uses setup steps (Plants, Environments, Baseline, Recipes, Assignment, Placement, Rotation, Start) while backend step keys and `/packets/*` endpoints remain unchanged.
  - Notes: Read-only-by-default when locked; local unlock/re-lock modal does not call backend unlock endpoints.
- [x] Experiment overview roster/work queue endpoint and UI (owner: Codex)
  - Refs: `51a32d99`, `65f84632`, `12517df6`
  - Routes: `GET /api/v1/experiments/{id}/overview/plants`, `/experiments/{id}/overview`.
  - Notes: Includes aggregate counts and filterable plant queue (Needs Baseline/Bin/Assignment, Active, Removed) with mobile cards.
- [x] Hub-and-spoke experiment navigation centered on Overview (owner: Codex)
  - Refs: `310f00b5`, `41599236`, `669ae104`, `7005524b`, `f2b49938`, `c61be2e7`
  - Routes: `/experiments/{id}` now routes to `/setup` until bootstrap is complete, then to `/overview`; subpages keep prominent `← Overview` return links.
  - Notes: `/setup` is hidden after bootstrap completion and overview drives readiness actions.
- [x] Experiment status summary endpoint for bootstrap/readiness gating (owner: Codex)
  - Refs: `ee000fab`, `c8b7db72`, `d302abd6`
  - Route: `GET /api/v1/experiments/{id}/status/summary`.
  - Notes: Setup completeness checks plants/blocks/recipes only; readiness counts track baseline/bin + assignment gaps on active plants.
- [x] Bootstrap-only setup checklist + dedicated slots and assignment pages (owner: Codex)
  - Refs: `f2b49938`, `a181325a`, `c61be2e7`
  - Routes: `/experiments/{id}/setup`, `/experiments/{id}/slots`, `/experiments/{id}/assignment`.
  - Notes: Baseline capture and assignment apply are no longer in setup.
- [x] Plant action pages support safe return to experiment overview with filter preservation (owner: Codex)
  - Refs: `2e911442`, `226d9654`
  - Routes: `/p/{uuid}?from=...`.
  - Notes: `from` is sanitized to same-origin relative experiment paths (`/experiments/...`); QR direct visits default to `/experiments/{id}/overview`.
- [x] Plant cockpit summary API and QR-first cockpit UI (owner: Codex)
  - Refs: `6e26cb27`, `2ff247c6`, `3ae322ad`
  - Routes: `GET /api/v1/plants/{uuid}/cockpit`, `/p/{uuid}`.
  - Notes: Cockpit adds sticky status strip, prioritized Now panel, inline photo upload, and recent activity preview while preserving safe back-to-overview behavior.

## Remaining Milestones

### Infrastructure & Dev Tooling
- [ ] (in progress) Pin and document one consistent local/CI verification matrix (owner: Codex)
  - Notes: Define exact `pnpm`, `uv`, Docker versions and expected commands in one place.
- [ ] Add non-interactive seed/dev fixture command set for reproducible demos (owner: Codex)
  - Notes: Should not bypass auth model.

### Auth & Security (Cloudflare Access)
- [ ] Production hardening checklist execution for Cloudflare Access (owner: manual)
  - Routes: middleware-protected routes, `/api/me`, `/healthz`.
  - Notes: remove debug bypass in prod env, verify real `CF_ACCESS_AUD` and team domain, confirm cert refresh/key rotation behavior under failure.
- [ ] Review and enforce secure Django settings for production ingress (owner: Codex)
  - Notes: `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`, secure cookies, proxy headers.

### Core Data Model & API
- [ ] Add API-level validation rules for cross-model integrity (owner: Codex)
  - Notes: experiment consistency checks for related objects, week numbering constraints.
- [ ] Add minimal audit trail model for key experiment mutations (owner: Codex)
  - Notes: currently audit is minimal/log-style.

### Setup Wizard (Steps)
- [ ] (in progress) Evaluate whether legacy setup-state packet progression is still needed post-bootstrap refactor (owner: Codex)
  - Route: `PATCH /api/v1/experiments/{id}/setup-state/`.
- [ ] (in progress) Strengthen Baseline completion rule from MVP threshold to all-plants baseline coverage (owner: Codex)
  - Notes: Current MVP requires at least 1 baseline capture + all bins assigned.
- [ ] Implement Placement step scaffolding (owner: Codex)
- [ ] Implement Rotation step scaffolding (owner: Codex)
- [ ] Implement Start step scaffolding (owner: Codex)

### Experiments/Plants UX
- [ ] (in progress) Improve experiment detail context page linking setup, overview, plants, and outputs (owner: Codex)
  - Routes: `/experiments`, `/experiments/{id}/setup`, `/experiments/{id}/overview`, `/experiments/{id}/plants`.
- [ ] (in progress) Refine Overview action tiles into a stable operator runbook pattern (owner: Codex)
  - Notes: Keep overview as the single launch point; avoid re-introducing cross-page navigation sprawl.
- [ ] Add UX affordances for validation errors and partial saves (owner: Codex)

### Baseline/Binning (Step)
- [ ] (in progress) Expand metric template governance (owner: Codex)
  - API refs: `/api/v1/metric-templates/`, `/api/v1/plants/{uuid}/baseline`.
  - Notes: Add template migration strategy and tighter category coverage.
- [ ] Add baseline review/QA pass before step completion (owner: Codex)

### Randomization/Groups (Step)
- [x] Add group assignment strategy + deterministic seed handling (owner: Codex)
  - Refs: `a6b19d01`, `990b1c6b`
- [x] Persist assignment outputs and lock post-confirmation (owner: Codex)
  - Refs: `a6b19d01`, `ea4373b7`
- [ ] Decide if Groups lock should remain UI-only or move to backend enforcement post-v1 (owner: manual)
- [x] Assignment UX moved to dedicated page with Done-to-overview flow (owner: Codex)
  - Refs: `a181325a`
  - Route: `/experiments/{id}/assignment`.
  - Notes: Assignment is allowed independently of baseline completion; lock remains a UI-only guardrail.

### Placement/Rotation (Future Steps)
- [ ] Build tray composition UX using `Tray` + `TrayPlant` (owner: Codex)
- [ ] Build weekly rotation planner and logs workflow (owner: Codex)
  - API refs: `/api/v1/trays`, `/api/v1/tray-plants`, `/api/v1/rotation-logs`.

### Feeding/Lots/Weekly Sessions (Future Step + Ritual Loop)
- [ ] Build lot preparation and assignment workflow (owner: Codex)
  - API refs: `/api/v1/lots`, `/api/v1/recipes`.
- [ ] Build weekly execution loop (session checklist + feeding + adverse events + metrics) (owner: Codex)
  - API refs: `/api/v1/weekly-sessions`, `/api/v1/feeding-events`, `/api/v1/adverse-events`, `/api/v1/plant-weekly-metrics`.

### Photos & Media Handling
- [ ] (in progress) Expand photo UX beyond cockpit inline capture (owner: Codex)
  - API refs: `/api/v1/photos`, media path `/media/...`.
  - Notes: QR plant cockpit now supports inline photo upload and recent-photo preview; experiment-level gallery/reporting flows still pending.
- [ ] Add image processing policy (size caps, optional EXIF stripping) (owner: Codex)

### Reporting/Exports
- [ ] Define minimum V1 reports (CSV exports + summary views) (owner: manual)
- [ ] Add export endpoints and UI download actions (owner: Codex)

### PWA/Mobile UX
- [ ] Validate install/offline behavior across Android Chrome, iOS Safari, desktop Chromium (owner: manual)
- [ ] Add release-time cache versioning process for `sw.js` (owner: Codex)
  - Route refs: `/sw.js`, `/offline`.
- [ ] Decide if offline mutation queue is in or out of V1 (owner: manual)

### Deployment (Proxmox + Cloudflare Tunnel)
- [ ] Define single-host reverse proxy/routing topology and TLS termination (owner: manual)
  - Notes: decide Caddy vs Next proxy path strategy.
- [ ] Produce production compose/systemd deployment runbook for Proxmox VM/LXC (owner: Codex)
- [ ] Document Cloudflare Tunnel DNS and access policy mapping to app routes (owner: manual)

### Maintenance (backups, migrations, logs, metrics)
- [ ] Add backup + restore scripts and tested procedure for DB + uploads (owner: Codex)
- [ ] Add migration safety checklist and rollback plan (owner: Codex)
- [ ] Define app operational metrics and alert thresholds (owner: manual)

## Next 3 Prompts Plan
1. Placement step MVP: tray assignment workflow using existing Tray/TrayPlant models.
2. Rotation step MVP: rotation plan/log workflow tied to blocks and trays.
3. Step lock governance: define whether backend-enforced locks/audit trail are required for post-MVP integrity.

## Deferred Items (Explicitly Not in V1)
- [ ] Native mobile apps (iOS/Android) separate from PWA.
- [ ] Real branded illustrations/logos and full design system overhaul.
- [ ] Advanced ML/statistical analysis pipeline beyond basic reporting.
- [ ] Multi-tenant org/workspace model and fine-grained RBAC beyond admin/user.
- [ ] Real-time collaboration/websocket editing.
