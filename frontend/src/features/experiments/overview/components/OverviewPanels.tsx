import Link from "next/link";

import { cn } from "@/lib/utils";
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import { buttonVariants } from "@/src/components/ui/button";
import SectionCard from "@/src/components/ui/SectionCard";

import { experimentsStyles as styles } from "@/src/components/ui/experiments-styles";

type ReadinessItem = {
  key: string;
  label: string;
  value: number;
};

type StateActionLink = {
  href: string;
  className: string;
  label: string;
};

type OverviewStateModel = {
  lifecycleState: string;
  readinessItems: ReadinessItem[];
  busy: boolean;
  startReady: boolean;
  showStop: boolean;
  stateActionLinks: StateActionLink[];
};

type OverviewStateActions = {
  onStart: () => void;
  onStop: () => void;
};

type OverviewScheduleModel = {
  nextScheduleSlotText: string;
  scheduleHref: string;
  scheduleClassName: string;
};

export function OverviewStatePanel({ model, actions }: { model: OverviewStateModel; actions: OverviewStateActions }) {
  return (
    <SectionCard title="Experiment State">
      <div className={styles.overviewStateCard}>
        <p className="text-sm text-muted-foreground">State: {model.lifecycleState.toUpperCase() || "UNKNOWN"}</p>
        <div className={styles.overviewReadinessRow}>
          {model.readinessItems.map((item) => (
            <span
              key={item.key}
              className={cn(
                styles.overviewReadinessChip,
                item.value === 0 ? styles.overviewReadinessChipReady : styles.overviewReadinessChipPending,
              )}
            >
              {item.label}: {item.value}
            </span>
          ))}
        </div>
        <div className={styles.overviewStateActionRow}>
          <button
            className={cn(buttonVariants({ variant: "default" }), styles.overviewActionButton)}
            type="button"
            disabled={model.busy || !model.startReady}
            onClick={actions.onStart}
          >
            Start
          </button>
          {model.showStop ? (
            <button
              className={cn(buttonVariants({ variant: "destructive" }), styles.overviewActionButton)}
              type="button"
              disabled={model.busy}
              onClick={actions.onStop}
            >
              Stop
            </button>
          ) : null}
          {model.stateActionLinks.map((link) => (
            <Link key={link.href} className={link.className} href={link.href}>
              {link.label}
            </Link>
          ))}
        </div>
        {!model.startReady ? (
          <p className={"text-sm text-muted-foreground"}>Start blocked until readiness is complete.</p>
        ) : null}
      </div>
    </SectionCard>
  );
}

export function OverviewSchedulePanel({ model }: { model: OverviewScheduleModel }) {
  return (
    <SectionCard title="Schedule">
      <div className={styles.overviewScheduleCard}>
        <p className="text-sm text-muted-foreground">Next schedule slot: {model.nextScheduleSlotText}</p>
        <div className={"flex flex-wrap items-center gap-2"}>
          <Link className={model.scheduleClassName} href={model.scheduleHref}>
            Schedule
          </Link>
        </div>
      </div>
    </SectionCard>
  );
}

export function OverviewEmptyPanel() {
  return (
    <SectionCard>
      <IllustrationPlaceholder inventoryId="ILL-201" kind="generic" />
      <p className="text-sm text-muted-foreground">No plants available for this experiment.</p>
    </SectionCard>
  );
}
