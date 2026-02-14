# GrowTrialLab Watch-Outs

Important risks and "must remember later" items.

| Severity | When to Address | Watch-Out | Suggested Approach |
| --- | --- | --- | --- |
| high | Packet 2 follow-up / pre-v1 ship | QR links currently encode `/p/{plant_uuid}` but resolver route is not implemented. | Add frontend/backend resolver route (`/p/[uuid]` or backend redirect endpoint), validate authorization expectations, and support optional `PUBLIC_BASE_URL` for absolute QR URLs in PDF labels. |
| high | pre-v1 ship | Cloudflare Access prod hardening can regress security if debug bypass remains active. | Require `DJANGO_DEBUG=0`, real `CF_ACCESS_TEAM_DOMAIN`, real `CF_ACCESS_AUD`, verify `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`, secure cookies, and decide if `/healthz` should stay public. |
| high | pre-v1 ship | Backups/restores are not formalized for DB + uploads. | Add scripted DB dump and `data/uploads` archive export, plus documented restore drill with validation checks. |
| high | Packet 3 start | Metric JSON can become inconsistent across experiments. | Define metric templates/schema (required keys/types/ranges) before expanding baseline capture UI/API. |
| high | Packet 4+ | Packet completion without lock rules can corrupt trial integrity. | Define lock/unlock policy per packet, admin override flow, and audit log of unlock actions. |
| med | after Packet 7 / pre-v1 ship | Photo storage can grow quickly and include unwanted EXIF metadata. | Add file size limits, retention guidance, optional EXIF stripping, and maybe thumbnail generation plan. |
| med | deployment design | Single-host routing between Next and Django can cause CORS/auth drift. | Choose one production routing approach (Caddy reverse proxy or Next proxy path routing), then document canonical API/media paths. |
| med | each release | Service worker staleness can serve outdated shell assets. | Version cache names in `sw.js`, clear old caches in `activate`, and document release process to force fresh shell when needed. |
| med | ongoing | Cert/key rotation handling in Cloudflare JWT validation needs periodic verification. | Add a regression test or runbook note for unknown `kid` refresh behavior and cert endpoint outages. |
| low | future observability pass | Limited operational telemetry can hide failures. | Add baseline app metrics/log structure (auth failures, import errors, packet completion rates, media failures). |

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
