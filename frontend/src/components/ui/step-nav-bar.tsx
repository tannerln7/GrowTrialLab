import * as React from "react";

import { Button } from "./button";
import { ToolbarRow } from "./toolbar-row";

type StepNavBarProps = {
  showBack: boolean;
  onBack: () => void;
  backDisabled?: boolean;
  onNext: () => void;
  nextDisabled?: boolean;
  nextLabel: string;
  blockerHint?: string;
  draftIndicator?: React.ReactNode;
  className?: string;
};

function StepNavBar({
  showBack,
  onBack,
  backDisabled,
  onNext,
  nextDisabled,
  nextLabel,
  blockerHint,
  draftIndicator,
  className,
}: StepNavBarProps) {
  return (
    <ToolbarRow className={className}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        {showBack ? (
          <Button
            variant="secondary"
            type="button"
            disabled={backDisabled}
            onClick={onBack}
          >
            Back
          </Button>
        ) : null}
        {blockerHint ? (
          <span className="text-sm text-muted-foreground">{blockerHint}</span>
        ) : null}
      </div>
      <div className="ml-auto flex items-center gap-2">
        {draftIndicator}
        <Button type="button" disabled={nextDisabled} onClick={onNext}>
          {nextLabel}
        </Button>
      </div>
    </ToolbarRow>
  );
}

export { StepNavBar };
