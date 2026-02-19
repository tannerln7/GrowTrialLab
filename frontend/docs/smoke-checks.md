# Frontend Smoke Checks

Use this checklist for lightweight manual regression checks when no dedicated E2E suite is available.

## Preconditions

1. App boots and routes render.
2. `pnpm frontend:guardrails` passes.
3. `cd frontend && pnpm run lint && pnpm run typecheck` passes.

## Core Flows

1. Wizard flow (`/experiments/{id}/placement`)
   - Step navigation works (`Back`, `Save & Next`, final completion path).
   - Lock/running state blocks mutating actions with existing messages.
   - Draft reset works per step.

2. Editor/queue flow (baseline/feeding/rotation)
   - Select entity -> edit -> save.
   - Save-and-advance behavior remains intact where applicable.
   - Error/offline states still map to existing alerts.

3. Overview flow (`/experiments/{id}/overview`)
   - Renders experiment state + roster correctly.
   - Start/Stop lifecycle actions update state and notices.
   - No stale summary/overview mismatch after mutation.

## Optional Spot Checks

1. Recipe assignment page draft/apply behavior.
2. Plant cockpit page render and photo/upload paths.
