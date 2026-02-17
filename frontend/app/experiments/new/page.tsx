"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { backendFetch, normalizeBackendError } from "@/lib/backend";
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import PageShell from "@/src/components/ui/PageShell";
import SectionCard from "@/src/components/ui/SectionCard";

export default function NewExperimentPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notInvited, setNotInvited] = useState(false);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    async function checkAccess() {
      try {
        const response = await backendFetch("/api/me");
        if (response.status === 403) {
          setNotInvited(true);
        }
      } catch (requestError) {
        const normalizedError = normalizeBackendError(requestError);
        if (normalizedError.kind === "offline") {
          setOffline(true);
        }
        setError("Unable to confirm access.");
      }
    }

    void checkAccess();
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);

    try {
      const response = await backendFetch("/api/v1/experiments/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
        }),
      });

      if (!response.ok) {
        setError("Unable to create experiment.");
        return;
      }

      const data = (await response.json()) as { id: string };
      router.push(`/experiments/${data.id}`);
    } catch (requestError) {
      const normalizedError = normalizeBackendError(requestError);
      if (normalizedError.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to create experiment.");
    } finally {
      setSaving(false);
    }
  }

  if (notInvited) {
    return (
      <PageShell title="New Experiment">
        <SectionCard>
          <IllustrationPlaceholder inventoryId="ILL-001" kind="notInvited" />
        </SectionCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="New Experiment"
      subtitle="Create an experiment and finish bootstrap setup."
      actions={
        <Link className={"inline-flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80"} href="/experiments">
          Cancel
        </Link>
      }
    >
      <SectionCard title="Experiment Details">
        <form className={"grid gap-3"} onSubmit={onSubmit}>
          <label className={"grid gap-2"}>
            <span className={"text-sm text-muted-foreground"}>Name</span>
            <input
              className={"flex h-9 w-full items-center rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>

          <label className={"grid gap-2"}>
            <span className={"text-sm text-muted-foreground"}>Description</span>
            <textarea
              className={"flex min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>

          <div className={"flex flex-wrap items-center gap-2"}>
            <button
              className={"inline-flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90"}
              disabled={saving}
              type="submit"
            >
              {saving ? "Creating..." : "Create experiment"}
            </button>
            <Link className={"inline-flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80"} href="/experiments">
              Cancel
            </Link>
          </div>

          {error ? <p className={"text-sm text-destructive"}>{error}</p> : null}
          {offline ? (
            <IllustrationPlaceholder inventoryId="ILL-003" kind="offline" />
          ) : null}
        </form>
      </SectionCard>
    </PageShell>
  );
}
