# UI CSS Phase 2 Report

Date: 2026-02-17

## Scope completed
- Migrated remaining high-traffic experiment routes to shared `gt-*` primitives for buttons, forms, notices, badges, and dense cell/list scaffolds:
  - `setup`, `rotation`, `feeding`, `schedule`
  - plus supporting sweeps across `plants`, experiment list/create pages, and cockpit (`/p/[id]`).
- Cockpit route now uses shared primitive classes for button/form/notice/chip/modal/popover base surfaces; route CSS is now focused on cockpit-only geometry/content layouts.
- Removed now-redundant primitive usage from `experiments.module.css` consumers and shifted those concerns to `frontend/src/styles/primitives.css`.

## Shared primitives added/extended
- Added shared helpers:
  - `.gt-modal-backdrop`
  - `.gt-popover`
  - `.gt-visually-hidden`
- Continued use of canonical shared sets:
  - `.gt-button*`, `.gt-input/.gt-select/.gt-textarea`, `.gt-text-*`, `.gt-badge/.gt-chip`, `.gt-cell*`, `.gt-btnbar`, `.gt-stack`, `.gt-row`, `.gt-col`.

## Drift reduction results
- `frontend/app/experiments/experiments.module.css` no longer carries the previous top-level button/form/text primitive block used by many routes.
- Cockpit local CSS (`frontend/app/p/[id]/page.module.css`) was reduced to route-specific layout classes; duplicated badge/popover/hidden-input primitives were removed.
- `frontend/app/globals.css` remains base-only (global reset + focus/default element transitions).

## Visual changes noted
- Minor normalization in spacing/radius across migrated pages due to shared primitive adoption.
- Badge and helper text rendering now consistently follows `gt-*` shared styles.

## Phase 3 candidates
- Remove remaining dead/legacy classes from `experiments.module.css` and split large route-specific sections into smaller module files by page concern.
- Introduce a lightweight shared dense-layout helper layer (if needed) for remaining repeated tent/shelf/slot geometry variants.
- Continue class-name convergence toward Tailwind-compatible utility semantics (without introducing Tailwind yet).
