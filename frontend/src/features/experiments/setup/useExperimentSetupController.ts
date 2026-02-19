import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";

import type { ExperimentStatusSummary } from "@/lib/experiment-status";
import { api } from "@/src/lib/api";
import { queryKeys } from "@/src/lib/queryKeys";
import { usePageQueryState } from "@/src/lib/usePageQueryState";

export type SetupChecklistItem = {
  id: "plants" | "tents_blocks" | "recipes";
  title: string;
  complete: boolean;
  href: string;
  actionLabel: string;
};

export function useExperimentSetupController(experimentId: string) {
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
  const statusSummary = statusQuery.data ?? null;

  useEffect(() => {
    if (!experimentId || !statusSummary) {
      return;
    }

    if (statusSummary.setup.is_complete) {
      router.replace(`/experiments/${experimentId}/overview`);
    }
  }, [experimentId, router, statusSummary]);

  const notInvited = statusState.errorKind === "forbidden";
  const offline = statusState.errorKind === "offline";
  const error = useMemo(() => {
    if (!statusState.isError || notInvited || offline) {
      return "";
    }
    return "Unable to load setup checklist.";
  }, [notInvited, offline, statusState.isError]);

  const checklist: SetupChecklistItem[] = [
    {
      id: "plants",
      title: "Plants",
      complete: !statusSummary?.setup.missing.plants,
      href: `/experiments/${experimentId}/plants`,
      actionLabel: "Go to plants",
    },
    {
      id: "tents_blocks",
      title: "Tents + Slots",
      complete: !statusSummary?.setup.missing.tents && !statusSummary?.setup.missing.slots,
      href: `/experiments/${experimentId}/placement?step=1`,
      actionLabel: "Go to placement",
    },
    {
      id: "recipes",
      title: "Recipes",
      complete: !statusSummary?.setup.missing.recipes,
      href: `/experiments/${experimentId}/recipes`,
      actionLabel: "Go to recipes",
    },
  ];

  return {
    ui: {
      notInvited,
      offline,
      error,
      loading: statusState.isLoading,
    },
    data: {
      checklist,
    },
  };
}
