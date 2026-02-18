# GrowTrialLab AGENTS.md (Project-Local Instructions)

These instructions are **in addition to** the global `~/.codex/AGENTS.md`. Follow **both** unless a rule here **explicitly overrides** or **directly contradicts** the global file (in which case this file wins).

## 1) Canonical docs (read before changes)
- `docs/unified-project-notes.md` — canonical architecture/status/risk summary (source of truth)
- `docs/feature-map.md` — timeline + completion map with commit refs
- `docs/agent-guidebook.md` — working guide for flows, patterns, and “how it currently works”
- Historical context only: `docs/legacy/*` (do not treat as canonical unless explicitly reconciling history)

## 2) Scope boundary (what belongs where)
- This `AGENTS.md` is for **durable repo-wide invariants**: security/auth guardrails, API contract invariants, required verification, commit hygiene, and documentation discipline.
- Put evolving product behavior, UX conventions, and implementation patterns in:
  - `docs/agent-guidebook.md` (agent workflow + UI/UX conventions)
  - `docs/unified-project-notes.md` (canonical current state + risk register + open work)

## 3) Non-negotiable invariants (do not break)
### Auth & safety
- Cloudflare Access auth is canonical.
- Dev auth bypass is allowed **only** when:
  - `DJANGO_DEBUG=1` **and**
  - `ENVIRONMENT=development` (or `APP_ENV=development`)
- Never gate bypass by hostname/origin, and never broaden bypass for production paths.
- Keep production hardening assumptions strict (`DJANGO_DEBUG=0`, strict hosts/origins, correct Cloudflare config).

### API contract invariants
- List responses must be an envelope: `{ count, results, meta }` and **`meta` must always be present** (even if empty).
- Blocked operations must return: `{ detail, diagnostics }`.
- `409` blocked operations must include at least `diagnostics.reason_counts`.
- Location payloads must use nested `location` objects (do not reintroduce `tent_*`/`slot_*`/`tray_*` field sprawl).
- Canonical terminology:
  - use `grade` and `slot`
  - do not reintroduce `bin` / `block` into active API/UI contracts

### “No legacy resurrection” rule
- Do not reintroduce removed/superseded flows/contracts as active behavior (see `docs/unified-project-notes.md` for what is canonical vs historical).
- Preserve readiness blockers and diagnostics visibility in both UI and API.

## 4) Frontend invariants (data layer + styling)
### Data layer (React Query discipline)
- Do not inline ad-hoc query keys; all React Query keys must come from `frontend/src/lib/queryKeys.ts`.
- Prefer shared API helpers:
  - `frontend/src/lib/api.ts`
  - `frontend/src/lib/usePageQueryState.ts`
- Mutations must invalidate the narrowest affected keys plus relevant derived aggregates when applicable (status summary, overview roster, placement summary, feeding queue, schedule plan).

### Styling system (Tailwind/shadcn canonical)
- Tailwind v4 + shadcn-style primitives are the primary styling system for the frontend.
- Tailwind theme bridging lives in `frontend/src/styles/tailwind-theme.css` (`@theme inline`) and should prefer referencing existing `--gt-*`/compat variables (avoid creating a second competing token system).
- Keep Tailwind class strings **static** and scan-safe; do not dynamically generate utility class names.
- Legacy `gt-*` classes and `frontend/src/styles/primitives.css` are retired; do not reintroduce them.
- Prefer reusable primitives/patterns under `frontend/src/components/ui/*` and shared Tailwind class maps (e.g., experiments/cockpit style maps) over route-local CSS module forks.
- Use CSS modules only when geometry truly requires it and cannot be expressed cleanly via utilities; avoid “just because” CSS modules.

## 5) Testing + verification (required for non-trivial changes)
- Backend lint/type checks:
  - `cd backend && uv run ruff check`
  - `cd backend && uv run pyright`
- Backend tests:
  - `cd backend && uv run pytest`
  - `cd backend && uv run pytest -q`
  - `cd backend && uv run pytest --maxfail=1`
- Frontend checks (when frontend changes):
  - `cd frontend && pnpm run lint`
  - `cd frontend && pnpm run typecheck`
- If changes are broad or cross-cutting:
  - `infra/scripts/verify.sh`
- Tests are mandatory for relevant changes: if a task changes behavior, update/add tests in the same task.
- Keep tests deterministic; add guards for ordering-sensitive flows and contract shapes.

## 6) Documentation update policy (required)
- When behavior changes, update docs in the same task:
  1. `docs/unified-project-notes.md` (canonical behavior/risk changes)
  2. `docs/feature-map.md` (status/timeline/commit refs)
  3. `docs/agent-guidebook.md` (agent workflow guidance / product conventions / implementation patterns)
  4. `docs/README.md` (only when canonical doc structure changes)
  5. `docs/legacy/*` remains historical archive (only append for traceability, never as canonical)

## 7) End-of-task docs reconciliation (required)
- Review docs relevant to the change plus `docs/unified-project-notes.md` and `docs/feature-map.md`.
- Remove contradictions and update timestamps/status markers.
- Ensure new/changed behavior is reflected and commit refs are captured in `docs/feature-map.md`.

## Commit hygiene and practices (required)
- **If a task makes any repo changes (code/config/docs/migrations), it must end with at least one commit.**  
- Keep commits small and single-purpose; don’t mix feature + refactor + formatting + dependency bumps.
- Use Conventional Commits:
  - `feat(frontend): ...`, `feat(backend): ...`, `fix(...)`, `refactor(...)`, `test(...)`, `docs: ...`, `chore: ...`
- Subject line: imperative, <72 chars, no trailing period; add a short body only when clarifying why/invariants/migrations.
- Prefer a clean sequence for multi-part work: scaffold/refactor → feat → test → docs (docs may be adjacent to the change).
- Keep diffs intentional: no drive-by reformatting or unrelated cleanup; formatting-only changes must be their own `chore(format): ...`.
- Aim for green commits (lint/typecheck/tests passing). If an intermediate break is unavoidable, restore green immediately in the next commit.
- Isolate schema work: migrations must be explicit and called out (especially destructive/reset-based changes).
- Don’t claim verification unless it was actually run; if partial, state exactly what was run.
- Before sharing/pushing, squash “oops” commits and reword vague messages; don’t rewrite history on shared branches.

## 9) Change discipline
- Keep changes small, reviewable, and reversible.
- Do not revert unrelated workspace changes.
- If observed behavior conflicts with docs, fix code/docs mismatch and record it in canonical docs.
