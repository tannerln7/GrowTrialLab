# Tailwinds Migration Notes (Unified)

Date consolidated: 2026-02-18  
Sources merged: `docs/ui-css-phase1-notes.md`, `docs/ui-css-phase1-report.md`, `docs/ui-css-phase2-report.md`, `docs/ui-css-phase3-report.md`, `docs/ui-css-phaseS-report.md`

## Current State (Canonical)
- Tailwind v4 + shadcn-style components are now the primary frontend styling system.
- Core experiment routes and cockpit (`/p/[id]`) have been migrated to Tailwind-first styling patterns.
- Legacy experiment/cockpit route CSS modules and shared `gt-*` primitive CSS layers have been retired.
- Shared UI/layout primitives are now centralized in `frontend/src/components/ui/*` and Tailwind-first style maps.

## Chronological Migration Timeline

## Phase 1 (2026-02-17) — Pre-Tailwind Drift Cleanup and Primitive Foundation
### Objective
- Reduce CSS drift and unify repeated styling patterns without installing Tailwind yet.

### Baseline problems identified
- Repeated card/surface patterns, toolbar/header rows, chips/badges, dense cell grids, and action bars across experiments and cockpit pages.
- Shared visual rules were duplicated across route CSS modules with spacing/radius drift (many magic-number variants).
- `frontend/app/experiments/experiments.module.css` was the largest drift source.

### Key outputs
- Added/standardized token layer in `frontend/src/styles/tokens.css`:
  - Stable `--gt-*` spacing/radius/type/palette/elevation tokens.
  - Semantic surface/cell/focus tokens.
  - Compatibility aliases preserved to avoid breakage during migration.
- Added/expanded shared primitives in `frontend/src/styles/primitives.css`:
  - Surfaces/layout: `gt-surface*`, `gt-row`, `gt-col`, `gt-stack`, `gt-grid`, `gt-btnbar`.
  - Cells/chips/badges: `gt-cell*`, `gt-chip`, `gt-badge`.
  - Forms/buttons/text/tooltips/icon controls: `gt-button*`, `gt-input/select/textarea`, `gt-text-*`, `gt-tooltip*`, `gt-icon-button*`.
  - Attribute-driven cell sizing bridge: `gt-grid[data-cell-size="sm|md|lg"]`.
- Refactored high-drift routes first:
  - `placement`, `recipes` (primary)
  - `overview`, `baseline` (shared-cell follow-up)

### End-of-phase status
- Shared primitives covered the highest-frequency duplicated patterns.
- Route modules still contained substantial legacy CSS pending broader migration.

## Phase 2 (2026-02-17) — Shared Primitive Adoption Expansion
### Objective
- Migrate remaining high-traffic routes to shared primitive usage.

### Scope completed
- Extended primitive adoption across:
  - `setup`, `rotation`, `feeding`, `schedule`
  - Supporting pages: `plants`, experiment list/create pages, cockpit (`/p/[id]`)
- Added shared helpers:
  - `.gt-modal-backdrop`, `.gt-popover`, `.gt-visually-hidden`

### Drift reduction outcomes
- Reduced duplicated primitive blocks in experiment/cockpit route CSS modules.
- Moved shared button/form/notice/chip/cell concerns into shared primitives.
- Kept route CSS focused more on page-specific geometry/state styling.

### End-of-phase status
- Visual spacing/radius/chip presentation became more consistent across routes.
- Remaining work shifted from primitive reuse to full Tailwind-first migration.

## Phase 3 (2026-02-17) — Token/Spacing Unification + Stabilization (Still Pre-Tailwind)
### Objective
- Normalize spacing/density and remove remaining spacing drift before Tailwind rollout.

### Scope completed
- Consolidated spacing onto a compact token ladder aligned to a 4px mental model.
- Added global density control for mobile-friendly compactness.
- Expanded shared layout shells (`gt-page`, `gt-section`, `gt-card`, `gt-panel`, `gt-toolbar`).
- Replaced ad-hoc spacing/radius values in route/component CSS with tokenized values.

### Critical regression and fix (same day)
- Root cause: invalid `--gt-density` expression (mixing unitless and viewport units) broke downstream `var(--gt-space-*)` declarations.
- User impact: global padding/gap collapse in shared shells/cards/toolbars/cells.
- Fix:
  - Introduced base spacing tokens + single-pass scaled tokens.
  - Set safe unitless default `--gt-density: 1`.
  - Kept compact small-screen floor.

### End-of-phase status
- Pre-Tailwind CSS system became stable and token-consistent.

## Phase S (2026-02-17) — Tailwind + shadcn Scaffold
### Objective
- Install migration infrastructure without broad route redesign in this phase.

### Scaffold delivered
- Tailwind/theme bridge:
  - `frontend/tailwind.config.ts`
  - `frontend/src/styles/tailwind-theme.css` (`@theme inline` mappings)
  - Layered imports in `frontend/app/globals.css`
- shadcn-style setup:
  - `frontend/components.json`
  - `frontend/src/lib/utils.ts` (`cn` with `clsx` + `tailwind-merge`)
  - Initial primitives: `button`, `badge`, `card`, `dialog`
- Probe route expanded:
  - `frontend/app/tailwind-probe/page.tsx`

### Dev environment hardening
- Added `frontend/scripts/prepare-dev-cache.mjs` and wired into dev startup.
- Added `/app/.next` volume handling to reduce host permission/cache conflicts.

### Follow-up applied after scaffold
- Expanded UI kit for migration coverage:
  - `input`, `textarea`, `select`, `tabs`, `tooltip`, `dropdown-menu`, `popover`, `separator`, `scroll-area`
- Migrated shared layout/list components to Tailwind-first JSX and removed their CSS modules:
  - `PageShell`, `SectionCard`, `StickyActionBar`, `ResponsiveList`

## Post-Phase S and Final Migration Outcome
### What superseded earlier phase constraints
- Tailwind-first route migration completed for core experiment and cockpit workflows.
- Legacy `gt-*` route usage removed from primary operator flows.
- Legacy CSS layers retired after parity:
  - `frontend/app/experiments/experiments.module.css` removed
  - `frontend/src/styles/primitives.css` removed

### Shared system now in use
- Canonical reusable UI and layout primitives live in `frontend/src/components/ui/*`.
- Tailwind token mapping remains the bridge to canonical semantic colors/spacing.
- Dense grid, card/panel, toolbar/action bar patterns are implemented as shared Tailwind-first primitives/style maps rather than route-local CSS forks.

## Notes Retained for Historical Context
- Phase 1/2/3 details above describe the pre-Tailwind stabilization path and why `gt-*` primitives existed.
- Phase S details describe scaffold decisions and dev-cache fixes that enabled safe migration.
- Current implementation policy/state should be treated as canonical in:
  - `docs/unified-project-notes.md`
  - `docs/feature-map.md`
  - `docs/agent-guidebook.md`
