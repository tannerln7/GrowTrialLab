"use client";

import Link from "next/link";
import { buttonVariants } from "@/src/components/ui/button";
import { experimentsStyles as styles } from "@/src/components/ui/experiments-styles";
import PageAlerts from "@/src/components/ui/PageAlerts";
import PageShell from "@/src/components/ui/PageShell";
import SectionCard from "@/src/components/ui/SectionCard";
import { useExperimentSetupController } from "@/src/features/experiments/setup/useExperimentSetupController";
import { cn } from "@/lib/utils";

type ExperimentSetupPageClientProps = {
  experimentId: string;
};

export function ExperimentSetupPageClient({ experimentId }: ExperimentSetupPageClientProps) {
  const { ui, data } = useExperimentSetupController(experimentId);

  if (ui.notInvited) {
    return (
      <PageShell title="Setup">
        <SectionCard>
          <PageAlerts notInvited />
        </SectionCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Setup"
      subtitle="Complete bootstrap setup: plants, tents + slots, and recipes."
      actions={
        <Link className={buttonVariants({ variant: "secondary" })} href="/experiments">
          Back to experiments
        </Link>
      }
    >
      <PageAlerts
        loading={ui.loading}
        loadingText="Loading setup checklist..."
        error={ui.error}
        offline={ui.offline}
      />

      {!ui.loading ? (
        <SectionCard title="Bootstrap Checklist">
          <div className="grid gap-3">
            {data.checklist.map((item) => (
              <article className={cn(styles.cellFrame, styles.cellSurfaceLevel1)} key={item.id}>
                <strong>{item.title}</strong>
                <p className="text-sm text-muted-foreground">
                  {item.complete ? "Complete" : "Incomplete"}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Link className={buttonVariants({ variant: "default" })} href={item.href}>
                    {item.actionLabel}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </SectionCard>
      ) : null}
    </PageShell>
  );
}
