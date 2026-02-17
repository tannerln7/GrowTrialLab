"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { backendFetch, normalizeBackendError, unwrapList } from "@/lib/backend";
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import PageShell from "@/src/components/ui/PageShell";
import ResponsiveList from "@/src/components/ui/ResponsiveList";
import SectionCard from "@/src/components/ui/SectionCard";

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
        const payload = (await response.json()) as unknown;
        setItems(unwrapList<Experiment>(payload));
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
      subtitle="Create experiments and complete bootstrap setup."
      actions={
        <div className={"flex flex-wrap items-center gap-2"}>
          <Link className={"inline-flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90"} href="/experiments/new">
            New experiment
          </Link>
          <Link className={"inline-flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80"} href="/">
            Back home
          </Link>
        </div>
      }
    >
      <SectionCard title="All Experiments">
        {loading ? <p className={"text-sm text-muted-foreground"}>Loading...</p> : null}
        {error ? <p className={"text-sm text-destructive"}>{error}</p> : null}

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
                  <Link href={`/experiments/${item.id}`}>Open experiment</Link>
                ),
              },
            ]}
            renderMobileCard={(item) => (
              <div className={"grid gap-2"}>
                <span>Name</span>
                <strong>{item.name}</strong>
                <span>Status</span>
                <strong>{item.status}</strong>
                <Link href={`/experiments/${item.id}`}>Open experiment</Link>
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
        <div className={"flex flex-wrap items-center gap-2"}>
          <Link className={"inline-flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90"} href="/experiments/new">
            New experiment
          </Link>
          <Link className={"inline-flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80"} href="/">
            Back home
          </Link>
        </div>
      </SectionCard>
    </PageShell>
  );
}
