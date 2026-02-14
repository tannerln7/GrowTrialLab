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
The repo has a working monorepo foundation with Docker Compose, Django + DRF backend, Next.js App Router frontend, Cloudflare Access invite-only auth, and a mobile-first dark UI baseline. Packet framework is in place and Packet 1 (Environment) and Packet 2 (Plants) are implemented end-to-end with API and UI.

Core domain models and CRUD endpoints exist, plus PWA baseline assets (manifest/icons/custom `sw.js` and `/offline`). QR labels resolve to an in-app plant page and labels encode absolute URLs. Packet 3 baseline MVP and Packet 4 groups/randomization are implemented with UI-only lock semantics.

The largest remaining V1 work is Packet 5-7 workflows, production-hardening/security/deployment details, and operational guardrails (backups, stricter packet-lock governance, reporting/export paths).

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
- [x] Setup state machine model and packet constants (owner: Codex)
  - Refs: `94f306a2`
  - Routes: `GET/PATCH /api/v1/experiments/{id}/setup-state/`.
- [x] Packet 1 Environment + Blocks APIs and completion validation (owner: Codex)
  - Refs: `80789485`
  - Routes: `PUT /api/v1/experiments/{id}/packets/environment/`, `POST /api/v1/experiments/{id}/packets/environment/complete/`, `GET/POST /api/v1/experiments/{id}/blocks/`, `PATCH /api/v1/blocks/{id}/`.
- [x] Wizard shell + Packet 1 frontend (owner: Codex)
  - Refs: `948a8a7a`
  - Routes: `/experiments/{id}/setup`, `/experiments`, `/experiments/new`.
- [x] Packet 2 Plants APIs (bulk import, ID generation, labels PDF, packet completion) (owner: Codex)
  - Refs: `a8766e1f`, `9e81428b`
  - Routes: `GET/POST /api/v1/experiments/{id}/plants/`, `POST /plants/bulk-import/`, `POST /plants/generate-ids/`, `GET /plants/labels.pdf`, `PUT /packets/plants/`, `POST /packets/plants/complete/`.
- [x] Packet 2 frontend + plants list UX (owner: Codex)
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
- [x] Packet 3 baseline APIs and lock state workflow (owner: Codex)
  - Refs: `2f919969`, `d0467ff4`
  - Routes: `GET /api/v1/experiments/{id}/baseline/status`, `GET/POST /api/v1/plants/{uuid}/baseline`, `POST /api/v1/experiments/{id}/baseline/lock`, `PUT /api/v1/experiments/{id}/packets/baseline/`, `POST /api/v1/experiments/{id}/packets/baseline/complete/`.
  - Notes: Baseline lock state is retained for UX/workflow signaling and packet progression.
- [x] Packet 3 frontend baseline workflow (owner: Codex)
  - Refs: `4e599540`
  - Routes: `/experiments/{id}/setup` (Packet 3 section), `/experiments/{id}/baseline`, `/p/{uuid}` baseline shortcut.
- [x] Baseline lock semantics switched to UI-only guardrail (owner: Codex)
  - Refs: `de058638`, `1cf9c9e6`, `e68610fc`
  - Notes: Backend no longer returns lock-based 403 for baseline/bin edits; baseline page is read-only by default when locked and supports local unlock/re-lock.
- [x] Packet 4 groups/randomization APIs with deterministic stratified assignment (owner: Codex)
  - Refs: `a6b19d01`, `990b1c6b`
  - Routes: `GET /api/v1/experiments/{id}/groups/status`, `POST /api/v1/experiments/{id}/groups/recipes`, `PATCH /api/v1/experiments/{id}/groups/recipes/{recipe_id}`, `POST /api/v1/experiments/{id}/groups/preview`, `POST /api/v1/experiments/{id}/groups/apply`, `PUT /api/v1/experiments/{id}/packets/groups/`, `POST /api/v1/experiments/{id}/packets/groups/complete/`.
  - Notes: Uses `stratified_v1` with strata `(bin, species.category)` and seed tracking in `packet_data["groups"]`.
- [x] Packet 4 frontend wizard flow with preview/apply and UI-only lock guardrail (owner: Codex)
  - Refs: `ea4373b7`
  - Routes: `/experiments/{id}/setup` (Packet 4 section).
  - Notes: Read-only-by-default when locked; local unlock/re-lock modal does not call backend unlock endpoints.

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

### Setup Wizard (Packets 1–8)
- [ ] (in progress) Keep Packet 1/2/3/4 stable while refining packet lock governance (owner: Codex)
  - Route: `PATCH /api/v1/experiments/{id}/setup-state/`.
- [ ] (in progress) Strengthen Packet 3 completion rule from MVP threshold to all-plants baseline coverage (owner: Codex)
  - Notes: Current MVP requires at least 1 baseline capture + all bins assigned.
- [ ] Implement Packet 5 (Tray assignment scaffolding) (owner: Codex)
- [ ] Implement Packet 6 (Rotation plan scaffolding) (owner: Codex)
- [ ] Implement Packet 7 (Feeding protocol + weekly loop scaffolding) (owner: Codex)
- [ ] Implement Packet 8 (Review/freeze setup) (owner: Codex)

### Experiments/Plants UX
- [ ] Improve experiment detail context page linking wizard, plants, and outputs (owner: Codex)
  - Routes: `/experiments`, `/experiments/{id}/setup`, `/experiments/{id}/plants`.
- [ ] Add UX affordances for validation errors and partial saves (owner: Codex)

### Baseline/Binning (Packet 3)
- [ ] (in progress) Expand metric template governance (owner: Codex)
  - API refs: `/api/v1/metric-templates/`, `/api/v1/plants/{uuid}/baseline`.
  - Notes: Add template migration strategy and tighter category coverage.
- [ ] Add baseline review/QA pass before packet completion (owner: Codex)

### Randomization/Groups (Packet 4)
- [x] Add group assignment strategy + deterministic seed handling (owner: Codex)
  - Refs: `a6b19d01`, `990b1c6b`
- [x] Persist assignment outputs and lock post-confirmation (owner: Codex)
  - Refs: `a6b19d01`, `ea4373b7`
- [ ] Decide if Packet 4 lock should remain UI-only or move to backend enforcement post-v1 (owner: manual)

### Trays/Rotation (Packets 5–6)
- [ ] Build tray composition UX using `Tray` + `TrayPlant` (owner: Codex)
- [ ] Build weekly rotation planner and logs workflow (owner: Codex)
  - API refs: `/api/v1/trays`, `/api/v1/tray-plants`, `/api/v1/rotation-logs`.

### Feeding/Lots/Weekly Sessions (Packet 7 + ritual loop)
- [ ] Build lot preparation and assignment workflow (owner: Codex)
  - API refs: `/api/v1/lots`, `/api/v1/recipes`.
- [ ] Build weekly execution loop (session checklist + feeding + adverse events + metrics) (owner: Codex)
  - API refs: `/api/v1/weekly-sessions`, `/api/v1/feeding-events`, `/api/v1/adverse-events`, `/api/v1/plant-weekly-metrics`.

### Photos & Media Handling
- [ ] Add photo upload UX and gallery browsing per experiment/plant/week (owner: Codex)
  - API refs: `/api/v1/photos`, media path `/media/...`.
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
1. Packet 5 MVP: tray assignment workflow using existing Tray/TrayPlant models.
2. Packet 6 MVP: rotation plan/log workflow tied to blocks and trays.
3. Packet lock governance: define whether backend-enforced locks/audit trail are required for post-MVP integrity.

## Deferred Items (Explicitly Not in V1)
- [ ] Native mobile apps (iOS/Android) separate from PWA.
- [ ] Real branded illustrations/logos and full design system overhaul.
- [ ] Advanced ML/statistical analysis pipeline beyond basic reporting.
- [ ] Multi-tenant org/workspace model and fine-grained RBAC beyond admin/user.
- [ ] Real-time collaboration/websocket editing.
