# UI CSS Phase 3 Report — Unification Sweep (Pre-Tailwind)

Date: 2026-02-17
Status: completed

## What changed
- Consolidated spacing onto a compact token ladder in `frontend/src/styles/tokens.css` using a Tailwind-aligned 4px mental model (`--gt-space-1` = 4px through `--gt-space-8` = 40px), with compatibility aliases retained for existing `xs/sm/md/lg/xl` usage.
- Added a single global density control (`--gt-density`) with a unitless default plus small-screen compact override, so spacing stays dense but readable on phones and stable across shared shells/primitives.
- Expanded shared primitives in `frontend/src/styles/primitives.css` with common layout shells (`gt-page`, `gt-section`, `gt-card`, `gt-panel`, `gt-toolbar`) and normalized existing primitive spacing to the same token ladder.
- Refactored route/component CSS modules to use spacing/radius tokens for UI spacing primitives (`padding`, `margin`, `gap`, row/column gaps, offsets) instead of ad-hoc values.
- Kept `frontend/app/experiments/experiments.module.css` focused on experiments-area geometry/state styling while preserving shared base visual patterns in global primitives.

## Drift removed
- Replaced repeated micro-variations like `0.35rem`, `0.38rem`, `0.45rem`, `0.55rem`, `0.62rem`, `0.72rem`, `0.95rem` with shared token steps.
- Unified repeated 10px/12px/16px/24px radius and spacing usage to tokenized radii and spacing steps.
- Normalized toolbar, badge/chip, panel, and card spacing across experiments pages, list surfaces, sticky bars, and shared UI shells.

## Explicit exception
- `PageShell.module.css` keeps a documented fixed `padding-bottom: 5.25rem` sticky-offset value as a deliberate safe-area/sticky-action-bar clearance value.

## Post-Phase Stabilization (2026-02-17)
- Root cause: the original density expression mixed unitless numbers and viewport units (`vw`) inside `--gt-density`, which made many downstream `var(--gt-space-*)` declarations invalid at compute time.
- User-visible effect: global `padding`/`gap` declarations in shared shells/cards/toolbars/cells fell back to defaults (`0`/`normal`), causing stacked and overlapping layout density regressions.
- Fix applied in `frontend/src/styles/tokens.css`:
  - moved to base spacing tokens (`--gt-space-base-*`) plus scaled tokens (`--gt-space-*`) so density is applied exactly once;
  - set unitless safe default `--gt-density: 1`;
  - retained compact small-screen override (`--gt-density: 0.94`) as the density floor.
