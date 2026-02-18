# UI CSS Phase 1 Notes

Date: 2026-02-17  
Scope: CSS-only cleanup + unification for Tailwind preparation (no Tailwind setup).

## Quick Audit: Repeated Patterns
- Surface/card containers repeated across `overview`, `placement`, `recipes`, `baseline`, `feeding`, `rotation`, `setup`, and `plant cockpit` with small radius/padding/color drift.
- Header/meta rows repeated in tray/tent sections (`trayHeaderRow`, toolbar rows, action bars) with near-identical flex wrapping behavior.
- Chip/badge styles repeated in readiness chips, recipe chips, queue chips, and diagnostics pills.
- Grid cell patterns duplicated for plant/tray/slot cards with separate min sizes and selected states.
- Action bars and compact toolbars repeated with slight spacing differences.
- Many near-duplicate spacing values (`0.32`, `0.35`, `0.38`, `0.42`, `0.45`, `0.55`, etc.) created “magic-number drift.”

## Tailwind-Oriented Pattern Mapping
- Tokens -> future Tailwind theme: color palette, spacing scale, radii, typography, elevation in `frontend/src/styles/tokens.css`.
- Primitives -> future utility compositions:
  - `gt-surface*` -> `bg-*`, `border`, `rounded-*`, `shadow-*`
  - `gt-row`/`gt-stack`/`gt-btnbar` -> `flex`, `grid`, `gap-*`, `items-*`
  - `gt-grid[data-cell-size=*]` -> `grid`, `gap-*`, `minmax`, responsive column utilities
  - `gt-cell*` states -> `rounded-*`, `border`, `bg-*`, selected/focus variants
  - `gt-chip`/`gt-badge` -> pill-style utility bundles

## Shared Layer Added
- `frontend/src/styles/tokens.css`
  - Introduced stable `--gt-*` tokens for spacing, radii, type, elevation, dark colors, selected/focus semantics.
  - Added semantic domain tokens: `--gt-surface`, `--gt-surface-2`, `--gt-cell`, `--gt-cell-selected`, `--gt-cell-muted`, `--gt-outline-focus`.
  - Kept compatibility aliases (`--bg`, `--surface`, `--text`, etc.) so existing modules stay functional.
- `frontend/src/styles/primitives.css`
  - Added small primitive vocabulary:
    - Surfaces: `gt-surface`, `gt-surface-2`
    - Layout: `gt-row`, `gt-col`, `gt-stack`, `gt-grid`, `gt-btnbar`
    - Labels: `gt-chip`, `gt-badge`
    - Cells: `gt-cell`, `gt-cell--interactive`, `gt-cell--selected`, `gt-cell--muted`, `gt-cell--danger`
    - Accessibility: shared `:focus-visible` ring hooks
  - Added cell sizing bridge:
    - `gt-grid[data-cell-size="sm|md|lg"]` controls `--gt-cell-min`, `--gt-cell-pad`, `--gt-cell-min-height`.

## Example Primitive Adoption vs Custom Additions
- Adopted/kept from prompt examples: surface primitives, row/stack/grid helpers, badge/chip primitives, selectable cell primitives, focus styles.
- Renamed/expanded:
  - Used `gt-btnbar` for compact action clusters.
  - Used attribute-driven cell sizing (`data-cell-size`) instead of per-page grid forks.
- Added beyond examples:
  - Compatibility alias strategy in tokens to avoid breaking existing pages during migration.
  - `gt-cell--interactive` for hover/interaction semantics without adding per-page hover rules.

## Pages Refactored in This Phase
- Primary target pages:
  - `frontend/app/experiments/[id]/placement/page.tsx`
  - `frontend/app/experiments/[id]/recipes/page.tsx`
- Quick shared-cell passes:
  - `frontend/app/experiments/[id]/overview/page.tsx`
  - `frontend/app/experiments/[id]/baseline/page.tsx`
- Supportive module cleanup:
  - `frontend/app/experiments/experiments.module.css` (reduced duplicate base cell/card/grid rules; kept page-specific layout behavior)

## Before/After Simplification Summary
- Before: shared patterns mostly lived as repeated CSS Module blocks with minor value drift and page-specific overrides.
- After: shared visuals are anchored in global tokens + a small `gt-*` primitive layer; page modules retain only behavior/layout specifics.
- Additional cleanup: explicit `recipeBadge`/`recipeBadgeEmpty` selectors were added to match existing `recipes` usage and remove implicit undefined class behavior.
