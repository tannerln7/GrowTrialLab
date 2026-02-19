"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";

import type { ExperimentStatusSummary } from "@/lib/experiment-status";
import PageAlerts from "@/src/components/ui/PageAlerts";
import PageShell from "@/src/components/ui/PageShell";
import SectionCard from "@/src/components/ui/SectionCard";
import { api } from "@/src/lib/api";
import { queryKeys } from "@/src/lib/queryKeys";
import { useRouteParamString } from "@/src/lib/useRouteParamString";
import { usePageQueryState } from "@/src/lib/usePageQueryState";

export default function ExperimentLandingPage() {
  const router = useRouter();
  const experimentId = useRouteParamString("id") || "";

  const statusQuery = useQuery({
    queryKey: queryKeys.experiment.status(experimentId),
    queryFn: () =>
      api.get<ExperimentStatusSummary>(
        `/api/v1/experiments/${experimentId}/status/summary`,
      ),
    enabled: Boolean(experimentId),
  });

  const statusState = usePageQueryState(statusQuery);
  const notInvited = statusState.errorKind === "forbidden";
  const offline = statusState.errorKind === "offline";
  const error = useMemo(() => {
    if (notInvited || offline || !statusState.isError) {
      return "";
    }
    return "Unable to determine experiment status.";
  }, [notInvited, offline, statusState.isError]);

  useEffect(() => {
    if (!experimentId || !statusQuery.data) {
      return;
    }

    if (statusQuery.data.setup.is_complete) {
      router.replace(`/experiments/${experimentId}/overview`);
    } else {
      router.replace(`/experiments/${experimentId}/setup`);
    }
  }, [experimentId, router, statusQuery.data]);

  if (notInvited) {
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
          loading={!offline && !error && statusState.isLoading}
          loadingText="Opening experiment..."
          error={error}
          offline={offline}
        />
      </SectionCard>
    </PageShell>
  );
}
