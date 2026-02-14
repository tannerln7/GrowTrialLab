"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { backendFetch, normalizeBackendError } from "@/lib/backend";
import {
  fetchExperimentStatusSummary,
  type ExperimentStatusSummary,
} from "@/lib/experiment-status";
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import PageShell from "@/src/components/ui/PageShell";
import SectionCard from "@/src/components/ui/SectionCard";

import styles from "../../experiments.module.css";

type ChecklistItem = {
  id: "plants" | "blocks" | "recipes";
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
  const [saving, setSaving] = useState(false);
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

  async function createDefaultBlocks() {
    setSaving(true);
    setError("");
    try {
      const response = await backendFetch(
        `/api/v1/experiments/${experimentId}/blocks/defaults`,
        { method: "POST" },
      );
      if (!response.ok) {
        setError("Unable to create default blocks.");
        return;
      }
      const summary = await loadStatus();
      if (summary.setup.is_complete) {
        router.replace(`/experiments/${experimentId}/overview`);
      }
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to create default blocks.");
    } finally {
      setSaving(false);
    }
  }

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
      id: "blocks",
      title: "Blocks / Slots",
      complete: !statusSummary?.setup.missing.blocks,
      href: `/experiments/${experimentId}/slots`,
      actionLabel: "Go to slots",
    },
    {
      id: "recipes",
      title: "Recipes",
      complete: !statusSummary?.setup.missing.recipes,
      href: `/experiments/${experimentId}/assignment`,
      actionLabel: "Go to recipes",
    },
  ];

  return (
    <PageShell
      title="Setup"
      subtitle="Complete bootstrap setup: plants, slots, and recipes."
      actions={
        <Link className={styles.buttonSecondary} href="/experiments">
          Back to experiments
        </Link>
      }
    >
      {loading ? <p className={styles.mutedText}>Loading setup checklist...</p> : null}
      {error ? <p className={styles.errorText}>{error}</p> : null}
      {offline ? <IllustrationPlaceholder inventoryId="ILL-003" kind="offline" /> : null}

      {!loading ? (
        <SectionCard title="Bootstrap Checklist">
          <div className={styles.blocksList}>
            {checklist.map((item) => (
              <article className={styles.blockRow} key={item.id}>
                <strong>{item.title}</strong>
                <p className={styles.mutedText}>
                  {item.complete ? "Complete" : "Incomplete"}
                </p>
                <div className={styles.actions}>
                  <Link className={styles.buttonPrimary} href={item.href}>
                    {item.actionLabel}
                  </Link>
                  {item.id === "blocks" && !item.complete ? (
                    <button
                      className={styles.buttonSecondary}
                      type="button"
                      disabled={saving}
                      onClick={() => void createDefaultBlocks()}
                    >
                      {saving ? "Creating..." : "Create default blocks"}
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </SectionCard>
      ) : null}
    </PageShell>
  );
}
