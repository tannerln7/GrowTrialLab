# GrowTrialLab Decisions Log

This file records architecture/product decisions and why they were made.

## Current Canonical Flow
- Canonical client gating and readiness source: `GET /api/v1/experiments/{id}/status/summary`.
- Canonical entry route: `/experiments/{id}`.
  - Redirect to `/experiments/{id}/setup` until bootstrap setup is complete.
  - Redirect to `/experiments/{id}/overview` once bootstrap setup is complete.
- Canonical bootstrap setup scope: Plants, Tents+Slots, Recipes only.
- Canonical readiness flows: `/experiments/{id}/baseline`, `/experiments/{id}/placement`, `/experiments/{id}/rotation`, `/experiments/{id}/feeding`, and `/experiments/{id}/schedule`, launched from Overview.
- Recipe management is experiment-scoped (`/experiments/{id}/recipes`), and tray-level assignment is canonical for operations (`Tray.assigned_recipe`).
- Lifecycle prerequisite policy: deletion gating and strict immutability are deferred until lifecycle primitives (`draft`/`running`/`stopped`) exist.
- Terminology policy: plant grading is canonical as `grade` across DB/API/UI.

## Lifecycle Implications (Planned)
- Intended freeze scope once an experiment is `running`:
  - slots structure, recipes, selected baseline template scope, experiment structural identity, placement structure
- Intended mutable scope while `running`:
  - notes, photos, events, remove/replace plant actions, operational annotations
- Deferred until lifecycle is implemented:
  - hard delete gating while running
  - backend-enforced immutability rules tied to lifecycle transitions

## Decision Entries

### 2026-02-16: Envelope-first API contracts + slot/grade canonical schema
- Decision: Standardize API contracts around expandable envelopes and nested location objects:
  - list shape: `{ count, results, meta }`
  - blocked operations: `{ detail, diagnostics }`
  - location shape: `{ location: { status, tent, slot, tray } }`
  - tent layout shape: `{ schema_version: 1, shelves: [{ index, tray_count }] }`
- Decision: Complete schema cleanup for current product vision:
  - `Block -> Slot`
  - `Plant.bin -> Plant.grade`
  - remove packet/setup-state and groups/randomization compatibility endpoints
- Rationale: Database is disposable in dev; canonical contracts reduce payload drift and keep future additions additive instead of breaking.
- Invariants:
  - Slot coordinates are canonical identity for ordering/display/code.
  - Slot coordinates are immutable via PATCH; coordinate changes happen only through `POST /api/v1/tents/{id}/slots/generate`.
  - Slot regeneration in `draft|stopped` supports safe reshape (occupied coordinates must remain valid) and returns orphan diagnostics when blocked.

### 2026-02-13: Backend stack is Django + DRF on Postgres
- Decision: Use Django as core backend framework, DRF for APIs, and Postgres as the DB.
- Rationale: Fast CRUD delivery with mature auth/migrations/admin ecosystem and strong local self-hosted support.
- Refs: `d1268cc7`, `fddd4d07`, `fe4128f6`.

### 2026-02-13: Frontend stack is Next.js App Router (TypeScript)
- Decision: Use Next.js App Router for frontend UI and route structure.
- Rationale: File-based routes and strong TS tooling fit rapid setup-step UI iteration.
- Refs: `d1268cc7`, `948a8a7a`, `53ace4f8`.

### 2026-02-13: Local runtime is Docker Compose; production target is self-hosted (Proxmox)
- Decision: Use `docker compose` for local full-stack boot and keep deployment oriented toward self-hosting.
- Rationale: Single command startup and reproducible service topology.
- Refs: `d1268cc7`, `0a2e3228`; runtime file `docker-compose.yml`.

### 2026-02-14: Frontend uses same-origin API proxy for LAN-safe access
- Decision: Frontend network calls now target same-origin paths (`/api/*`, `/healthz`, `/media/*`) and rely on Next rewrites to proxy requests to backend (`NEXT_BACKEND_ORIGIN`).
- Rationale: Avoids browser-side hardcoded `localhost:8000` failures when operators open the app from other LAN devices via `http://<host-ip>:3000`.
- Notes: Local compose defaults are intentionally dev-oriented (`NEXT_BACKEND_ORIGIN=http://backend:8000`, permissive `DJANGO_ALLOWED_HOSTS` override). Production must set strict host/origin values.
- Follow-up: Rewrite config preserves trailing slashes for `/api/:path*/` so DRF list routes do not enter slash-normalization redirect loops.

### 2026-02-14: Dev DB reset must not run concurrent migration processes
- Decision: `infra/scripts/reset-dev.sh` now waits for backend health after `docker compose up` and does not run a second explicit `manage.py migrate`.
- Rationale: Backend startup already runs migrations/bootstrapping; a concurrent second migrate process can race on migration schema creation and fail with Postgres unique violations.
- Notes: Script now treats backend `/healthz` readiness as completion signal for reset flow.

### 2026-02-13: Auth model is Cloudflare Access JWT verification + invite-only users
- Decision: Verify `Cf-Access-Jwt-Assertion` server-side; do not trust headers alone; unknown users denied unless bootstrap admin path applies.
- Rationale: Zero-password architecture with strong edge identity and strict invite-only access.
- Refs: `262849c8`, `5d5ee41d`, `bba65cd9`, `f00306e5`.

### 2026-02-13: Roles are intentionally limited to `admin` and `user`
- Decision: Keep role model minimal for v1.
- Rationale: Reduced permission complexity while preserving admin operations separation (`/api/admin/*`).
- Refs: `262849c8`, `5d5ee41d`.

### 2026-02-13: Plant labels encode stable plant identifier path `/p/{plant_uuid}`
- Decision: QR payload for labels uses stable UUID path reference.
- Rationale: Decouples labels from mutable display IDs and supports future public/internal resolver route.
- Refs: `a8766e1f`.

### 2026-02-14: Plant QR labels resolve to in-app `/p/{uuid}` and print Plant ID text
- Decision: Add frontend route `/p/[id]` backed by `GET /api/v1/plants/{uuid}/`; label QR encodes absolute URL and printed line shows Plant ID (or pending), not URL.
- Rationale: Scanning a label should open a usable in-app details page while keeping printed labels human-readable.
- Refs: `7352300e`, `66824a6e`, `c8aa364c`.

### 2026-02-14: Absolute label URLs use `PUBLIC_BASE_URL` with localhost fallback
- Decision: Build QR URLs from `PUBLIC_BASE_URL` when valid; fallback to `http://localhost:3000` when missing/invalid.
- Rationale: Keeps local dev functional without extra setup, while allowing production QR labels to resolve externally.
- Refs: `66824a6e`.
- Caution: Production must set `PUBLIC_BASE_URL` or printed QR codes will point to localhost.

### 2026-02-14: Baseline metrics use structured templates with week 0 storage
- Decision: Add `MetricTemplate` model and validate baseline payloads by species category template; store baseline records in `PlantWeeklyMetric` with `week_number=0`.
- Rationale: Keeps baseline capture structured while reusing the existing metrics pipeline.
- Refs: `5571d379`, `2f919969`, `d0467ff4`.

### 2026-02-14: Baseline step lock is a UI-only guardrail in v1
- Decision: Keep baseline lock state and lock endpoints for workflow signaling, but do not enforce lock-based write denial in backend baseline/grade APIs.
- Rationale: Reduces v1 complexity and avoids backend unlock override paths while preserving UX-level accidental-edit protection.
- Refs: `de058638`, `1cf9c9e6`, `e68610fc`.
- Caution: Audit-grade integrity will require backend-enforced lock rules in a later phase.

### 2026-02-14: Baseline UX uses dedicated capture page from overview readiness actions
- Decision: Implement `/experiments/{id}/baseline` as the baseline capture flow and trigger it from overview readiness and per-plant quick actions.
- Rationale: Keeps baseline as a post-bootstrap readiness action instead of setup content.
- Refs: `4e599540`.

### 2026-02-14: Groups step uses Recipe as group with deterministic stratified randomization
- Decision: Reuse `Recipe` as group definition, enforce `R0` + `R1...` codes, and randomize active plants with `stratified_v1` over `(bin, species.category)` using seed-driven deterministic shuffling.
- Rationale: Avoids extra schema while making group assignment reproducible and balanced within key biological strata.
- Refs: `a6b19d01`, `990b1c6b`.

### 2026-02-14: Groups lock follows UI-only guardrail semantics
- Decision: Groups completion sets `packet_data["groups"]["locked"]=true` for UX signaling, but backend apply/edit endpoints remain writable.
- Rationale: Consistency with baseline v1 lock model and simpler operator workflow.
- Refs: `a6b19d01`, `ea4373b7`.
- Caution: Strong integrity controls (auditable lock enforcement) remain a post-v1 hardening item.

### 2026-02-14: Experiment Overview is the primary roster/work queue surface
- Decision: Add `/experiments/{id}/overview` backed by `GET /api/v1/experiments/{id}/overview/plants` to centralize plant queue triage (needs baseline/grade/placement/tray recipe, active, removed) and search.
- Rationale: Operators need one mobile-first page to identify what requires action before entering specific step flows.
- Refs: `51a32d99`, `65f84632`, `12517df6`.

### 2026-02-14: Experiment navigation follows a hub-and-spoke model
- Decision: Treat `/experiments/{id}` as canonical entry and redirect to `/setup` until bootstrap completion, then to `/overview`; subpages keep prominent `← Overview` return actions and minimize lateral cross-links.
- Rationale: Preserves required bootstrap gating while keeping overview as the steady-state hub.
- Refs: `310f00b5`, `41599236`, `669ae104`.

### 2026-02-14: Setup is bootstrap-only and hidden after completion
- Decision: Reduce setup to three bootstrap checks only (Plants, Tents+Slots, Recipes). Once complete, `/experiments/{id}/setup` redirects to overview and no normal navigation links point back to setup.
- Rationale: Operators should complete setup quickly, then work from overview readiness actions instead of a long multi-step wizard.
- Refs: `f2b49938`, `c61be2e7`.
- API support: `GET /api/v1/experiments/{id}/status/summary` (`ee000fab`, `c8b7db72`, `d302abd6`).

### 2026-02-14: Plant action pages use explicit safe return links to overview
- Decision: Plant pages accept a `from` query value for back navigation, but only honor relative experiment paths (`/experiments/...`); otherwise fallback to the plant experiment overview.
- Rationale: Preserves work-queue filters when navigating from overview without introducing open redirect risk.
- Refs: `2e911442`, `226d9654`.

### 2026-02-14: `/p/{uuid}` is a QR-first Plant Cockpit (task launcher + minimal history)
- Decision: Upgrade plant pages to consume `GET /api/v1/plants/{uuid}/cockpit` and show a mobile-first cockpit with sticky plant context, prioritized next action links, inline photo upload, and recent activity.
- Rationale: QR scan workflows need immediate action guidance without extra navigation; cockpit keeps operators in one-handed flow while reusing existing Baseline/Assignment routes.
- Refs: `6e26cb27`, `2ff247c6`, `3ae322ad`.
- Notes: Safe back behavior (`from` sanitization + fallback) is preserved, with fallback now using setup-vs-overview home routing from bootstrap completeness (`ee000fab`, `a181325a`).

### 2026-02-14: Plant replacement uses remove-and-replace chain with new UUID record
- Decision: Add guided replacement flow via `POST /api/v1/plants/{uuid}/replace` that creates a new plant record (new UUID), links chain pointers (`replaced_by`/reverse `replaces`), marks original plant `removed`, and defaults to inheriting assignment while requiring fresh baseline capture.
- Rationale: Real-world plant loss/replacement is common; chain-linked replacements preserve experiment continuity without mutating historical organism records.
- Refs: `20032471`, `eea577e4`, `153922e9`, `e0800082`, `74506afa`, `325a7667`, `9169ace1`.
- Notes: Cockpit and overview now expose replacement links for navigation (`old -> new`, `new -> old`) and removed plants are excluded from active readiness queues.

### 2026-02-14: Assignment moved to dedicated route and decoupled from baseline gating
- Decision: Use `/experiments/{id}/assignment` for recipe editing + preview/apply, and allow assignment even when baseline is incomplete.
- Rationale: Baseline and assignment are readiness actions coordinated by overview, not setup prerequisites.
- Refs: `a181325a`, `c61be2e7`.

### 2026-02-14: Lifecycle primitives introduced before delete-gating and immutability enforcement
- Decision: Add experiment lifecycle fields and transitions (`draft`/`running`/`stopped`) with start/stop endpoints; keep strict delete-gating and immutability policies deferred.
- Rationale: Lifecycle state is the prerequisite for policy enforcement and avoids backtracking when implementing future “cannot delete while running” rules.
- Refs: `8f3f79c8`, `f9cb600a`, `dd7a6279`, `b86db9f1`.
- Notes: Start uses canonical readiness from `GET /api/v1/experiments/{id}/status/summary` and returns `409` with readiness counts if blocked.

### 2026-02-14: Placement MVP uses trays as physical placement units
- Decision: Implement dedicated placement workflow on `/experiments/{id}/placement` with experiment-scoped summary and tray add/remove convenience APIs.
- Rationale: Operators need a focused surface to place plants into physical containers without mixing placement work into setup/assignment screens.
- Refs: `8f3f79c8`, `f9cb600a`, `dd7a6279`, `47eef321`, `b86db9f1`.
- Notes: Server enforces one-tray-per-plant and rejects removed plants from placement; placement is not required to start in v1.

### 2026-02-14: Rotation MVP is running-only tray movement logging
- Decision: Implement overview-launched rotation logging on `/experiments/{id}/rotation` with `GET /rotation/summary` and `POST /rotation/log`.
- Rationale: Operators need a low-friction way to capture tray moves during active runs without introducing weekly scheduler/due logic.
- Refs: `3b52663c`, `9798c9fe`, `ec06d079`, `b80218ae`.
- Notes: Rotation logging rejects non-running lifecycle states (`409`) and updates `Tray.slot` to the destination slot as the canonical current location.

### 2026-02-14: Feeding MVP is running-only queue logging launched from Overview/Cockpit
- Decision: Implement feeding workflow on `/experiments/{id}/feeding` plus plant-level `POST /api/v1/plants/{uuid}/feed`, with queue source `GET /api/v1/experiments/{id}/feeding/queue` and history via `GET /api/v1/plants/{uuid}/feeding/recent`.
- Rationale: Operators need fast, repetitive feed capture in active runs without waiting for lot/batch tooling; queue mode reduces navigation overhead.
- Refs: `90aa50fb`, `af3c5c71`, `6146269d`.
- Invariants: Backend feed writes enforce lifecycle `running` (`409` when draft/stopped); queue uses a fixed 7-day needs-feeding window for v1.
- Deferred hooks: lot/batch integration and richer dose structure are intentionally deferred.

### 2026-02-14: Scheduling MVP is timeframe-first and grouped by execution slot
- Decision: Add first-class schedule entities (`ScheduleAction`, `ScheduleRule`, `ScheduleScope`) and expose `GET/POST /api/v1/experiments/{id}/schedules`, `PATCH/DELETE /api/v1/schedules/{id}`, and `GET /api/v1/experiments/{id}/schedules/plan`.
- Rationale: Operators need a simple recurring-action planner that supports weekly patterns and interval rules without introducing background job infrastructure in v1.
- Invariants:
  - Plan grouping key is `date + exact_time` (when set) or `date + timeframe`; exact-time actions do not merge into generic timeframe buckets.
  - Slot actions are deterministically ordered by `action_type` then `title`.
  - Schedules guide operator work; they do not auto-execute and they do not bypass lifecycle gates on feed/rotation execution endpoints.
- UX alignment:
  - `/experiments/{id}/schedule` is overview-launched and mobile-first.
  - Scope pickers are grouped by physical location (Tent/Tray/Plant) with restriction and occupancy context.
  - Feed schedules surface blockers (`Needs tray recipe`, `Unplaced`, `Experiment not running`) instead of silently failing at save time.

### 2026-02-14: Trays are the canonical assignment unit; feeding is locked to tray recipe
- Decision: Canonical assignment for operations is derived from placement (`TrayPlant -> Tray.assigned_recipe`), not from a separate per-plant assignment field. `Plant.assigned_recipe` is retained only as compatibility fallback where needed.
- Rationale: Removes duplicated assignment systems (groups vs placement) and aligns operator behavior with physical tray workflow.
- Refs: `fec05082`, `a3fd3a1d`.
- Invariants:
  - `GET /api/v1/experiments/{id}/status/summary` readiness now includes `needs_placement` and `needs_tray_recipe`; `ready_to_start` requires both to be zero.
  - `POST /api/v1/plants/{uuid}/feed` resolves recipe from tray placement and returns `409` when unplaced or tray recipe is missing.
  - Placement edits (`tray patch`, `add/remove plant`, `auto-place`) are blocked while lifecycle is `running`.
- UX impact: Overview readiness/actions and feeding queue now surface placement/tray-recipe blockers directly.

### 2026-02-14: Multi-tent hierarchy is first-class and restrictions are backend-enforced
- Decision: Physical hierarchy is now `Tent -> Slot -> Tray -> Plant`; slots belong to tents and experiments can manage multiple tents. Tent-level `allowed_species` restrictions are enforced server-side for both `POST /api/v1/trays/{tray_id}/plants` and `POST /api/v1/experiments/{id}/rotation/log` destination moves.
- Rationale: Multi-tent operations require explicit structure and hard validation to prevent accidental placement/moves into incompatible environments.
- Refs: `cd9e2cf6`, `4e74e10d`, `8157c551`.
- Invariants:
  - Empty `tent.allowed_species` means unrestricted; non-empty means only listed species allowed.
  - Restrictions apply when a tray is in a slot/tent; unplaced trays are not restriction-checked until placement/move.
  - `GET /api/v1/experiments/{id}/status/summary` now includes tent-aware readiness (`needs_tent_restriction`) and setup requires tents + slots.

### 2026-02-14: Placement choices are now restriction-aware and tray-capacity-aware by default
- Decision: Placement and rotation UIs now show only valid destination options (tented slots + restriction-compatible slots), while backend enforces the same rules with explicit 409s. Tray capacity is first-class (`Tray.capacity`) and enforced on placement writes.
- Rationale: Operators should not be asked to choose impossible options; invalid choices are filtered out up front, with inline “why blocked” hints when no valid destination exists.
- Refs: `35513ef9`, `ee65db44`, `edcc4142`.
- Invariants:
  - `POST /api/v1/trays/{tray_id}/plants` returns `409` when tray is full (`Tray is full (capacity N).`) and still enforces tent restrictions.
  - `PATCH /api/v1/trays/{id}/` validates destination slot compatibility against tray contents and enforces one tray per slot.
  - `POST /api/v1/experiments/{id}/placement/auto` is deterministic and now returns structured unplaceable diagnostics (`reason_counts`, `unplaceable_plants`) instead of opaque failures.
- UX alignment:
  - Placement/rotation pickers exclude non-compatible slots.
  - Add-plant tray pickers are filtered by tent restrictions and tray capacity.
  - Create forms prefill suggested IDs (`TN*`, `S*`, `TR*`, and category-derived plant IDs).

### 2026-02-14: Plant location context is surfaced directly in overview and cockpit
- Decision: Extend overview/cockpit payloads with nested `location` fields (`tent`, `slot`, `tray`, tray occupancy) and render tent/tray-aware grouping in the overview queue.
- Rationale: Operators need immediate physical context (where a plant is) without opening placement pages or making additional API calls.
- Routes/APIs: `GET /api/v1/experiments/{id}/overview/plants`, `GET /api/v1/plants/{uuid}/cockpit`, `/experiments/{id}/overview`, `/p/{uuid}`.
- Notes: Overview sorting/grouping is deterministic (tent, tray, plant ID) with a dedicated unplaced section.

### 2026-02-16: Grade terminology is now canonical in schema and API
- Decision: Complete rename to `grade` (DB fields, serializers, API payloads, and UI copy).
- Rationale: Removes bin/container ambiguity and avoids long-term dual-term maintenance costs.

### 2026-02-16: Plant setup favors preset species selection with manual fallback
- Decision: `/experiments/{id}/plants` manual add flow now includes a dropdown of common carnivorous plant presets that autofill species/category/cultivar, plus a `Custom (not listed)` option for manual entry.
- Rationale: Reduces repetitive typing and data-entry mistakes during bootstrap while preserving flexibility for uncommon plants.
- Constraints: Quantity and baseline notes remain manual inputs; Plant ID keeps existing auto-suggestion/auto-iteration behavior with optional manual override.

### 2026-02-13: Uploads stored in `/data/uploads` with local bind mount
- Decision: Keep media under container path `/data/uploads`, mapped to host `./data/uploads` in local compose.
- Rationale: Clear persistence boundary and easy backup target.
- Refs: `5cd1e423`; settings `MEDIA_ROOT=/data/uploads`.

### 2026-02-13: Visual system uses dark theme tokens + mobile-first primitives
- Decision: Establish CSS variable-based dark theme and reusable mobile-first components.
- Rationale: Consistent legibility and scalable UI foundation across wizard and data pages.
- Refs: `097da4cc`, `39297c07`, `ee6bc25e`.

### 2026-02-13: Lucide is the only icon library; no real illustrations yet
- Decision: Use Lucide icons only with placeholder illustration components and inventory tracking.
- Rationale: Maintain style consistency while deferring branding/illustration production.
- Refs: `62e4a898`.

### 2026-02-14: PWA baseline uses custom service worker (not next-pwa)
- Decision: Implement `frontend/public/sw.js` + registration component + `/offline` fallback.
- Rationale: Next 16 default Turbopack conflicted with `next-pwa` webpack plugin path; custom SW kept baseline install/offline goals without framework mismatch.
- Refs: `f4e4b310`, `fe398ba3`, `e932c093`.

### 2026-02-14: Caching strategy is conservative and API-avoidant
- Decision: Cache app-shell routes/static assets; avoid aggressive API response caching.
- Rationale: Reduce stale/misleading experiment state risk while still enabling offline fallback UX.
- Refs: `fe398ba3` (`frontend/public/sw.js`).
- Caution: Cache names/version must be bumped on releases that change shell behavior.

## History / Legacy Appendix

### 2026-02-13: Setup flow modeled as a stable step state machine per experiment
- Decision: Add `ExperimentSetupState` with stable step keys and per-step data storage.
- Rationale: Enabled early incremental setup delivery while preserving compatibility.
- Refs: `94f306a2`, `80789485`, `948a8a7a`.
- Legacy compatibility details: this packet-era state machine has now been removed in favor of bootstrap/readiness summaries.

### 2026-02-14: Setup naming migration kept backend keys stable (later superseded by bootstrap-only setup)
- Decision: UI moved away from packet naming while backend keys and `/packets/*` endpoints stayed stable for compatibility; later UX simplified to bootstrap-only setup.
- Rationale: Avoided data migration risk while reducing setup complexity.
- Refs: `a6b19d01`, `ea4373b7`.
- Status: superseded by the envelope-first cleanup that removed packet endpoints and packet-era setup state.
