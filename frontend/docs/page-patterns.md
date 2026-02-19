# Frontend Page Patterns

This is the canonical frontend page architecture for new and migrated work.

## 1) Standard Page Shape

1. Thin route wrapper in `frontend/app/**/page.tsx`
2. Feature client component in `frontend/src/features/**/**/*PageClient.tsx`
3. Feature controller hook for complex logic:
   - `use<Feature>Controller()`
   - `use<Feature>Wizard()`

Route wrappers should only do param parsing, server-safe gating/redirect decisions, and prop handoff.

## 2) State Ownership Rules

- Server/persisted state: React Query (`useQuery`, `useMutation`)
- Draft/local UI state: local controller state (`useState`, reducer, memoized selectors)
- Do not store draft edit state in query cache.

## 3) UI Contracts

Extracted panels/steps should receive compact contracts:

- `model`: render-ready data + derived values
- `actions`: event handlers/callbacks
- Optional `ui`/`nav`: small shared flags/state only when needed

Avoid prop explosions and scattered setter props.

## 4) Data Layer Rules

- Use `api` helpers from `frontend/src/lib/api.ts` for all UI API calls.
- Use `queryKeys` from `frontend/src/lib/queryKeys.ts` for all query keys.
- Prefer targeted invalidation (`invalidateQueries` with specific keys).
- Use `queryClient.setQueryData` when mutation payload already contains the updated entity.

## 5) Error + Offline + Alerts

- Normalize errors with `frontend/src/lib/errors/normalizeError.ts`.
- Parse backend diagnostics with `frontend/src/lib/errors/backendErrors.ts` where needed.
- Use `frontend/src/components/ui/PageAlerts.tsx` for standard loading/error/notice/offline/not-invited slabs.

## 6) Param + Classname Helpers

- Route/client param parsing:
  - `frontend/src/lib/routing.ts` (`getParamString`)
  - `frontend/src/lib/useRouteParamString.ts`
- Class composition: `cn(...)` from `frontend/src/lib/utils.ts`
- Do not use `filter(Boolean).join(" ")` patterns in frontend code.

## 7) Guardrail Commands

Run these before merging frontend changes:

1. `pnpm frontend:guardrails`
2. `cd frontend && pnpm run lint`
3. `cd frontend && pnpm run typecheck`
4. `cd frontend && pnpm run build` (for release-impacting changes)
