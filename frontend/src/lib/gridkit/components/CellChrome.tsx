import type * as React from "react";

import { cn } from "@/lib/utils";
import { CellChips } from "./CellChips";
import type { CellState, ChipSpec } from "../spec";

type CellChromeProps = {
  state?: CellState;
  interactive?: boolean;
  disabled?: boolean;
  locked?: boolean;
  onPress?: () => void;
  ariaLabel?: string;
  className?: string;
  chips?: ChipSpec[];
  header?: React.ReactNode;
  body?: React.ReactNode;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  dataAttributes?: Record<string, string | number | undefined>;
};

const BASE_CLASS =
  "relative grid min-h-[var(--gt-cell-min-height,5.25rem)] content-start gap-1 rounded-md border border-border p-[var(--gt-cell-pad,var(--gt-space-md))] transition-colors";

const TONE_CLASS: Record<NonNullable<CellState["tone"]>, string> = {
  default: "bg-[color:var(--gt-cell-surface-1)]",
  warn: "bg-[color:var(--gt-cell-surface-1)] ring-1 ring-amber-300/45",
  error: "bg-[color:var(--gt-cell-surface-1)] ring-1 ring-destructive/55",
  info: "bg-[color:var(--gt-cell-surface-1)] ring-1 ring-primary/45",
};

const INTERACTIVE_CLASS =
  "cursor-pointer hover:border-ring/70 active:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background";

const SELECTED_CLASS = "border-ring bg-[color:var(--gt-cell-selected)] ring-1 ring-ring/50";
const DISABLED_CLASS = "cursor-not-allowed opacity-60";

export function CellChrome({
  state,
  interactive = false,
  disabled = false,
  locked = false,
  onPress,
  ariaLabel,
  className,
  chips,
  header,
  body,
  footer,
  children,
  dataAttributes,
}: CellChromeProps) {
  const isDisabled = disabled || locked || Boolean(state?.disabled) || Boolean(state?.locked);
  const isInteractive = (interactive || Boolean(onPress)) && !isDisabled;
  const resolvedBody = body ?? children;
  const commonClassName = cn(
    BASE_CLASS,
    TONE_CLASS[state?.tone || "default"],
    (state?.selected ? SELECTED_CLASS : "") || "",
    isInteractive ? INTERACTIVE_CLASS : "",
    isDisabled ? DISABLED_CLASS : "",
    className,
  );

  const content = (
    <>
      <CellChips chips={chips} />
      {header ? <div className="relative z-[2]">{header}</div> : null}
      {resolvedBody ? <div className="relative z-[2]">{resolvedBody}</div> : null}
      {footer ? <div className="relative z-[2] mt-auto">{footer}</div> : null}
    </>
  );

  if (isInteractive || onPress || interactive) {
    return (
      <button
        type="button"
        className={commonClassName}
        onClick={isDisabled ? undefined : onPress}
        disabled={isDisabled}
        aria-pressed={state?.selected}
        aria-label={ariaLabel}
        {...dataAttributes}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={commonClassName}
      aria-label={ariaLabel}
      aria-disabled={isDisabled || undefined}
      {...dataAttributes}
    >
      {content}
    </div>
  );
}
