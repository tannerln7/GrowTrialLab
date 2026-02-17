# GrowTrialLab Watch-Outs

Important risks and "must remember later" items.

| Severity | When to Address | Watch-Out | Suggested Approach |
| --- | --- | --- | --- |
| high | pre-v1 ship | QR route is implemented, but production labels can still point to localhost if `PUBLIC_BASE_URL` is unset/invalid. | Enforce `PUBLIC_BASE_URL` in production deploy config and validate generated labels against the real domain before release. |
| high | pre-v1 ship | Cloudflare Access prod hardening can regress security if debug bypass remains active. | Require `DJANGO_DEBUG=0`, real `CF_ACCESS_TEAM_DOMAIN`, real `CF_ACCESS_AUD`, verify `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`, secure cookies, and decide if `/healthz` should stay public. |
| high | pre-v1 ship | Local compose defaults are permissive for LAN dev convenience (`DJANGO_ALLOWED_HOSTS=*`). | Treat wildcard hosts as dev-only; set strict host allowlists before any internet-facing deployment. |
| high | pre-v1 ship | Backups/restores are not formalized for DB + uploads. | Add scripted DB dump and `data/uploads` archive export, plus documented restore drill with validation checks. |
| med | post-lifecycle hardening | Lifecycle now exists but does not yet enforce immutable structures while running. | Add backend enforcement policy for frozen-on-running resources (slots, placement structure, recipe topology) after product rules are finalized. |
| med | baseline quality pass | Baseline completion threshold is still MVP-level (>=1 baseline capture + all grades), not all-plants baseline completion. | Tighten completion criteria to require baseline capture for all active plants unless explicitly waived by policy. |
| med | ongoing queue stability | Baseline queue save-and-next flow depends on deterministic ordering. | Keep `/api/v1/experiments/{id}/baseline/queue` ordering deterministic and protect with tests before changing sort logic. |
| high | readiness workflow | Missing placement or missing tray recipe blocks both feeding and experiment start. | Keep Overview readiness copy explicit (`needs_placement`, `needs_tray_recipe`) and keep placement UX explicit about tray recipe assignment. |
| med | schedule rollout | Schedule plans can be mistaken for automatic execution. | Keep schedule copy explicit: plans are operator guidance only; execution remains manual and lifecycle-gated. |
| med | schedule + readiness interplay | Feed schedules can target scopes that are currently blocked (unplaced or missing tray recipe). | Preserve blocker badges (`Blocked: Needs tray recipe`, `Blocked: Unplaced`, `Blocked: Experiment not running`) and direct users to Placement/Overview to resolve blockers. |
| med | UI refactor rollout | App Router server/client boundaries can break hydration when data/form/ui primitives are introduced in the wrong layer. | Keep Query/RHF/Radix interactivity in client components; preserve server-rendered page shells and use dynamic `ssr:false` only where required. |
| high | React Query rollout | Inconsistent query keys will silently break invalidation and leave stale operator data on screen. | Treat `frontend/src/lib/queryKeys.ts` as the single source of truth and reject ad-hoc literal keys in new page migrations. |
| med | React Query rollout | URL state sync (`filter`, `q`, `refresh`) can trigger accidental fetch churn when included directly in query keys without backend dependency. | Only include search params in query keys when the backend request uses them; otherwise keep client-side filtering local and invalidate explicitly when needed. |
| med | React Query rollout | Default refetch behavior can overload high-touch operator pages (focus/reconnect churn). | Keep conservative query options (`staleTime`, `refetchOnWindowFocus: false`) and refresh via mutation invalidation or explicit manual refresh actions. |
| low | dev tooling hygiene | React Query Devtools should never leak into production bundles/UX. | Keep devtools gated by `NODE_ENV === development` and dynamically imported from the provider so production does not render or depend on it. |
| med | feeding integrity | Feeding is recipe-locked to tray assignment; tray recipe drift can surprise operators. | Surface diagnostics-driven blockers in feeding UI and cockpit, and refresh status summary after placement changes. |
| med | slot layout edits | Slot regeneration can orphan placed trays if coordinates are removed. | Keep safe-reshape validation and return `diagnostics.would_orphan_trays` so UI can show exactly what must be moved first. |
| high | placement operations | Capacity + tent restrictions can create unplaceable plants even with auto-place. | Keep auto-place diagnostics surfaced in UI (`reason_counts`, sample `unplaceable_plants`) and provide CTAs: add tray capacity, create trays/slots, or loosen restrictions. |
| med | deterministic operations | Auto-place output can feel random if ordering changes between runs. | Keep `/api/v1/experiments/{id}/placement/auto` deterministic (stable grade grouping + stable tray/plant ordering) and protect with tests. |
| med | rotation data integrity | Rotation logs must stay coupled with tray location updates. | Keep `POST /api/v1/experiments/{id}/rotation/log` as canonical move path (log + `Tray.slot` update in one transaction). |
| med | contract evolution | Envelope/location/diagnostics contracts are now canonical across endpoints. | Require shared helpers (`list_envelope`, `build_location`, `error_with_diagnostics`) for new API work; reject raw arrays and ad-hoc blocked responses in review. |
| low | terminology consistency | `grade` and `slot` are canonical terms; legacy `bin`/`block` wording can reappear during feature work. | Enforce terminology in UI/API reviews and reject new legacy wording unless explicitly historical context. |
| med | LAN proxy stability | DRF list routes are slash-sensitive; rewrite drift can trigger request loops. | Keep explicit trailing-slash rewrite handling for `/api/:path*/` and include LAN smoke checks against representative list endpoints. |
| med | local dev reset | Running multiple migration processes concurrently can trigger Postgres unique violations. | Keep `infra/scripts/reset-dev.sh` single-path: reset volume, start compose, wait for backend health; do not run an extra parallel migrate process. |
| med | ongoing replacement operations | Replacement chain integrity depends on one-next-link semantics and clear handling of pending IDs/assignment inheritance choices. | Keep one replacement per original (`replaced_by` single link), allow replacement with pending `plant_id`, and keep blocked-double-replacement behavior covered by tests. |

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
