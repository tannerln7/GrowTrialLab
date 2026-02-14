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
