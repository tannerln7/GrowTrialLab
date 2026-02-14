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

## Current Canonical Flow
- Canonical client flow uses `GET /api/v1/experiments/{id}/status/summary` as the source of truth for gating and readiness.
- Frontend network contract uses same-origin API paths (`/api/*`, `/healthz`, `/media/*`) proxied by Next rewrites, so LAN clients can use `http://<host-ip>:3000` without direct browser calls to backend `localhost`.
- Canonical navigation starts at `/experiments/{id}`:
  - Redirects to `/experiments/{id}/setup` while bootstrap setup is incomplete.
  - Redirects to `/experiments/{id}/overview` after bootstrap setup is complete.
- Bootstrap setup is intentionally minimal: Plants, Blocks/Slots, and Recipes.
  - Slots now means Tents + Blocks (physical hierarchy: Tent -> Block -> Tray -> Plant).
- Readiness work happens from Overview and dedicated pages:
  - Baseline capture: `/experiments/{id}/baseline`
  - Placement: `/experiments/{id}/placement`
  - Rotation: `/experiments/{id}/rotation`
  - Feeding: `/experiments/{id}/feeding`
  - Schedule: `/experiments/{id}/schedule`
- Terminology note: API/DB field `bin` remains unchanged for compatibility, but UI presents it as **Grade** to avoid confusion with physical tray/bin containers.
- Assignment route (`/experiments/{id}/assignment`) remains for legacy recipe/group tooling, but tray placement (`Tray.assigned_recipe`) is the canonical recipe-assignment source for start/readiness/feeding.
- Experiment lifecycle is being introduced as a prerequisite for future delete-gating/immutability:
  - `draft` -> `running` -> `stopped` (archive deferred)

## Lifecycle Implications
- Future freeze scope once running (deferred policy enforcement after lifecycle lands):
  - slots/blocks structure, recipes, metric template selection, experiment identity/structure, placement structure
- Still editable while running (intended):
  - notes, photos, events, removed/replacement status changes, operational annotations
- Deletion gating and hard immutability rules are intentionally deferred until lifecycle primitives exist.

## Current Status Summary
The repo has a working monorepo foundation with Docker Compose, Django + DRF backend, Next.js App Router frontend, Cloudflare Access invite-only auth, and a mobile-first dark UI baseline. Setup is now bootstrap-only (Plants, Tents+Blocks/Slots, Recipes), and readiness workflows (baseline + placement/tray recipes + feeding) are centered in Overview and dedicated pages.

Core domain models and CRUD endpoints exist, plus PWA baseline assets (manifest/icons/custom `sw.js` and `/offline`). QR labels resolve to an in-app plant page and labels encode absolute URLs. Baseline and Groups/Assignment are implemented with UI-only lock semantics, `/p/{uuid}` now functions as a mobile-first plant cockpit/task launcher, and Scheduling MVP provides timeframe-based recurring action planning with grouped upcoming slots.

The largest remaining V1 work is lifecycle hardening (immutability/deletion policies), production-hardening/security/deployment details, and operational guardrails (backups, stricter step-lock governance, reporting/export paths).

## Completed Milestones
- [x] Monorepo scaffold and local compose runtime (owner: Codex)
  - Refs: `d1268cc7`, `ded5b193`
  - Notes: `backend/`, `frontend/`, `infra/`; services at `http://localhost:8000` and `http://localhost:3000`.
- [x] Local verification workflow script and docs (owner: Codex)
  - Refs: `0a2e3228`
  - Notes: `infra/scripts/verify.sh` runs tests/typecheck/build checks.
- [x] LAN-safe frontend backend proxy wiring (owner: Codex)
  - Refs: `244c69c5`
  - Notes: Frontend now uses same-origin requests + Next rewrites to backend (`NEXT_BACKEND_ORIGIN`), replacing browser `localhost:8000` dependency.
- [x] Local dev DB reset script for clean-state validation (owner: Codex)
  - Refs: `b8ac31e9`
  - Notes: `infra/scripts/reset-dev.sh` safely resets local compose Postgres volume, rebuilds stack, and runs migrations.
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
  - Routes: `PUT /api/v1/experiments/{id}/packets/environment/`, `POST /api/v1/experiments/{id}/packets/environment/complete/`, `GET/POST /api/v1/experiments/{id}/blocks/`, `POST /api/v1/experiments/{id}/blocks/defaults`, `PATCH /api/v1/blocks/{id}/`.
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
  - Routes: `GET /api/v1/experiments/{id}/baseline/status`, `GET /api/v1/experiments/{id}/baseline/queue`, `GET/POST /api/v1/plants/{uuid}/baseline`, `POST /api/v1/experiments/{id}/baseline/lock`, `PUT /api/v1/experiments/{id}/packets/baseline/`, `POST /api/v1/experiments/{id}/packets/baseline/complete/`.
  - Notes: Baseline lock state is retained for UX/workflow signaling and step progression.
- [x] Baseline frontend workflow (owner: Codex)
  - Refs: `4e599540`
  - Routes: `/experiments/{id}/baseline`, `/experiments/{id}/overview`, `/p/{uuid}` baseline shortcut.
  - Notes: Baseline page now supports queue mode (`remaining_count`, next-missing navigation, and save-and-next flow) using `GET /api/v1/experiments/{id}/baseline/queue`.
- [x] Baseline lock semantics switched to UI-only guardrail (owner: Codex)
  - Refs: `de058638`, `1cf9c9e6`, `e68610fc`
  - Notes: Backend no longer returns lock-based 403 for baseline/bin edits; baseline page is read-only by default when locked and supports local unlock/re-lock.
- [x] Groups/Assignment APIs with deterministic stratified assignment (owner: Codex)
  - Refs: `a6b19d01`, `990b1c6b`
  - Routes: `GET /api/v1/experiments/{id}/groups/status`, `POST /api/v1/experiments/{id}/groups/recipes`, `PATCH /api/v1/experiments/{id}/groups/recipes/{recipe_id}`, `POST /api/v1/experiments/{id}/groups/preview`, `POST /api/v1/experiments/{id}/groups/apply`, `PUT /api/v1/experiments/{id}/packets/groups/`, `POST /api/v1/experiments/{id}/packets/groups/complete/`.
  - Notes: Uses `stratified_v1` with strata `(bin, species.category)` and seed tracking in `packet_data["groups"]`.
- [x] Groups frontend flow with preview/apply and UI-only lock guardrail (owner: Codex)
  - Refs: `ea4373b7`
  - Routes: `/experiments/{id}/assignment`, `/experiments/{id}/overview`.
  - Notes: Recipes are editable during setup; assignment preview/apply stays gated until bootstrap setup is complete.
- [x] Experiment overview roster/work queue endpoint and UI (owner: Codex)
  - Refs: `51a32d99`, `65f84632`, `12517df6`
  - Routes: `GET /api/v1/experiments/{id}/overview/plants`, `/experiments/{id}/overview`.
  - Notes: Includes aggregate counts and filterable plant queue (Needs Baseline/Grade/Placement/Tray Recipe, Active, Removed) with mobile cards.
- [x] Hub-and-spoke experiment navigation centered on Overview (owner: Codex)
  - Refs: `310f00b5`, `41599236`, `669ae104`, `7005524b`, `f2b49938`, `c61be2e7`
  - Routes: `/experiments/{id}` now routes to `/setup` until bootstrap is complete, then to `/overview`; subpages keep prominent `← Overview` return links.
  - Notes: `/setup` is hidden after bootstrap completion and overview drives readiness actions.
- [x] Experiment status summary endpoint for bootstrap/readiness gating (owner: Codex)
  - Refs: `ee000fab`, `c8b7db72`, `d302abd6`
  - Route: `GET /api/v1/experiments/{id}/status/summary`.
  - Notes: Setup completeness checks plants/blocks/recipes only; readiness now tracks `needs_baseline`, `needs_placement`, and `needs_tray_recipe` on active plants.
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
- [x] Location-aware plant context and UI Grade terminology pass (owner: Codex)
  - Routes: `GET /api/v1/experiments/{id}/overview/plants`, `GET /api/v1/plants/{uuid}/cockpit`, `/experiments/{id}/overview`, `/p/{uuid}`, `/experiments/{id}/baseline`.
  - Notes: Overview/cockpit payloads now include derived tent/block/tray location + tray occupancy fields; overview roster is grouped/sorted by tent and tray with an explicit Unplaced section; user-facing `Bin` labels are now `Grade` while API keys remain `bin`.
- [x] Plant replacement workflow with remove/replace chain links (owner: Codex)
  - Refs: `20032471`, `eea577e4`, `153922e9`, `e0800082`, `74506afa`, `325a7667`, `9169ace1`
  - Routes: `POST /api/v1/plants/{uuid}/replace`, `GET /api/v1/plants/{uuid}/cockpit`, `GET /api/v1/experiments/{id}/overview/plants`.
  - Notes: Replacement creates a new plant record/UUID, marks original as `removed`, keeps chain links (`old -> new` and `new -> old`), inherits assignment by default, and requires new baseline capture.
- [x] Experiment lifecycle state and start/stop controls (owner: Codex)
  - Refs: `8f3f79c8`, `f9cb600a`, `dd7a6279`, `b86db9f1`
  - Routes: `POST /api/v1/experiments/{id}/start`, `POST /api/v1/experiments/{id}/stop`, `GET /api/v1/experiments/{id}/status/summary`.
  - Notes: Lifecycle states are `draft`/`running`/`stopped`; start requires readiness (`ready_to_start=true`) and returns `409` with counts when blocked.
- [x] Placement step MVP with tray composition workflow (owner: Codex)
  - Refs: `8f3f79c8`, `f9cb600a`, `dd7a6279`, `47eef321`, `b86db9f1`
  - Routes: `GET /api/v1/experiments/{id}/placement/summary`, `POST /api/v1/experiments/{id}/placement/auto`, `POST /api/v1/experiments/{id}/trays`, `PATCH /api/v1/trays/{id}/`, `POST /api/v1/trays/{id}/plants`, `DELETE /api/v1/trays/{id}/plants/{tray_plant_id}`, `/experiments/{id}/placement`.
  - Notes: Enforces one-tray-per-plant, one-tray-per-block, tray-level recipe assignment, removed-plant placement rejection, and running-state placement mutation locks.
- [x] Multi-tent hierarchy and species restriction enforcement (owner: Codex)
  - Refs: `cd9e2cf6`, `4e74e10d`, `8157c551`
  - Routes: `GET/POST /api/v1/experiments/{id}/tents`, `PATCH/DELETE /api/v1/tents/{id}`, `GET/POST /api/v1/tents/{id}/blocks`, `POST /api/v1/tents/{id}/blocks/defaults`, `GET /api/v1/experiments/{id}/placement/summary`, `POST /api/v1/trays/{id}/plants`, `POST /api/v1/experiments/{id}/rotation/log`.
  - Notes: Blocks now belong to tents; destination-tent species restrictions are enforced for tray placement and tray moves. Status summary/start readiness now include tent presence and tent-restriction compliance.
- [x] Placement/rotation polish pass: valid-option filtering, tray capacity, and deterministic auto-place diagnostics (owner: Codex)
  - Refs: `35513ef9`, `ee65db44`, `edcc4142`
  - Routes: `POST /api/v1/experiments/{id}/placement/auto`, `GET /api/v1/experiments/{id}/placement/summary`, `POST /api/v1/experiments/{id}/trays`, `POST /api/v1/trays/{id}/plants`, `PATCH /api/v1/trays/{id}/`, `/experiments/{id}/placement`, `/experiments/{id}/rotation`, `/experiments/{id}/slots`, `/experiments/{id}/plants`.
  - Notes: Tray capacity (`Tray.capacity`) is now enforced, placement/rotation destination selectors are restriction-filtered, auto-place returns structured unplaceable diagnostics, and create flows now prefill suggested IDs (`TN*`, `B*`, `TR*`, category-prefixed plant IDs).
- [x] Rotation MVP with tray movement logs and recent history (owner: Codex)
  - Refs: `3b52663c`, `9798c9fe`, `ec06d079`, `b80218ae`
  - Routes: `GET /api/v1/experiments/{id}/rotation/summary`, `POST /api/v1/experiments/{id}/rotation/log`, `/experiments/{id}/rotation`.
  - Notes: Rotation logging is allowed only for `running` lifecycle state and updates `Tray.block` as the canonical current location.
- [x] Feeding MVP with running-only queue logging and cockpit entry (owner: Codex)
  - Refs: `90aa50fb`, `af3c5c71`, `6146269d`
  - Routes: `GET /api/v1/experiments/{id}/feeding/queue`, `POST /api/v1/plants/{uuid}/feed`, `GET /api/v1/plants/{uuid}/feeding/recent`, `/experiments/{id}/feeding`.
  - Notes: Feeding writes are lifecycle-gated to `running` (backend `409` outside running); queue uses a 7-day needs-first window and Plant Cockpit now exposes last-fed hint + quick feed launch.
- [x] Scheduling MVP with timeframe-based recurring action planning (owner: Codex)
  - Refs: `de03652d`, `4a775bfe`
  - Routes: `GET/POST /api/v1/experiments/{id}/schedules`, `PATCH/DELETE /api/v1/schedules/{id}`, `GET /api/v1/experiments/{id}/schedules/plan`, `/experiments/{id}/schedule`.
  - Notes: Plan view groups actions by date + exact time (or timeframe bucket), keeps deterministic ordering, and surfaces blocker badges (`experiment not running`, `needs tray recipe`, `unplaced`) without auto-executing actions.
- [x] Tray-canonical assignment + recipe-locked feeding/readiness (owner: Codex)
  - Refs: `fec05082`, `a3fd3a1d`
  - Routes: `GET /api/v1/experiments/{id}/status/summary`, `GET /api/v1/experiments/{id}/overview/plants`, `GET /api/v1/plants/{uuid}/cockpit`, `GET /api/v1/experiments/{id}/feeding/queue`, `POST /api/v1/plants/{uuid}/feed`, `POST /api/v1/experiments/{id}/placement/auto`, `PATCH /api/v1/trays/{id}/`.
  - Notes: Operational assignment derives from tray placement (`TrayPlant -> Tray.assigned_recipe`); feeding and start readiness both block when plants are unplaced or tray recipes are missing.

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

### Experiment Lifecycle
- [ ] Add delete-gating and immutability policy enforcement after lifecycle stabilizes (owner: Codex)
  - Notes: Deferred intentionally; implement after lifecycle API/UX is in place.

### Setup Wizard (Steps)
- [ ] (in progress) Evaluate whether legacy setup-state progression is still needed post-bootstrap refactor (owner: Codex)
  - Route: `PATCH /api/v1/experiments/{id}/setup-state/`.
- [ ] (in progress) Strengthen Baseline completion rule from MVP threshold to all-plants baseline coverage (owner: Codex)
  - Notes: Current MVP requires at least 1 baseline capture + all bins assigned.
- [ ] Implement Start step scaffolding (owner: Codex)

### Experiments/Plants UX
- [ ] (in progress) Improve experiment detail context page linking overview, plants, and outputs (owner: Codex)
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
- [x] Build tray composition UX using `Tray` + `TrayPlant` (owner: Codex)
  - Refs: `47eef321`, `b86db9f1`
  - API refs: `/api/v1/experiments/{id}/placement/summary`, `/api/v1/experiments/{id}/trays`, `/api/v1/trays/{id}/plants`.
- [x] Build rotation logging workflow tied to trays/blocks (owner: Codex)
  - Refs: `3b52663c`, `9798c9fe`, `ec06d079`, `b80218ae`
  - API refs: `/experiments/{id}/rotation`, `GET /api/v1/experiments/{id}/rotation/summary`, `POST /api/v1/experiments/{id}/rotation/log`.

### Feeding/Lots/Weekly Sessions (Future Step + Ritual Loop)
- [ ] Build lot preparation and assignment workflow (owner: Codex)
  - API refs: `/api/v1/lots`, `/api/v1/recipes`.
- [ ] Build weekly execution loop (session checklist + feeding + adverse events + metrics) (owner: Codex)
  - API refs: `/api/v1/weekly-sessions`, `/api/v1/feeding-events`, `/api/v1/adverse-events`, `/api/v1/plant-weekly-metrics`.

### Scheduling
- [ ] Add schedule execution assist actions (mark complete/skipped from plan slots) (owner: Codex)
- [ ] Add schedule-specific overview aggregates beyond `due_counts_today` (owner: Codex)
- [ ] Add optional reminders/notifications policy (owner: manual)

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
1. Lifecycle governance hardening: define backend-enforced immutability/deletion rules after start.
2. Lots MVP: connect feeding to optional lot/batch context without blocking fast entry.
3. Weekly ritual loop MVP: lightweight session/metrics/feeding workflow on top of existing events.

## History / Legacy Appendix
- Legacy setup naming migration (completed):
  - Refs: `a6b19d01`, `ea4373b7`
  - Notes: User-facing packet wording was removed while backend compatibility keys/endpoints remained stable.
- Legacy compatibility contracts still in use:
  - `ExperimentSetupState` fields such as `current_packet`, `completed_packets`, `locked_packets`, `packet_data`.
  - Compatibility endpoint family under `/api/v1/experiments/{id}/packets/...`.
  - Route refs: `/packets/environment`, `/packets/plants`, `/packets/baseline`, `/packets/groups`.

## Deferred Items (Explicitly Not in V1)
- [ ] Native mobile apps (iOS/Android) separate from PWA.
- [ ] Real branded illustrations/logos and full design system overhaul.
- [ ] Advanced ML/statistical analysis pipeline beyond basic reporting.
- [ ] Multi-tenant org/workspace model and fine-grained RBAC beyond admin/user.
- [ ] Real-time collaboration/websocket editing.
