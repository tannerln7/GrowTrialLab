# GrowTrialLab Decisions Log

This file records architecture/product decisions and why they were made.

## Current Canonical Flow
- Canonical client gating and readiness source: `GET /api/v1/experiments/{id}/status/summary`.
- Canonical entry route: `/experiments/{id}`.
  - Redirect to `/experiments/{id}/setup` until bootstrap setup is complete.
  - Redirect to `/experiments/{id}/overview` once bootstrap setup is complete.
- Canonical bootstrap setup scope: Plants, Blocks/Slots, Recipes only.
- Canonical readiness flows: `/experiments/{id}/baseline` and `/experiments/{id}/assignment`, launched from Overview.

## Decision Entries

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
- Decision: Keep baseline lock state and lock endpoints for workflow signaling, but do not enforce lock-based write denial in backend baseline/bin APIs.
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
- Decision: Add `/experiments/{id}/overview` backed by `GET /api/v1/experiments/{id}/overview/plants` to centralize plant queue triage (needs baseline/bin/assignment, active, removed) and search.
- Rationale: Operators need one mobile-first page to identify what requires action before entering specific step flows.
- Refs: `51a32d99`, `65f84632`, `12517df6`.

### 2026-02-14: Experiment navigation follows a hub-and-spoke model
- Decision: Treat `/experiments/{id}` as canonical entry and redirect to `/setup` until bootstrap completion, then to `/overview`; subpages keep prominent `← Overview` return actions and minimize lateral cross-links.
- Rationale: Preserves required bootstrap gating while keeping overview as the steady-state hub.
- Refs: `310f00b5`, `41599236`, `669ae104`.

### 2026-02-14: Setup is bootstrap-only and hidden after completion
- Decision: Reduce setup to three bootstrap checks only (Plants, Blocks/Slots, Recipes). Once complete, `/experiments/{id}/setup` redirects to overview and no normal navigation links point back to setup.
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
- Legacy compatibility details: model fields and payload keys still use `current_packet`, `completed_packets`, `locked_packets`, `packet_data`.

### 2026-02-14: Setup naming migration kept backend keys stable (later superseded by bootstrap-only setup)
- Decision: UI moved away from packet naming while backend keys and `/packets/*` endpoints stayed stable for compatibility; later UX simplified to bootstrap-only setup.
- Rationale: Avoided data migration risk while reducing setup complexity.
- Refs: `a6b19d01`, `ea4373b7`.
