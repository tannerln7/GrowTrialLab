# GrowTrialLab Watch-Outs

Important risks and "must remember later" items.

| Severity | When to Address | Watch-Out | Suggested Approach |
| --- | --- | --- | --- |
| high | pre-v1 ship | QR route is implemented, but production labels can still point to localhost if `PUBLIC_BASE_URL` is unset/invalid. | Enforce `PUBLIC_BASE_URL` in production deploy config and validate generated labels against the real domain before release. |
| high | pre-v1 ship | Cloudflare Access prod hardening can regress security if debug bypass remains active. | Require `DJANGO_DEBUG=0`, real `CF_ACCESS_TEAM_DOMAIN`, real `CF_ACCESS_AUD`, verify `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`, secure cookies, and decide if `/healthz` should stay public. |
| high | pre-v1 ship | Backups/restores are not formalized for DB + uploads. | Add scripted DB dump and `data/uploads` archive export, plus documented restore drill with validation checks. |
| high | pre-lifecycle enforcement | Deletion gating + immutability controls should not be implemented ad hoc before lifecycle exists. | Land lifecycle primitives first (`draft`/`running`/`stopped` + start/stop transitions), then enforce guarded deletes/frozen structures using lifecycle state as the source of truth. |
| med | post-lifecycle hardening | Lifecycle now exists but does not yet enforce immutable structures while running. | Add backend enforcement policy for “frozen-on-running” resources (recipes/slots/templates/placement structure) after product rules are finalized. |
| med | Baseline step follow-up | Metric templates now exist, but template coverage/version governance is still minimal. | Define template lifecycle policy (versioning, migration path, category coverage checks) before expanding species support. |
| high | pre-v1 ship or post-v1 integrity hardening | Baseline and Groups locks are UI-only; backend still accepts edits when lock is set. | If audit-grade integrity is required, add backend enforcement + explicit admin unlock workflow + audit trail for lock bypasses. |
| med | pre-v1 ship | Baseline completion threshold is MVP-level (>=1 baseline capture + all bins), not all-plants baseline completion. | Tighten completion criteria to require baseline capture for all plants unless explicitly waived by admin policy. |
| med | ongoing queue stability | Baseline queue processing depends on stable ordering so save-and-next does not appear to jump unpredictably. | Keep `/api/v1/experiments/{id}/baseline/queue` ordering deterministic (needs-first, then plant_id, then created_at fallback) and cover ordering rules in tests before changing sort logic. |
| med | ongoing readiness UX | Assignment page serves two phases (recipe setup vs assignment apply). Confusing gating can regress user flow. | Keep recipes editable during setup, gate preview/apply on bootstrap completion, and refetch `/api/v1/experiments/{id}/status/summary` after apply before returning to overview. |
| med | post-v1 UX hardening | Plant cockpit quick actions include placeholders (note/issue/weekly tasks) and currently maps “identity” photo tag to backend `other`. | Add dedicated backend photo tags/actions when those workflows are implemented so cockpit labels align 1:1 with stored semantics. |
| med | after Start step / pre-v1 ship | Photo storage can grow quickly and include unwanted EXIF metadata. | Add file size limits, retention guidance, optional EXIF stripping, and maybe thumbnail generation plan. |
| med | deployment design | Single-host routing between Next and Django can cause CORS/auth drift. | Choose one production routing approach (Caddy reverse proxy or Next proxy path routing), then document canonical API/media paths. |
| med | after v1 queue stabilization | Overview tiles currently cover baseline/bin/assignment/status only; weekly “due now” workload indicators are not implemented. | Extend `/experiments/{id}/overview` with schedule-aware aggregates once weekly sessions/feeding logic is in place, without breaking current filter URLs. |
| med | ongoing IA cleanup | Hub-and-spoke navigation can regress if new pages add lateral links between subpages. | Keep `/experiments/{id}/overview` as primary launch hub; require `← Overview` return links and justify any new cross-links as directly task-critical. |
| med | ongoing IA cleanup | Bootstrap-only setup gating can be undermined by legacy deep links to wizard-specific setup tabs/steps. | Keep setup links centralized in gate logic only; route readiness actions to `/baseline` and `/assignment` pages, and remove `/setup?tab=...` style links. |
| med | placement scale-up | Placement summary currently returns first 50 unplaced active plants for queueing simplicity. | If experiments grow larger, add pagination/filters and preserve deterministic ordering to avoid operator confusion. |
| med | rotation data integrity | Rotation logs now update `Tray.block` as canonical location; mismatches can appear if future code writes logs without tray updates. | Keep `POST /api/v1/experiments/{id}/rotation/log` as the only supported write path for moves (log + tray update in one transaction), and preserve running-state gate with Overview as the launch point. |
| med | feeding rollout | Feeding should remain running-only in backend and UI to avoid logs during draft/stopped states. | Keep `POST /api/v1/plants/{uuid}/feed` gated by lifecycle state (`running`) with clear 409 messaging, and route users back to Overview start controls when blocked. |
| high | tray-canonical readiness | Missing tray placement or missing tray recipe now blocks both feeding and experiment start. | Keep Overview readiness copy explicit (`needs_placement`, `needs_tray_recipe`) and ensure placement page makes tray recipe assignment obvious before operators attempt start/feed. |
| med | feeding/assignment integrity | Feeding is now recipe-locked to tray assignment (`TrayPlant -> Tray.assigned_recipe`), while legacy `Plant.assigned_recipe` still exists for compatibility. | Prefer tray-derived assignment in all operational endpoints, keep fallback usage limited, and plan cleanup/deprecation of per-plant assignment once legacy clients are removed. |
| high | migration/deploy window | Multi-tent migration re-parents legacy blocks into a default tent (`Tent 1`, `T1`) and introduces species restrictions that can newly block placement/moves. | During rollout, verify migrated blocks/tent mapping per experiment and communicate that restriction failures return `409` on tray placement and rotation moves; provide operators a quick path to adjust `allowed_species`. |
| med | ongoing operations | Tent restrictions now affect both add-to-tray and rotation destination moves, which can surprise operators if tray contents change over time. | Keep placement/rotation UIs explicit about destination tent labels and restriction errors, and preserve deterministic “first violating plant” messages to minimize debugging friction. |
| med | deterministic operations | Auto-place output can feel random if ordering changes between runs. | Keep `/api/v1/experiments/{id}/placement/auto` deterministic (stable bin grouping + stable tray/plant ordering) and protect with tests before changing sort logic. |
| high | ongoing operator workflow | Capacity + tent restrictions can create “unplaceable” plants even when auto-place is run. | Keep auto-place diagnostics surfaced in UI (`reason_counts`, first unplaceable plants) and direct operators to the right fix path: add tray capacity, create trays, create tent blocks, or loosen restrictions. |
| med | ongoing UX consistency | Suggested IDs are frontend-assisted and can still collide under concurrent edits. | Continue returning server-side collision responses with `suggested_*` values (tent/block/tray/plant) and keep create forms ready to accept updated suggestions without user retyping. |
| med | post-feeding MVP | Feeding queue currently uses a fixed 7-day window and optional recipe only; no lot/batch context is captured yet. | If dosing/traceability requirements grow, add configurable window policy and integrate `lot` references in feed entry while preserving fast queue mode. |
| low | post-v1 cleanup | Backend still exposes legacy `/packets/*` endpoints and packet-flavored payload keys for compatibility while frontend is bootstrap/readiness-first. | Plan an API deprecation pass with versioned replacements (`/steps/*` or readiness-scoped endpoints), then remove packet-era aliases once clients are migrated. |
| med | ongoing replacement operations | Replacement chain integrity depends on one-next-link semantics and clear operator handling of pending IDs/assignment inheritance choices. | Keep one replacement per original (`replaced_by` single link), allow replacement with pending `plant_id`, and monitor cases where replacement is created without inherited assignment (this intentionally increases `needs_assignment`). Replacing an already-replaced original should stay blocked; replacing a removed plant with no replacement remains allowed once. |
| med | each release | Service worker staleness can serve outdated shell assets. | Version cache names in `sw.js`, clear old caches in `activate`, and document release process to force fresh shell when needed. |
| med | ongoing | Cert/key rotation handling in Cloudflare JWT validation needs periodic verification. | Add a regression test or runbook note for unknown `kid` refresh behavior and cert endpoint outages. |
| low | future observability pass | Limited operational telemetry can hide failures. | Add baseline app metrics/log structure (auth failures, import errors, setup step completion rates, media failures). |

## Quick Pre-Ship Security Checklist (Cloudflare Access)
- `DJANGO_DEBUG=0`
- Real `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD`
- Debug bypass disabled by configuration
- `DJANGO_ALLOWED_HOSTS` set to production hostnames
- `CSRF_TRUSTED_ORIGINS` set for external URL(s)
- Secure cookie settings validated behind proxy/tunnel
- Public endpoint decision documented for `/healthz`

## Quick Data Safety Checklist
- Automated DB backup schedule documented
- Uploads backup schedule documented
- Restore runbook tested on non-prod target
- Migration backup checkpoint before schema-changing deploys
