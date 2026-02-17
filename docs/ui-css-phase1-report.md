# UI CSS Phase 1 Report

Date: 2026-02-17  
Scope: Deep second sweep for CSS drift reduction and Tailwind-oriented prep (no Tailwind install/config).

## 1) CSS Inventory (Top Offenders First)

1. `frontend/app/experiments/experiments.module.css`
   - Largest style surface shared by placement, recipes, overview, baseline, setup, rotation, feeding, and schedule.
   - Primary drift source: duplicated primitives (buttons/forms/status text/icon controls/cells/chips) mixed with page-specific layout.
2. `frontend/src/styles/primitives.css`
   - Newly created foundation; initially focused on surfaces/grid/cell/chip.
   - Phase 1 sweep expanded this into a fuller utility bridge for buttons/forms/text/icon controls/tooltips.
3. `frontend/src/styles/tokens.css`
   - Canonical token layer for spacing/radius/type/palette/elevation.
   - Existing alias bridge (`--bg`, `--surface`, etc.) kept to avoid breakage during transition.
4. `frontend/app/globals.css`
   - Base global rules and app shell-level defaults (not a major offender, but still a global cascade input).
5. Smaller route/component modules
   - `frontend/app/p/[id]/page.module.css`, `frontend/src/components/ui/*.module.css`, etc.
   - Generally lower drift because scope is narrower.

## 2) Repeated Patterns Found Across Pages

- Surface cards and inset panels (`overview`, `placement`, `recipes`, `baseline`) with repeated border/radius/background formulas.
- Button families repeated with near-identical geometry and state handling:
  - primary / secondary / danger
  - hover and disabled state rules
- Form fields repeated (`input`, `select`, `textarea`) with same border, radius, padding, and background.
- Dense selection grid scaffolding repeated:
  - plant/tray/slot cards
  - selected/hover/muted states
  - compact metadata rows and chips.
- Inline tool action patterns repeated:
  - icon-only buttons (normal + danger)
  - tooltip content/arrow styling.
- Status text patterns repeated:
  - muted loading labels
  - error/success notices.

## 3) Hacky Fixes / Drift Smells Observed

- Magic-number spacing drift (e.g., `0.32`, `0.35`, `0.38`, `0.42`, `0.45`, `0.52`, `0.55`) used interchangeably for similar spacing roles.
- Same visual primitives defined both globally and in `experiments.module.css` (especially buttons/forms/tool icons), causing maintenance ambiguity.
- Tooltip and icon-button rules duplicated as route-module-only definitions despite being used as cross-page patterns.
- Mixed ownership of "shared" behavior in page modules (global intent, local location), making Tailwind migration mapping harder.

## 4) Phase 1 Plan Executed (This Sweep)

### Shared foundation expanded
- Extended `frontend/src/styles/primitives.css` beyond initial surface/grid/cell utilities to include:
  - `gt-button` + variant modifiers
  - `gt-input` / `gt-select` / `gt-textarea`
  - `gt-text-muted` / `gt-text-danger` / `gt-text-success`
  - `gt-icon-button` + danger variant
  - `gt-tooltip` / `gt-tooltip-arrow`
- Kept token-driven implementation (`--gt-*`) to preserve existing look while reducing local duplication.

### Worst-offender refactors completed (4 pages/components)
1. `frontend/app/experiments/[id]/placement/page.tsx`
2. `frontend/app/experiments/[id]/recipes/page.tsx`
3. `frontend/app/experiments/[id]/overview/page.tsx`
4. `frontend/app/experiments/[id]/baseline/page.tsx`

Applied changes:
- Replaced module-level primitive usage (`styles.button*`, `styles.input/select/textarea`, `styles.muted/error/success`, `styles.toolbarIcon*`, `styles.toolbarTooltip*`) with shared `gt-*` classes.
- Left route-specific behavior/layout classes in place (stepper layout, tray/tent geometry, baseline-specific capture visuals, overview geometry).

### Redundant local CSS reduction
- Removed now-unused tooltip/icon-button style blocks from `frontend/app/experiments/experiments.module.css`.
- Preserved remaining module rules that are still used by non-refactored experiment routes (setup/rotation/feeding/schedule) to avoid broad regressions in Phase 1.

## 5) What Was Intentionally Left for Later

- Full migration of all experiment routes (`setup`, `rotation`, `feeding`, `schedule`) to global button/form/text primitives.
- Consolidation of remaining chip variants and some specialized card micro-patterns.
- Final elimination of compatibility aliases in `tokens.css` (deferred until broader adoption and/or Tailwind phase).
- Tailwind config/utilities conversion (explicitly out of scope for Phase 1).

## 6) Outcome Summary

- UI remains visually consistent with existing dark/material presentation.
- Shared CSS foundation now covers the most frequently duplicated primitives needed by high-drift pages.
- High-drift pages are slimmer in local primitive usage and better aligned to future utility-first/Tailwind mapping.
