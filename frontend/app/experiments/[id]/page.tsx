"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { backendFetch, normalizeBackendError } from "@/lib/backend";
import { fetchExperimentStatusSummary } from "@/lib/experiment-status";
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import PageShell from "@/src/components/ui/PageShell";
import SectionCard from "@/src/components/ui/SectionCard";

export default function ExperimentLandingPage() {
  const params = useParams();
  const router = useRouter();
  const experimentId = useMemo(() => {
    if (typeof params.id === "string") {
      return params.id;
    }
    if (Array.isArray(params.id)) {
      return params.id[0] ?? "";
    }
    return "";
  }, [params]);

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
          <IllustrationPlaceholder inventoryId="ILL-001" kind="notInvited" />
        </SectionCard>
      </PageShell>
    );
  }

  return (
    <PageShell title="Experiment" subtitle={experimentId || "Loading"}>
      <SectionCard>
        {offline ? (
          <IllustrationPlaceholder inventoryId="ILL-003" kind="offline" />
        ) : null}
        {!offline && !error ? <p>Opening experiment...</p> : null}
        {error ? <p>{error}</p> : null}
      </SectionCard>
    </PageShell>
  );
}
