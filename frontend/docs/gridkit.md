# GridKit Program Stub (Phase 0)

GridKit is the shared frontend system for rendering and interacting with the canonical physical hierarchy (`Tent -> Shelf -> Position -> Tray/Plant`) with consistent structure and flexible leaf-cell content by page. Phase 0 establishes dependencies, seams, and inventory tooling without changing runtime grid behavior.

## Locked library decisions
- Shelf paging: native CSS scroll-snap (single implementation, no carousel library).
- Tray folder overlay: Radix Popover (shadcn wrapper) + portal.
- Overlay animations: Framer Motion.
- Heavy grid virtualization: `@tanstack/react-virtual`.
- Container measurement: internal `useResizeObserver` hook.
- Drag-and-drop prep: `@dnd-kit/*` metadata/ID seams only in early phases (no `DndContext` wiring yet).

## Phase 0 scaffolding paths
- GridKit placeholders: `frontend/src/lib/gridkit/*`
- DnD seams: `frontend/src/lib/dnd/*`
- Resize observer hook: `frontend/src/lib/hooks/useResizeObserver.ts`
- Scrollbar utility: `.hide-scrollbar` in `frontend/app/globals.css`

## Inventory and guardrail scripts
- Inventory report:
  - `pnpm frontend:gridkit:inventory`
- Legacy-grid guardrail (report-only):
  - `pnpm frontend:gridkit:guardrail`
- Optional future enforcement mode:
  - `pnpm frontend:gridkit:guardrail:enforce`

The guardrail script currently reports totals and file lists without failing CI, and supports an allowlist at `infra/scripts/gridkit-legacy-allowlist.txt` for progressive tightening.
