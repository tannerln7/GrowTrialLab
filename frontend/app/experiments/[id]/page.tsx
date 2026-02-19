"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { backendFetch, normalizeBackendError } from "@/lib/backend";
import { fetchExperimentStatusSummary } from "@/lib/experiment-status";
import PageAlerts from "@/src/components/ui/PageAlerts";
import PageShell from "@/src/components/ui/PageShell";
import SectionCard from "@/src/components/ui/SectionCard";
import { useRouteParamString } from "@/src/lib/useRouteParamString";

export default function ExperimentLandingPage() {
  const router = useRouter();
  const experimentId = useRouteParamString("id") || "";

  const [notInvited, setNotInvited] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function routeExperimentLanding() {
      if (!experimentId) {
        return;
      }
      setError("");

      try {
        const meResponse = await backendFetch("/api/me");
        if (meResponse.status === 403) {
          setNotInvited(true);
          return;
        }

        const summary = await fetchExperimentStatusSummary(experimentId);
        if (!summary) {
          setError("Unable to determine experiment status.");
          return;
        }

        if (summary.setup.is_complete) {
          router.replace(`/experiments/${experimentId}/overview`);
        } else {
          router.replace(`/experiments/${experimentId}/setup`);
        }
      } catch (requestError) {
        const normalized = normalizeBackendError(requestError);
        if (normalized.kind === "offline") {
          setOffline(true);
        } else {
          setError("Unable to determine experiment status.");
        }
      }
    }

    void routeExperimentLanding();
  }, [experimentId, router]);

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
          loading={!offline && !error}
          loadingText="Opening experiment..."
          error={error}
          offline={offline}
        />
      </SectionCard>
    </PageShell>
  );
}
