"use client";

import PageAlerts from "@/src/components/ui/PageAlerts";
import PageShell from "@/src/components/ui/PageShell";
import SectionCard from "@/src/components/ui/SectionCard";
import { useExperimentLandingController } from "@/src/features/experiments/landing/useExperimentLandingController";

type ExperimentLandingPageClientProps = {
  experimentId: string;
};

export function ExperimentLandingPageClient({ experimentId }: ExperimentLandingPageClientProps) {
  const { ui } = useExperimentLandingController(experimentId);

  if (ui.notInvited) {
    return (
      <PageShell title="Experiment">
        <SectionCard>
          <PageAlerts notInvited />
        </SectionCard>
      </PageShell>
    );
  }

  return (
    <PageShell title="Experiment" subtitle={experimentId || "Loading"}>
      <SectionCard>
        <PageAlerts
          loading={ui.loading}
          loadingText="Opening experiment..."
          error={ui.error}
          offline={ui.offline}
        />
      </SectionCard>
    </PageShell>
  );
}
