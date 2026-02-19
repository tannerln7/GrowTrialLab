"use client";

import Link from "next/link";
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import { buttonVariants } from "@/src/components/ui/button";
import PageAlerts from "@/src/components/ui/PageAlerts";
import PageShell from "@/src/components/ui/PageShell";
import ResponsiveList from "@/src/components/ui/ResponsiveList";
import SectionCard from "@/src/components/ui/SectionCard";
import { useExperimentsListController } from "@/src/features/experiments/list/useExperimentsListController";

export function ExperimentsListPageClient() {
  const { ui, data } = useExperimentsListController();

  if (ui.notInvited) {
    return (
      <PageShell title="Experiments">
        <SectionCard>
          <PageAlerts notInvited />
        </SectionCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Experiments"
      subtitle="Create experiments and complete bootstrap setup."
      actions={
        <div className={"flex flex-wrap items-center gap-2"}>
          <Link className={buttonVariants({ variant: "default" })} href="/experiments/new">
            New experiment
          </Link>
          <Link className={buttonVariants({ variant: "secondary" })} href="/">
            Back home
          </Link>
        </div>
      }
    >
      <SectionCard title="All Experiments">
        <PageAlerts loading={ui.loading} loadingText="Loading..." error={ui.error} offline={ui.offline} />

        {!ui.loading && !ui.error ? (
          <ResponsiveList
            items={data.items}
            getKey={(item) => item.id}
            columns={[
              {
                key: "name",
                label: "Name",
                render: (item) => item.name,
              },
              {
                key: "status",
                label: "Status",
                render: (item) => item.status,
              },
              {
                key: "overview",
                label: "Overview",
                render: (item) => (
                  <Link href={`/experiments/${item.id}`}>Open experiment</Link>
                ),
              },
            ]}
            renderMobileCard={(item) => (
              <div className={"grid gap-2"}>
                <span>Name</span>
                <strong>{item.name}</strong>
                <span>Status</span>
                <strong>{item.status}</strong>
                <Link href={`/experiments/${item.id}`}>Open experiment</Link>
              </div>
            )}
            emptyState={
              <IllustrationPlaceholder
                inventoryId="ILL-101"
                kind="noExperiments"
              />
            }
          />
        ) : null}
      </SectionCard>
      <SectionCard>
        <div className={"flex flex-wrap items-center gap-2"}>
          <Link className={buttonVariants({ variant: "default" })} href="/experiments/new">
            New experiment
          </Link>
          <Link className={buttonVariants({ variant: "secondary" })} href="/">
            Back home
          </Link>
        </div>
      </SectionCard>
    </PageShell>
  );
}
