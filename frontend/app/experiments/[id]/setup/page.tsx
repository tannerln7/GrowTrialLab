"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";

import type { ExperimentStatusSummary } from "@/lib/experiment-status";
import { buttonVariants } from "@/src/components/ui/button";
import { experimentsStyles as styles } from "@/src/components/ui/experiments-styles";
import PageAlerts from "@/src/components/ui/PageAlerts";
import PageShell from "@/src/components/ui/PageShell";
import SectionCard from "@/src/components/ui/SectionCard";
import { api } from "@/src/lib/api";
import { queryKeys } from "@/src/lib/queryKeys";
import { useRouteParamString } from "@/src/lib/useRouteParamString";
import { usePageQueryState } from "@/src/lib/usePageQueryState";
import { cn } from "@/lib/utils";

type ChecklistItem = {
  id: "plants" | "tents_blocks" | "recipes";
  title: string;
  complete: boolean;
  href: string;
  actionLabel: string;
};

export default function ExperimentSetupPage() {
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

  if (notInvited) {
    return (
      <PageShell title="Setup">
        <SectionCard>
          <PageAlerts notInvited />
        </SectionCard>
      </PageShell>
    );
  }

  const checklist: ChecklistItem[] = [
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
        loading={statusState.isLoading}
        loadingText="Loading setup checklist..."
        error={error}
        offline={offline}
      />

      {!statusState.isLoading ? (
        <SectionCard title="Bootstrap Checklist">
          <div className="grid gap-3">
            {checklist.map((item) => (
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
