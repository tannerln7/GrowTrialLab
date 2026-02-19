// Used in Phase 3 structural tent containers.
export const TENT_PRESET = {
  mobileColumns: 2,
  smallScreenColumns: 1,
} as const;

// Used in Phase 3 shelf stack components.
export const SHELF_PRESET = {
  stackDirection: "vertical",
} as const;

// Used in Phase 4 position strip pager.
export const POSITION_STRIP_PRESET = {
  maxVisible: 4,
} as const;

// Used in Phase 5 canonical tray cell.
export const TRAY_PRESET = {
  compactSummary: true,
} as const;

// Used in Phase 5 canonical slot cell.
export const SLOT_PRESET = {
  showSlotLabelWhenEmpty: true,
} as const;

// Used in Phase 5 canonical plant cell.
export const PLANT_PRESET = {
  denseMobile: true,
} as const;

// Used in Phase 6 tray folder overlay behavior.
export const TRAY_FOLDER_PRESET = {
  overlayStyle: "popover",
  animation: "framer-motion",
} as const;

export const gridKitPresets = {
  tent: TENT_PRESET,
  shelf: SHELF_PRESET,
  positionStrip: POSITION_STRIP_PRESET,
  tray: TRAY_PRESET,
  slot: SLOT_PRESET,
  plant: PLANT_PRESET,
  trayFolder: TRAY_FOLDER_PRESET,
} as const;
