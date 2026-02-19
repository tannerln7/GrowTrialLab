import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { unwrapList } from "@/lib/backend";
import { api } from "@/src/lib/api";
import { queryKeys } from "@/src/lib/queryKeys";
import { usePageQueryState } from "@/src/lib/usePageQueryState";

export type ExperimentListItem = {
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

export function useExperimentsListController() {
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
    if (meState.isError || experimentsState.isError) {
      return "Unable to load experiments.";
    }
    return "";
  }, [experimentsState.isError, meState.isError, notInvited]);

  const items = useMemo(() => {
    if (!experimentsQuery.data) {
      return [] as ExperimentListItem[];
    }
    try {
      return unwrapList<ExperimentListItem>(experimentsQuery.data);
    } catch {
      return [] as ExperimentListItem[];
    }
  }, [experimentsQuery.data]);

  return {
    ui: {
      loading,
      offline,
      error,
      notInvited,
    },
    data: {
      items,
    },
  };
}
