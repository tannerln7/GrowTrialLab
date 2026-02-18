# UI Tailwind Migration Audit

Date: 2026-02-18  
Scope: `frontend/app` + `frontend/src` styling system and UI primitives (audit-only; no behavior changes)

## Method
- `rg --files -g '*.css' -g '*.module.css' frontend`
- `rg -n "style=\{\{" frontend/app frontend/src --glob '*.{ts,tsx}'`
- `rg -n "!important|border border-border|h-7 w-7|h-8 w-8|text-emerald-400|bg-black/" frontend/app frontend/src --glob '*.{ts,tsx,css}'`
- `rg -n "import \* as Tooltip from \"@radix-ui/react-tooltip\"|import \* as Popover from \"@radix-ui/react-popover\"" frontend/app frontend/src --glob '*.{ts,tsx}'`
- `rg -n "@/lib/utils|@/src/lib/utils" frontend/app frontend/src --glob '*.{ts,tsx}'`
- `rg -n "bg-\$\{|text-\$\{|border-\$\{" frontend/app frontend/src --glob '*.{ts,tsx}'`
- `rg -n "styles\.(previewCell|previewCells|previewGrid|previewRow|selectionGrid|slotGridInline)" frontend/app frontend/src --glob '*.{ts,tsx}'`

## Severity Rubric
- `High`: likely to cause migration regressions or production styling breakage.
- `Medium`: clear drift source that slows standardization and creates inconsistency.
- `Low`: cleanup debt with lower immediate user impact.

## 1) Stragglers
- `Medium`: Remaining CSS modules still define route/component-local styling primitives instead of shared Tailwind primitives: `frontend/app/page.module.css:1`, `frontend/app/offline/page.module.css:1`, `frontend/src/components/AppMarkPlaceholder.module.css:1`, `frontend/src/components/IllustrationPlaceholder.module.css:1`, `frontend/src/components/ui/OfflineBanner.module.css:1`.
- `Medium`: One-off page-local primitive wrappers duplicate shared UI behavior:
  - `ToolIconButton` in `frontend/app/experiments/[id]/recipes/page.tsx:118`
  - `ToolIconButton` in `frontend/app/experiments/[id]/placement/page.tsx:279`
- `Medium`: Route-local raw Radix usage bypasses shared wrappers:
  - `frontend/app/experiments/[id]/recipes/page.tsx:3` (`@radix-ui/react-tooltip`)
  - `frontend/app/p/[id]/page.tsx:13` (`@radix-ui/react-popover`)
- `Low`: Inline style objects still exist in overview layout geometry: `frontend/app/experiments/[id]/overview/page.tsx:801`, `frontend/app/experiments/[id]/overview/page.tsx:829`.

## 2) Overrides / Class Wrestling
- `Low`: No `!important` usage found by `rg -n "!important" frontend/app frontend/src --glob '*.{ts,tsx,css}'`.
- `Medium`: Direct class conflict in one expression (`bg-secondary` and `bg-destructive`, `text-secondary-foreground` and `text-destructive-foreground` in same class string), relying on ordering for final style: `frontend/app/experiments/[id]/recipes/page.tsx:135`.
- `Medium`: Repeated border layering adds redundant utility composition and indicates style wrestling (`buttonVariants` + extra `border border-border`): examples at `frontend/app/experiments/[id]/overview/page.tsx:393`, `frontend/app/experiments/[id]/schedule/page.tsx:709`, `frontend/app/p/[id]/page.tsx:591`.

## 3) Duplicate / Near-Duplicate Primitives
- `High`: Icon action primitive overlap.
  - Shared primitive: `frontend/src/components/ui/icon-button.tsx:6`
  - Local duplicates: `frontend/app/experiments/[id]/recipes/page.tsx:118`, `frontend/app/experiments/[id]/placement/page.tsx:279`
  - Overlap reason: same icon-only button geometry, danger variant, and tooltip behavior.
- `High`: Select primitive overlap.
  - Shared `Select` exists: `frontend/src/components/ui/select.tsx:9`
  - Route usage stays native with style-map class: `frontend/app/experiments/[id]/recipes/page.tsx:807`, `frontend/app/experiments/[id]/placement/page.tsx:2258`, `frontend/app/p/[id]/page.tsx:814`
  - Overlap reason: same trigger/content behavior solved two ways.
- `Medium`: Tooltip/Popover overlap.
  - Shared tooltip wrapper exists: `frontend/src/components/ui/tooltip.tsx:8`
  - Route-local Tooltip and Popover still used directly: `frontend/app/experiments/[id]/recipes/page.tsx:3`, `frontend/app/p/[id]/page.tsx:13`
  - Overlap reason: duplicated portal/content tokens and offsets.
- `Medium`: TableShell overlap.
  - Shared table shell exists: `frontend/src/components/ui/table-shell.tsx:5`
  - Table markup is inlined in responsive list: `frontend/src/components/ui/ResponsiveList.tsx:31`
  - Overlap reason: shared table surface primitives not adopted.
- `Medium`: Notice overlap.
  - Shared notice component exists: `frontend/src/components/ui/notice.tsx:5`
  - Success notices are inlined text colors across pages: `frontend/app/experiments/[id]/baseline/page.tsx:740`, `frontend/app/experiments/[id]/feeding/page.tsx:347`, `frontend/app/p/[id]/page.tsx:922`
  - Overlap reason: semantic notice states are split between ad-hoc text and reusable component.

## 4) Variant System Consistency
- `Medium`: `cva` is used in some primitives (`button`, `badge`, `icon-button`, `notice`) but not consistently across reusable patterns: `frontend/src/components/ui/button.tsx:7`, `frontend/src/components/ui/badge.tsx:5`, `frontend/src/components/ui/icon-button.tsx:6`, `frontend/src/components/ui/notice.tsx:5`.
- `Medium`: Large class-map constants encode pseudo-variant behavior by name suffix (`...Ready`, `...Pending`, `...Active`) outside `cva`: `frontend/src/components/ui/experiments-styles.ts:49`, `frontend/src/components/ui/experiments-styles.ts:55`, `frontend/src/components/ui/experiments-styles.ts:107`, `frontend/src/components/ui/cockpit-styles.ts:1`.
- `Low`: `cn` import path is inconsistent (`@/lib/utils` vs `@/src/lib/utils`), increasing drift in conventions: `frontend/src/components/ui/button.tsx:5`, `frontend/src/components/ui/PageShell.tsx:6`, `frontend/app/experiments/[id]/baseline/page.tsx:14`.

## 5) Token / Theme Integrity
- `Medium`: Non-token literal color remains in app metadata: `frontend/app/layout.tsx:46` (`themeColor: "#202833"`).
- `Medium`: Non-token hex mixed into module styling: `frontend/app/page.module.css:43` (`#0a0f14`).
- `Medium`: Significant arbitrary utility values bypass normal spacing/typography ladder in style maps:
  - `frontend/src/components/ui/experiments-styles.ts:21` (`min-w-[210px]`)
  - `frontend/src/components/ui/experiments-styles.ts:24` (`h-[86px] w-[86px]`)
  - `frontend/src/components/ui/experiments-styles.ts:84` (`text-[0.72rem] ... max-sm:text-[0.68rem]`)
  - `frontend/app/experiments/[id]/placement/page.tsx:2063` (`min-w-[220px]`)

## 6) Dynamic Class Pitfalls
- `Low`: No dynamic Tailwind class interpolation (`bg-${x}`, `text-${x}`, `border-${x}`) was found by scan.
- `Low`: Class composition is mostly static (`cn(...)` and `[].join(" ")`) and therefore scan-safe in current usage: `frontend/app/experiments/[id]/overview/page.tsx:393`, `frontend/app/experiments/[id]/recipes/page.tsx:649`, `frontend/app/experiments/[id]/placement/page.tsx:1545`.

## 7) A11y / State Styling
- `High`: Keyboard-interactive `article` controls (`role="button"`, `tabIndex={0}`, `aria-pressed`) rely on hover/selected visuals without explicit focus-visible treatment at callsite.
  - `frontend/app/experiments/[id]/recipes/page.tsx:666`
  - `frontend/app/experiments/[id]/placement/page.tsx:1562`
  - `frontend/app/experiments/[id]/baseline/page.tsx:987`
- `Medium`: Small icon hit targets are below typical 44px touch guidance:
  - `frontend/src/components/ui/icon-button.tsx:15` (`h-7 w-7`)
  - `frontend/src/components/ui/icon-button.tsx:16` (`h-8 w-8`)
- `Medium`: State color semantics are inconsistent between reusable notice variants and ad-hoc text colors (`text-emerald-300` vs `text-emerald-400`): `frontend/src/components/ui/notice.tsx:9`, `frontend/app/experiments/[id]/feeding/page.tsx:347`, `frontend/app/experiments/[id]/schedule/page.tsx:703`.

## 8) Responsive / Touch Ergonomics
- `High`: Horizontal-scrolling dense grids suggest touch friction in constrained viewports:
  - `frontend/app/experiments/[id]/placement/page.tsx:2061` (`grid-flow-col auto-cols-[minmax(220px,1fr)] ... overflow-x-auto`)
  - `frontend/app/experiments/[id]/placement/page.tsx:2063` (`min-w-[220px]` cards)
- `Medium`: Very small mobile text sizes and tight micro-layout values reduce readability/tap clarity:
  - `frontend/src/components/ui/experiments-styles.ts:84` (`text-[0.72rem]`, `text-[0.68rem]`)
  - `frontend/src/components/ui/experiments-styles.ts:116` (`h-4 w-4` step index)
- `Medium`: Popover width clamps may still crowd content on narrow screens despite viewport calc: `frontend/app/p/[id]/page.tsx:808`.

## 9) Dead Styling / Ghost Styling
- `Medium`: Unused stylesheet candidate: `frontend/src/styles/theme.css:1` is not imported by app/runtime CSS (only `tailwind-theme.css` is imported in `frontend/app/globals.css:3`).
- `Medium`: Unused shared primitive components (zero app imports found) indicate ghost styling inventory:
  - `frontend/src/components/ui/dense-selectable-cell.tsx:1`
  - `frontend/src/components/ui/dialog.tsx:1`
  - `frontend/src/components/ui/dropdown-menu.tsx:1`
  - `frontend/src/components/ui/empty-state.tsx:1`
  - `frontend/src/components/ui/notice.tsx:1`
  - `frontend/src/components/ui/panel-surface.tsx:1`
  - `frontend/src/components/ui/popover.tsx:1`
  - `frontend/src/components/ui/scroll-area.tsx:1`
  - `frontend/src/components/ui/select.tsx:1`
  - `frontend/src/components/ui/separator.tsx:1`
  - `frontend/src/components/ui/skeleton.tsx:1`
  - `frontend/src/components/ui/table-shell.tsx:1`
  - `frontend/src/components/ui/tabs.tsx:1`
- `Low`: Unused keys in `experiments-styles` class map (no `styles.<key>` call sites):
  - Defined at `frontend/src/components/ui/experiments-styles.ts:85`, `frontend/src/components/ui/experiments-styles.ts:86`, `frontend/src/components/ui/experiments-styles.ts:87`, `frontend/src/components/ui/experiments-styles.ts:88`, `frontend/src/components/ui/experiments-styles.ts:101`, `frontend/src/components/ui/experiments-styles.ts:111`
  - Keys: `previewCell`, `previewCells`, `previewGrid`, `previewRow`, `selectionGrid`, `slotGridInline`
- `Low`: `frontend/app/tailwind-probe/page.tsx:1` remains a scaffold route and should be explicitly retained or retired as part of final migration closure.

## Recommended Execution Plan

### Phase 1: Dead Styling + Import Standardization
- Remove `frontend/src/styles/theme.css` if confirmed unused in runtime and tests.
- Prune unused `experiments-styles` keys and deprecate/retain unused UI primitives with explicit owner/date notes.
- Normalize `cn` import path to one convention (`@/lib/utils` or `@/src/lib/utils`).

### Phase 2: Primitive Consolidation
- Replace route-local `ToolIconButton` implementations with `IconButton` + shared tooltip wrapper.
- Migrate raw Radix route usage to shared wrappers (`tooltip`, `popover`) or intentionally delete wrappers not used.
- Standardize notices to one semantic primitive (`Notice`) or one explicit route-level convention.

### Phase 3: Variant + Token Hardening
- Define strict variant policy: reusable components via `cva`, geometry-only tokens in style maps.
- Remove repeated extra border layering on `buttonVariants` consumers where redundant.
- Map repeated arbitrary values to token/theme ladder where possible.

### Phase 4: A11y + Mobile Ergonomics
- Add explicit `focus-visible` visuals for all keyboard-interactive non-button elements.
- Increase icon/tap targets toward mobile-safe minimums.
- Rework dense horizontal grids and narrow text sizes for touch readability in phone layouts.

## Verification Scenarios (Report Quality Gate)
- Section completeness: all required audit sections `1..9` are present.
- Evidence integrity: each finding includes at least one file path and line reference.
- Drift validation: cited grep-based findings correspond to current repo state.
- Dead-style validation: `theme.css` import absence and zero-call-site entries are documented with search evidence.

## Sources
- Repository-only analysis (no external web/docs sources).

## Completion RG Checks (2026-02-18)
- `rg --files -g '*.css' -g '*.module.css' frontend`
  - Expected: `frontend/app/globals.css`, `frontend/src/styles/tokens.css`, `frontend/src/styles/tailwind-theme.css` only.
- `rg -n "\\.module\\.css" frontend/app frontend/src --glob '*.{ts,tsx}'`
  - Expected: no matches.
- `rg -n "style=\\{\\{" frontend/app frontend/src --glob '*.{ts,tsx}'`
  - Expected: no matches.
- `rg -n "className=\\{`" frontend/app frontend/src --glob '*.{ts,tsx}'`
  - Expected: one match in `frontend/app/layout.tsx` for Next font vars; no Tailwind utility interpolation.
- `rg -n "(bg|text|border|ring|p|m|w|h)-\\$\\{" frontend/app frontend/src --glob '*.{ts,tsx}'`
  - Expected: no matches.
- `rg -n "\\bgt-[a-z0-9-]+" frontend/app frontend/src --glob '*.{ts,tsx,css}'`
  - Expected: no matches (legacy `gt-*` class system removed).
