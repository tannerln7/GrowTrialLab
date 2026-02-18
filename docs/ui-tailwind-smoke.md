# UI Tailwind Smoke Checks

Last updated: 2026-02-18

## Purpose
Quick manual checks for keyboard accessibility, focus visibility, selected/disabled states, touch target ergonomics, and contrast on the Tailwind-first UI.

## Runbook
1. Open app in mobile-width viewport (e.g. 390x844) and desktop viewport.
2. Use keyboard-only navigation (`Tab`, `Shift+Tab`, `Enter`, `Space`) for all listed flows.
3. Validate visible focus rings, clear selected states, and disabled control behavior.

## Page Checks
### Placement (`/experiments/{id}/placement`)
1. Tab through stepper controls, tray/plant selectable cells, and toolbar icon actions.
2. Confirm focus rings are visible on stepper buttons, cell cards, and icon buttons.
3. In Steps 2-4, toggle selected trays/plants and confirm selected state has ring + surface change.
4. Confirm destructive icon actions are visibly distinct and disabled controls cannot be activated.
5. On mobile width, confirm touch controls are comfortably tappable (buttons, icon actions, selects).

### Recipes (`/experiments/{id}/recipes`)
1. Keyboard-select recipe cards and plant cards (`Enter`/`Space`), then clear/apply actions.
2. Confirm focus-visible ring on selectable cards and icon toolbar actions.
3. Verify draft/selected states are visually distinct and remain readable.

### Baseline (`/experiments/{id}/baseline`)
1. Tab through queue cards, grade controls, save/relock actions, and photo controls.
2. Confirm queue card focus ring and selected-card state clarity.
3. Verify status chips (`Captured`/`No baseline`) remain readable in dark theme.

### Feeding (`/experiments/{id}/feeding`)
1. Tab through plant select, note toggle, and save actions.
2. Confirm disabled controls show reduced emphasis and reject activation.
3. Confirm success notices are readable and distinct from neutral text.

### Schedule (`/experiments/{id}/schedule`)
1. Keyboard switch recurrence/scope buttons and weekly/interval controls.
2. Confirm active state for mode/scope toggles and visible focus rings across controls.
3. Validate rule add/remove actions remain easy to tap on mobile.

### Overview (`/experiments/{id}/overview`)
1. Tab through state/action controls and placement cards.
2. Confirm readiness chips and success chips are readable in dark theme.
3. Confirm schedule/start/stop actions maintain visible focus and disabled affordances.

### Cockpit (`/p/{uuid}`)
1. Open recipe popover from keyboard and tab through popover controls.
2. Confirm popover content keeps visible focus treatment and actionable controls are tappable.
3. Validate notices and badges remain contrast-safe in dark theme.

## Regression Signals
- Focus indicator is missing or clipped on any interactive element.
- Selected state only changes subtle color without outline/ring.
- Disabled controls still appear fully active or can be triggered.
- Tap targets feel too small on phone viewport.
- Success/status chips are hard to read against dark backgrounds.
