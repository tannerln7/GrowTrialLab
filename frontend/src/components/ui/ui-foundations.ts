import { cva } from "class-variance-authority";

export const uiInteraction = {
  focusRing:
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  disabled: "disabled:pointer-events-none disabled:opacity-50",
  transition: "transition-colors",
} as const;

export const controlBaseClass = [
  "flex w-full rounded-md border border-input bg-background text-sm text-foreground shadow-xs placeholder:text-muted-foreground",
  uiInteraction.transition,
  uiInteraction.focusRing,
  uiInteraction.disabled,
].join(" ");

export const surfaceVariants = cva(
  "rounded-lg border border-border bg-card text-card-foreground shadow-sm",
  {
    variants: {
      variant: {
        default: "",
        muted: "bg-muted/50",
        elevated: "bg-popover shadow-md",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export const panelSurfaceVariants = cva(
  "rounded-lg border border-border bg-card text-card-foreground shadow-sm",
  {
    variants: {
      variant: {
        default: "",
        muted: "bg-muted/50",
        elevated: "bg-popover shadow-md",
      },
      density: {
        compact: "p-2",
        default: "p-3",
        spacious: "p-4",
      },
    },
    defaultVariants: {
      variant: "default",
      density: "default",
    },
  },
);

export const toolbarRowVariants = cva(
  "flex flex-wrap items-center justify-between rounded-md border border-border bg-card",
  {
    variants: {
      variant: {
        default: "",
        muted: "bg-muted/50",
      },
      density: {
        compact: "gap-1.5 p-1.5",
        default: "gap-2 p-2",
      },
    },
    defaultVariants: {
      variant: "default",
      density: "default",
    },
  },
);

export const selectableCellVariants = cva(
  "relative grid min-h-[var(--gt-cell-min-height,5.25rem)] content-start gap-1 rounded-md border p-2",
  {
    variants: {
      tone: {
        default: "bg-[color:var(--gt-cell-surface-1)]",
        muted: "bg-[color:var(--gt-cell-surface-2)]",
      },
      state: {
        default: "border-border",
        selected: "border-ring bg-[color:var(--gt-cell-selected)] ring-1 ring-ring/50",
      },
      interactive: {
        true: [
          "cursor-pointer hover:border-ring/70 active:border-ring",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        ].join(" "),
        false: "",
      },
      dirty: {
        true: "ring-1 ring-ring/50",
        false: "",
      },
    },
    defaultVariants: {
      tone: "default",
      state: "default",
      interactive: true,
      dirty: false,
    },
  },
);
