"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { backendFetch, normalizeBackendError } from "@/lib/backend";
import { cn } from "@/lib/utils";
import {
  fetchExperimentStatusSummary,
  type ExperimentStatusSummary,
} from "@/lib/experiment-status";
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import { buttonVariants } from "@/src/components/ui/button";
import { experimentsStyles as styles } from "@/src/components/ui/experiments-styles";
import PageShell from "@/src/components/ui/PageShell";
import SectionCard from "@/src/components/ui/SectionCard";


type ChecklistItem = {
  id: "plants" | "tents_blocks" | "recipes";
  title: string;
  complete: boolean;
  href: string;
  actionLabel: string;
};

export default function ExperimentSetupPage() {
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

  const [loading, setLoading] = useState(true);
  const [notInvited, setNotInvited] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");
  const [statusSummary, setStatusSummary] = useState<ExperimentStatusSummary | null>(null);

  const loadStatus = useCallback(async () => {
    const summary = await fetchExperimentStatusSummary(experimentId);
    if (!summary) {
      throw new Error("Unable to load setup status.");
    }
    setStatusSummary(summary);
    return summary;
  }, [experimentId]);

  useEffect(() => {
    async function load() {
      if (!experimentId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");
      setOffline(false);

      try {
        const meResponse = await backendFetch("/api/me");
        if (meResponse.status === 403) {
          setNotInvited(true);
          return;
        }

        const summary = await loadStatus();
        if (summary.setup.is_complete) {
          router.replace(`/experiments/${experimentId}/overview`);
          return;
        }
      } catch (requestError) {
        const normalized = normalizeBackendError(requestError);
        if (normalized.kind === "offline") {
          setOffline(true);
        }
        setError("Unable to load setup checklist.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [experimentId, loadStatus, router]);

  if (notInvited) {
    return (
      <PageShell title="Setup">
        <SectionCard>
          <IllustrationPlaceholder inventoryId="ILL-001" kind="notInvited" />
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
        <Link className={cn(buttonVariants({ variant: "secondary" }), "border border-border")} href="/experiments">
          Back to experiments
        </Link>
      }
    >
      {loading ? <p className="text-sm text-muted-foreground">Loading setup checklist...</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {offline ? <IllustrationPlaceholder inventoryId="ILL-003" kind="offline" /> : null}

      {!loading ? (
        <SectionCard title="Bootstrap Checklist">
          <div className="grid gap-3">
            {checklist.map((item) => (
              <article className={[styles.cellFrame, styles.cellSurfaceLevel1].join(" ")} key={item.id}>
                <strong>{item.title}</strong>
                <p className="text-sm text-muted-foreground">
                  {item.complete ? "Complete" : "Incomplete"}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Link className={cn(buttonVariants({ variant: "default" }), "border border-border")} href={item.href}>
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
