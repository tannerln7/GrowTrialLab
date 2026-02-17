# UI CSS Phase S Report — Tailwind + shadcn-style Scaffold Completion

Date: 2026-02-17  
Status: completed

## Scope completed
- Kept scaffold-only posture: no broad CSS module migration, no page redesign.
- Added Tailwind v4 transition infrastructure for future migration:
  - `frontend/tailwind.config.ts` (minimal content globs for `app/` and `src/`).
  - `frontend/src/styles/tailwind-theme.css` using `@theme inline` with initial mappings to existing `--gt-*`/compat variables.
  - Explicit layering in `frontend/app/globals.css`: theme bridge import before Tailwind import, then existing global overrides.
- Added shadcn/ui-style project scaffolding:
  - `frontend/components.json` with aliases and v4-compatible Tailwind settings (`tailwind.config` intentionally blank for CLI compatibility).
  - `frontend/src/lib/utils.ts` with canonical `cn(...)` helper (`clsx` + `tailwind-merge`).
  - Initial foundational primitives in `frontend/src/components/ui/`:
    - `button.tsx`
    - `badge.tsx`
    - `card.tsx`
    - `dialog.tsx` (minimal Radix-backed wrapper)
- Expanded verification route `frontend/app/tailwind-probe/page.tsx` to render the new primitives.

## Dev hygiene fix
- Added frontend dev preflight script: `frontend/scripts/prepare-dev-cache.mjs`.
  - Moves non-writable/foreign-owned `.next/dev` cache directories aside before `next dev` starts.
- Wired script into `frontend/package.json` `dev` command.
- Updated Docker Compose frontend volumes with `/app/.next` mount to avoid writing root-owned `.next` artifacts to host bind mounts.
- Added README note documenting this behavior.

## Intentionally not done in Phase S
- No replacement of existing `gt-*` primitives in production pages.
- No conversion of route CSS modules to Tailwind utilities.
- No token system deprecation/removal.

## Codex Cloud handoff checklist
1. Migrate shared primitives first (`gt-button`, `gt-input`, `gt-card`-like surfaces) into `src/components/ui/*`.
2. Migrate high-risk pages in phases (`overview`/`placement`/`recipes` first with visual checkpoints).
3. Keep API/data-flow behavior unchanged while swapping presentation classes.
4. Remove dead module selectors only after each route reaches parity.
5. Retire or reduce legacy `gt-*` primitives once equivalent component usage is stable.

## Follow-up applied after Phase S
- Expanded the shadcn-style UI kit with baseline controls needed for route migration work (`input`, `textarea`, `select`, `tabs`, `tooltip`, `dropdown-menu`, `popover`, `separator`, `scroll-area`).
- Migrated shared route-agnostic shells/lists to Tailwind utilities directly in JSX and removed associated CSS modules (`PageShell`, `SectionCard`, `StickyActionBar`, `ResponsiveList`) to reduce style drift and keep component behavior close to markup.
