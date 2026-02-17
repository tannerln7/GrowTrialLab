# Phase 0 UI/Data-Layer Refactor Findings

Date: 2026-02-17

## MCP Docs Snapshot
Context7/WebSearch MCP servers were not available in this workspace session (`unknown MCP server`), so this snapshot uses official library docs/homepages and npm metadata links directly.

### Core libraries requested
1. **Radix UI Primitives**  
   Link: https://www.radix-ui.com/primitives/docs/overview/introduction  
   Constraints/gotchas:
   - Headless primitives: styling/theming stays in local CSS system.
   - Many primitives rely on `Portal` + focus management, so client boundaries matter in App Router (`"use client"` wrappers for interactive shells).
   - Good fit for replacing ad-hoc modal/dropdown/tooltip/select patterns with consistent accessibility defaults.

2. **@tanstack/react-query**  
   Link: https://tanstack.com/query/latest/docs/framework/react/overview  
   Constraints/gotchas:
   - Requires a stable `QueryClientProvider` in a client component.
   - Query key discipline is critical; without consistent keys, invalidation becomes fragile.
   - App Router boundary: keep server-rendered shell, but query hooks run in client components.

3. **@tanstack/react-query-devtools**  
   Link: https://tanstack.com/query/latest/docs/framework/react/devtools  
   Constraints/gotchas:
   - Should be dev-only and client-only.
   - In Next App Router, safest path is dynamic import with `ssr: false`.

4. **@tanstack/react-table**  
   Link: https://tanstack.com/table/latest/docs/introduction  
   Constraints/gotchas:
   - Headless only; you own rendering and state wiring.
   - Best when paired with memoized column defs and stable row ids.
   - Strong fit for overview roster/rotation logs where sorting/filtering is repeated.

5. **Virtualization package choice**  
   Chosen: **@tanstack/react-virtual**  
   Link: https://tanstack.com/virtual/latest/docs/introduction  
   Why: current TanStack package, aligned with Query/Table ecosystem; `react-virtual` is older package lineage.
   Constraints/gotchas:
   - Requires stable container sizing and careful measurement for dynamic-height rows.
   - Mobile momentum scrolling + sticky headers can be tricky; phase in only on large lists first.

6. **react-hook-form**  
   Link: https://react-hook-form.com  
   Constraints/gotchas:
   - Performs best with uncontrolled inputs and field-level registration.
   - Existing pages with many `useState` fields are good migration targets.

7. **zod + RHF integration**  
   Links:
   - https://zod.dev
   - https://github.com/react-hook-form/resolvers  
   Constraints/gotchas:
   - Recommended integration path: `@hookform/resolvers/zod` (`zodResolver`).
   - Keep schema near form boundary to unify UI validation + API payload shaping.

8. **@formkit/auto-animate**  
   Link: https://github.com/formkit/auto-animate  
   Constraints/gotchas:
   - Great for list insert/remove polish with minimal code.
   - Use sparingly on high-frequency/large virtualized lists to avoid unnecessary layout work.

### Next.js App Router + React 19 gotchas relevant here
1. **Server/Client boundaries**  
   Links:
   - https://nextjs.org/docs/app/building-your-application/rendering/server-components
   - https://nextjs.org/docs/app/building-your-application/rendering/client-components  
   Notes:
   - Query hooks, RHF, Radix interactive primitives, and devtools must stay in client components.
   - Keep top-level layout mostly server-safe; isolate client providers.

2. **Search params and navigation loops**  
   Links:
   - https://nextjs.org/docs/app/api-reference/functions/use-search-params
   - https://nextjs.org/docs/app/api-reference/functions/use-router  
   Notes:
   - Current pages frequently sync `searchParams` + local state; conversion should avoid effects that rewrite URL on every render.

3. **Caching and refetch behavior**  
   Link: https://nextjs.org/docs/app/building-your-application/data-fetching/fetching  
   Notes:
   - Existing client fetches are uncached browser fetches; introducing Query defaults must avoid over-refetching noisy operator pages.

4. **Hydration-sensitive UI**  
   Link: https://react.dev/reference/react-dom/client/hydrateRoot  
   Notes:
   - Devtools, portals, and dynamic client-only widgets should avoid SSR mismatch by using client-only dynamic imports where needed.

## Additional Library Suggestions (Not in Required Set)
1. **`sonner` (toasts)** — **Phase 1**  
   Problem solved here:
   - Repeated `error`/`notice` state + inline banners across almost every page.
   Why vs do nothing:
   - Standardized, transient feedback for save/apply/lock actions without duplicating state plumbing.
   Tradeoffs:
   - Small dependency + global provider; slight behavior change from inline-only messaging.

2. **`date-fns`** — **Phase 1**  
   Problem solved here:
   - Repeated ad-hoc date formatting (`toLocaleDateString`, manual relative-day logic) on overview/feeding/cockpit/schedule.
   Why vs do nothing:
   - Centralized, deterministic formatting helpers; easier localization path later.
   Tradeoffs:
   - Extra dependency and potential bundle growth if imported carelessly.

3. **`react-error-boundary`** — **Phase 1**  
   Problem solved here:
   - Client-runtime crashes currently fail per-page (example: invalid placeholder kind crash).
   Why vs do nothing:
   - Safe page-level fallbacks and retry affordances for client component failures.
   Tradeoffs:
   - Requires deliberate boundary placement and reset strategy.

4. **`clsx` (+ optional `class-variance-authority`)** — **Later**  
   Problem solved here:
   - Growing conditional class logic in dense pages (`experiments.module.css` usage patterns).
   Why vs do nothing:
   - Cleaner variant handling for reusable buttons/chips/badges while keeping CSS modules.
   Tradeoffs:
   - Another abstraction layer; only worth it as component library consolidation grows.

5. **`nuqs` (URL query state helpers)** — **Later**  
   Problem solved here:
   - Many pages manually parse/sync URL query params (`filter`, `q`, `plant`, `from`, `refresh`).
   Why vs do nothing:
   - Safer typed URL state and less custom sync code.
   Tradeoffs:
   - Adds abstraction that can hide routing behavior if overused.

## Repo Inventory and Migration Slices

### 1) Setup Flow (Plants, Tents+Slots, Recipes)
Files:
- `frontend/app/experiments/[id]/setup/page.tsx`
- `frontend/app/experiments/[id]/plants/page.tsx`
- `frontend/app/experiments/[id]/slots/page.tsx`
- `frontend/app/experiments/[id]/assignment/page.tsx` (recipes surface)

What it does:
- Bootstrap checklist + plants intake/import/id generation + tent/slot generation + recipe CRUD.

Pain points/smells:
- Manual fetch/loading/notInvited/offline/error pattern repeated per page.
- Form state is mostly `useState` field-by-field.
- Ad-hoc validation and server error mapping duplicated.

Library application:
- React Query for bootstrap status and list CRUD cache/invalidation.
- RHF + Zod for plants/recipes/tent generation forms.
- Radix `Dialog/Select/Checkbox/Tabs` for consistent controls where custom form widgets are growing.
- AutoAnimate for adding/removing shelves and recipe rows.

Smallest migration slice:
- Convert **recipes create/edit** in `assignment/page.tsx` to RHF+Zod + React Query mutations/invalidation, leave layout/UI unchanged.

### 2) Overview Roster / Work Queue
File:
- `frontend/app/experiments/[id]/overview/page.tsx`

What it does:
- Central hub: lifecycle controls, readiness, filters/search, grouped roster, quick actions.

Pain points/smells:
- Large monolithic component with mixed concerns (fetch + derived grouping + control actions).
- Manual query-string synchronization and local memo sorting/grouping.

Library application:
- React Query for status + roster reads and start/stop mutations.
- TanStack Table for deterministic filter/sort state in one model.
- React Virtual later if roster size grows.

Smallest migration slice:
- Move initial load of status + overview roster into Query hooks only; keep existing rendering structure.

### 3) Plant Cockpit (`/p/[uuid]`)
File:
- `frontend/app/p/[id]/page.tsx`

What it does:
- QR-first plant action hub: now panel, replace flow, photo upload, feed/schedule shortcuts, mini activity.

Pain points/smells:
- Very large client component with many local state machines.
- Multiple independent mutations and error paths handled manually.

Library application:
- React Query for cockpit query + invalidate on photo upload/replacement.
- RHF+Zod for replacement modal form and photo metadata form.
- Radix `Dialog` for replacement modal hardening.
- Error boundary wrapper around cockpit subtree.

Smallest migration slice:
- Replace **replacement modal** local state with RHF+Zod + React Query mutation only.

### 4) Baseline Queue
File:
- `frontend/app/experiments/[id]/baseline/page.tsx`

What it does:
- Queue-based week-0 baseline capture with grade + save-next loop + lock guardrail.

Pain points/smells:
- Manual queue re-fetch + navigation sequencing.
- JSON metrics input is freeform text with manual parse checks.

Library application:
- React Query for queue + baseline query/mutation and cache updates.
- RHF+Zod schema for grade/notes/metrics payload validation.
- Radix `Tabs/Popover` optional for metrics helper UX later.

Smallest migration slice:
- Convert save/save-next mutation flow to React Query while preserving existing UI controls.

### 5) Placement
File:
- `frontend/app/experiments/[id]/placement/page.tsx`

What it does:
- Tray creation/assignment, slot placement, restrictions/capacity checks, auto-place diagnostics.

Pain points/smells:
- Heavy imperative state + many handlers.
- Complex selector filtering computed in component, difficult to test.

Library application:
- React Query for placement/status/recipes datasets.
- RHF+Zod for create tray/update tray payloads.
- Radix `Select/Dialog/ScrollArea` for large option pickers and diagnostics panel.
- AutoAnimate for tray/plant list transitions.

Smallest migration slice:
- Convert **create tray** form + submit path to RHF+Zod + mutation invalidate; keep current list rendering.

### 6) Rotation
File:
- `frontend/app/experiments/[id]/rotation/page.tsx`

What it does:
- Running-only tray move logging with compatibility-filtered destination slots and recent logs.

Pain points/smells:
- Manual state synchronization among status, placement summary, and rotation summary.
- Filtering logic and form state tightly coupled.

Library application:
- React Query for coordinated data queries and refetch after move log mutation.
- RHF+Zod for log move form and payload shape.
- TanStack Table for recent logs view (sorting/date).

Smallest migration slice:
- Convert log-move submit flow to RHF+Zod + mutation, leave list UI intact.

### 7) Feeding
File:
- `frontend/app/experiments/[id]/feeding/page.tsx`

What it does:
- Running-only feed queue, plant selection, save/save-next, blocked reason handling.

Pain points/smells:
- Complex URL sync (`plant`, `from`) and local selection orchestration.
- Manual re-fetch pattern repeated after save.

Library application:
- React Query for queue query + feed mutation.
- RHF+Zod for feed payload.
- Optional virtualization later if queue grows.

Smallest migration slice:
- Move queue read + feed mutation into Query hooks while preserving existing StickyActionBar flow.

### 8) Schedule
File:
- `frontend/app/experiments/[id]/schedule/page.tsx`

What it does:
- Upcoming grouped schedule plan + create/edit schedule actions with recurrence and scope targeting.

Pain points/smells:
- Highest form complexity in app with many intertwined local states.
- Multiple dependent datasets fetched in one imperative loader.

Library application:
- RHF+Zod gives biggest immediate win here for recurrence/scope validation.
- React Query for plan/actions/placement/overview data dependencies.
- Radix `Tabs/Popover/Tooltip` for compact recurrence + scope UX.

Smallest migration slice:
- Migrate **create schedule action form only** to RHF+Zod, keep existing list/plan rendering.

## Recommended Migration Plan

### Phase 1 (infrastructure + first converted page)
1. Ship Query provider + devtools (done in Phase 0 scaffold).
2. Convert **Overview** data loading + start/stop mutations to React Query.
3. Introduce one shared `useAppQueryState` helper for offline/notInvited/error normalization.

### Phase 2 (spread patterns + shared components)
1. Convert setup forms (recipes, tray create, baseline save) to RHF+Zod.
2. Introduce shared Radix-backed primitives for modal/select/tooltip/dropdown.
3. Add toast system (`sonner`) to replace repeated inline transient notice patterns.

### Phase 3 (tables + virtualization + polish)
1. Move roster/log tables to TanStack Table.
2. Add TanStack Virtual to high-cardinality lists only (overview roster, queue lists) behind measured thresholds.
3. Add animation polish via AutoAnimate where list diffs are frequent but row counts are moderate.

## Risks and Watch-outs
1. **App Router boundaries**: Query hooks/RHF/Radix must stay in client components; avoid pulling large server-tree chunks into client-only wrappers.
2. **Hydration mismatch risk**: devtools and portal-heavy primitives must remain client-only (`dynamic(..., { ssr: false })` where needed).
3. **Query invalidation strategy**: define canonical key factory early (`experiment`, `status`, `placement`, `feedingQueue`, etc.) to prevent stale pages.
4. **Optimistic UI caution**: placement/feeding/rotation have rich server diagnostics; prefer pessimistic updates first, then targeted optimistic paths.
5. **Virtualization on mobile**: dynamic row heights + sticky headers can degrade UX if introduced too early.
6. **URL-state loops**: pages syncing `searchParams` with local state need careful migration ordering to avoid navigation churn.
7. **Offline/error handling consistency**: centralize typed error handling before broad page conversion to prevent regressions.

