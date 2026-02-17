"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { backendFetch, normalizeBackendError } from "@/lib/backend";
import { cn } from "@/lib/utils";
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import { buttonVariants } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import PageShell from "@/src/components/ui/PageShell";
import SectionCard from "@/src/components/ui/SectionCard";
import { Textarea } from "@/src/components/ui/textarea";

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
        <Link className={cn(buttonVariants({ variant: "secondary" }), "border border-border")} href="/experiments">
          Cancel
        </Link>
      }
    >
      <SectionCard title="Experiment Details">
        <form className={"grid gap-3"} onSubmit={onSubmit}>
          <label className={"grid gap-2"}>
            <span className={"text-sm text-muted-foreground"}>Name</span>
            <Input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>

          <label className={"grid gap-2"}>
            <span className={"text-sm text-muted-foreground"}>Description</span>
            <Textarea value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>

          <div className={"flex flex-wrap items-center gap-2"}>
            <button
              className={cn(buttonVariants({ variant: "default" }), "border border-border")}
              disabled={saving}
              type="submit"
            >
              {saving ? "Creating..." : "Create experiment"}
            </button>
            <Link className={cn(buttonVariants({ variant: "secondary" }), "border border-border")} href="/experiments">
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
