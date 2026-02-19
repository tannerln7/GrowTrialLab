"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo } from "react";

import { unwrapList } from "@/lib/backend";
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import { buttonVariants } from "@/src/components/ui/button";
import PageAlerts from "@/src/components/ui/PageAlerts";
import PageShell from "@/src/components/ui/PageShell";
import ResponsiveList from "@/src/components/ui/ResponsiveList";
import SectionCard from "@/src/components/ui/SectionCard";
import { api } from "@/src/lib/api";
import { queryKeys } from "@/src/lib/queryKeys";
import { usePageQueryState } from "@/src/lib/usePageQueryState";

type Experiment = {
  id: string;
  name: string;
  description: string;
  status: string;
};

type MePayload = {
  email: string;
  role: string;
  status: string;
};

export default function ExperimentsPage() {
  const meQuery = useQuery({
    queryKey: queryKeys.system.me(),
    queryFn: () => api.get<MePayload>("/api/me"),
    staleTime: 60_000,
  });

  const experimentsQuery = useQuery({
    queryKey: queryKeys.experiments.list(),
    queryFn: () => api.get<unknown>("/api/v1/experiments/"),
    enabled: meQuery.isSuccess,
  });

  const meState = usePageQueryState(meQuery);
  const experimentsState = usePageQueryState(experimentsQuery);

  const notInvited = meState.errorKind === "forbidden";
  const loading = meState.isLoading || (meQuery.isSuccess && experimentsState.isLoading);
  const offline = meState.errorKind === "offline" || experimentsState.errorKind === "offline";
  const error = useMemo(() => {
    if (notInvited) {
      return "";
    }
    if (meState.isError) {
      return "Unable to load experiments.";
    }
    if (experimentsState.isError) {
      return "Unable to load experiments.";
    }
    return "";
  }, [experimentsState.isError, meState.isError, notInvited]);

  const items = useMemo(() => {
    if (!experimentsQuery.data) {
      return [] as Experiment[];
    }
    try {
      return unwrapList<Experiment>(experimentsQuery.data);
    } catch {
      return [] as Experiment[];
    }
  }, [experimentsQuery.data]);

  if (notInvited) {
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
        <PageAlerts loading={loading} loadingText="Loading..." error={error} offline={offline} />

        {!loading && !error ? (
          <ResponsiveList
            items={items}
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
