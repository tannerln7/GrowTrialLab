# GrowTrialLab Agent Instructions

This file provides project-level instructions for Codex and other coding agents.

## Canonical Documentation
Read these first before making changes:
- `docs/unified-project-notes.md` (canonical architecture/status/risk summary)
- `docs/feature-map.md` (timeline + completion map with commit refs)
- `docs/agent-guidebook.md` (agent-specific workflow and documentation policy)

Historical context only:
- `docs/legacy/*` (do not treat as current source of truth unless explicitly reconciling history)

## Scope Boundary
- Keep this file focused on durable, repo-wide policy: security guardrails, procedural requirements, and documentation discipline.
- Keep evolving product behavior and implementation-level conventions in `docs/agent-guidebook.md`:
  - Canonical product flow
  - API contract conventions
  - Frontend data-layer patterns

## Auth and Safety Rules
- Cloudflare Access auth is canonical.
- Dev auth bypass is allowed only when `DJANGO_DEBUG`=`1` and `ENVIRONMENT`=`development` (or `APP_ENV`=`development`), never by `hostname`/`origin`.
- Never broaden auth bypass behavior for production paths.
- Keep production hardening assumptions strict (`DJANGO_DEBUG=0`, proper Cloudflare config, strict hosts/origins).

## Testing and Verification Requirements
- Backend linting uses Ruff and backend static type checks use Pyright.
- Backend tests use pytest.
- Tests are required for relevant code changes: any task that adds or changes behavior must update existing tests or add new ones in the same task.
- After any non-trivial change, run this backend command sequence:
  - `cd backend && uv run ruff check`
  - `cd backend && uv run pyright`
  - `cd backend && uv run pytest`
  - `cd backend && uv run pytest -q`
  - `cd backend && uv run pytest --maxfail=1`
- If changes touch frontend code, also run frontend checks:
  - `cd frontend && pnpm run lint`
  - `cd frontend && pnpm run typecheck`
- If changes are broad or cross-cutting, run:
  - `infra/scripts/verify.sh`
- Maintain, update, extend, or add tests when changing lifecycle, diagnostics, readiness, placement, feeding, schedule, response contracts, data models, serializers, middleware/auth, or frontend behavior with backend/API coupling.
- Keep deterministic behavior and guard tests for ordering-sensitive flows.

## Documentation Update Policy (Required)
When behavior changes, update docs in the same task:
1. `docs/unified-project-notes.md` for canonical behavior/risk updates.
2. `docs/feature-map.md` for status/timeline/commit-ref updates.
3. `docs/agent-guidebook.md` when product guidance, implementation conventions, or agent workflow guidance changes.
4. `docs/README.md` when canonical doc structure changes.
5. Keep `docs/legacy/*` as historical archive (only update when recording historical context).

## End-of-Task Docs Reconciliation (Required)
1. Review docs relevant to the changed behavior, plus the canonical index docs (`unified-project-notes.md`, `feature-map.md`).
2. Update outdated entries and ensure prior notes reflect new changes rather than conflicting with them.
3. Add or update timestamps/status markers (`completed`, `in progress`, `not started`) where applicable.
4. Ensure relevant commit references are captured in `docs/feature-map.md` for related features / milestones.

## Commit Hygiene and Practices (Required)
- Keep commits small and single-purpose; don’t mix feature + refactor + formatting + dependency bumps.
- Use Conventional Commits: `feat(frontend): ...`, `feat(backend): ...`, `fix(...)`, `refactor(...)`, `test(...)`, `docs: ...`, `chore: ...`.
- Subject line: imperative, <72 chars, no trailing period; add a short body only when it clarifies why/invariants/migrations.
- Prefer a clean sequence for multi-part work: scaffold/refactor → feat → test → docs (or docs adjacent to the change).
- Keep diffs intentional: no drive-by reformatting or unrelated cleanup; formatting-only changes must be their own `chore(format): ...`.
- Aim for green commits (lint/typecheck/tests passing); if an intermediate break is unavoidable, restore green immediately in the next commit.
- Isolate schema work: migrations should be explicit and called out (especially if destructive/reset-based).
- Before sharing/pushing, squash “oops” commits and reword vague messages; don’t rewrite history on shared branches.
- Don’t claim verification unless it was actually run; if partial, state exactly what was run.

## Change Discipline
- Keep changes small, reviewable, and reversible.
- Do not revert unrelated workspace changes.
- Prefer targeted edits and explicit commit messages.
- If an observed behavior conflicts with docs, fix code/docs mismatch and note it in canonical docs.
