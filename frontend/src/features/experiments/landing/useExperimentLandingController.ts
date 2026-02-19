import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";

import type { ExperimentStatusSummary } from "@/lib/experiment-status";
import { api } from "@/src/lib/api";
import { queryKeys } from "@/src/lib/queryKeys";
import { usePageQueryState } from "@/src/lib/usePageQueryState";

export function useExperimentLandingController(experimentId: string) {
  const router = useRouter();

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

  const ui = useMemo(
    () => ({
      notInvited,
      offline,
      error,
      loading: !offline && !error && statusState.isLoading,
    }),
    [error, notInvited, offline, statusState.isLoading],
  );

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

  return {
    ui,
  };
}
