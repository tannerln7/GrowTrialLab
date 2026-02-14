"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { backendFetch, normalizeBackendError } from "@/lib/backend";
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import PageShell from "@/src/components/ui/PageShell";
import ResponsiveList from "@/src/components/ui/ResponsiveList";
import SectionCard from "@/src/components/ui/SectionCard";
import styles from "./experiments.module.css";

type Experiment = {
  id: string;
  name: string;
  description: string;
  status: string;
};

export default function ExperimentsPage() {
  const [items, setItems] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [notInvited, setNotInvited] = useState(false);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const meResponse = await backendFetch("/api/me");
        if (meResponse.status === 403) {
          setNotInvited(true);
          return;
        }

        const response = await backendFetch("/api/v1/experiments/");
        if (!response.ok) {
          setError("Unable to load experiments.");
          return;
        }
        const data = (await response.json()) as
          | { results?: Experiment[] }
          | Experiment[];
        const experiments = Array.isArray(data) ? data : data.results ?? [];
        setItems(experiments);
        setOffline(false);
      } catch (requestError) {
        const normalizedError = normalizeBackendError(requestError);
        if (normalizedError.kind === "offline") {
          setOffline(true);
        }
        setError("Unable to load experiments.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  if (notInvited) {
    return (
      <PageShell title="Experiments">
        <SectionCard>
          <IllustrationPlaceholder inventoryId="ILL-001" kind="notInvited" />
        </SectionCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Experiments"
      subtitle="Create and configure experiments with guided setup steps."
      actions={
        <div className={styles.actions}>
          <Link className={styles.buttonPrimary} href="/experiments/new">
            New experiment
          </Link>
          <Link className={styles.buttonSecondary} href="/">
            Back home
          </Link>
        </div>
      }
    >
      <SectionCard title="All Experiments">
        {loading ? <p className={styles.mutedText}>Loading...</p> : null}
        {error ? <p className={styles.errorText}>{error}</p> : null}

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
                  <Link href={`/experiments/${item.id}/overview`}>Open overview</Link>
                ),
              },
            ]}
            renderMobileCard={(item) => (
              <div className={styles.cardKeyValue}>
                <span>Name</span>
                <strong>{item.name}</strong>
                <span>Status</span>
                <strong>{item.status}</strong>
                <Link href={`/experiments/${item.id}/overview`}>Open overview</Link>
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
        {offline ? (
          <IllustrationPlaceholder inventoryId="ILL-003" kind="offline" />
        ) : null}
      </SectionCard>
      <SectionCard>
        <div className={styles.actions}>
          <Link className={styles.buttonPrimary} href="/experiments/new">
            New experiment
          </Link>
          <Link className={styles.buttonSecondary} href="/">
            Back home
          </Link>
        </div>
      </SectionCard>
    </PageShell>
  );
}
