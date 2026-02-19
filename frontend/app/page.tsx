"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import { buttonVariants } from "@/src/components/ui/button";
import PageShell from "@/src/components/ui/PageShell";
import SectionCard from "@/src/components/ui/SectionCard";
import { api } from "@/src/lib/api";
import { normalizeUserFacingError } from "@/src/lib/error-normalization";

export default function Home() {
  const [result, setResult] = useState<string>("");
  const [meResult, setMeResult] = useState<string>("No profile loaded.");
  const [notInvited, setNotInvited] = useState(false);
  const [offline, setOffline] = useState(false);

  const healthMutation = useMutation({
    mutationFn: () => api.get<Record<string, unknown>>("/healthz"),
    onMutate: () => {
      setResult("");
      setOffline(false);
    },
    onSuccess: (data) => {
      setResult(JSON.stringify(data, null, 2));
      setOffline(false);
    },
    onError: () => {
      setOffline(true);
      setResult("Unable to reach backend.");
    },
  });

  const meMutation = useMutation({
    mutationFn: () => api.get<{ email: string; role: string; status: string }>("/api/me"),
    onSuccess: (data) => {
      setMeResult(`${data.email} (${data.role}, ${data.status})`);
      setNotInvited(false);
      setOffline(false);
    },
    onError: (mutationError) => {
      const normalized = normalizeUserFacingError(mutationError, "Unable to load profile.");
      if (normalized.kind === "forbidden") {
        setNotInvited(true);
        setMeResult("Not invited.");
        return;
      }
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setMeResult("Unable to load profile.");
    },
  });

  return (
    <PageShell
      title="GrowTrialLab"
      subtitle="Django API + Next.js frontend local development."
      actions={
        <div className="flex flex-wrap gap-2">
          <Link className={buttonVariants({ variant: "secondary" })} href="/experiments">
            Experiments
          </Link>
        </div>
      }
    >
      <SectionCard title="System Checks">
        <div className="flex flex-wrap gap-2">
          <button
            className={buttonVariants({ variant: "default" })}
            onClick={() => healthMutation.mutate()}
            disabled={healthMutation.isPending}
            type="button"
          >
            {healthMutation.isPending ? "Checking..." : "Check backend health"}
          </button>
          <button
            className={buttonVariants({ variant: "secondary" })}
            onClick={() => meMutation.mutate()}
            disabled={meMutation.isPending}
            type="button"
          >
            {meMutation.isPending ? "Loading..." : "Load my profile"}
          </button>
        </div>
        {notInvited ? (
          <IllustrationPlaceholder inventoryId="ILL-001" kind="notInvited" />
        ) : (
          <p className="m-0 text-muted-foreground">{meResult}</p>
        )}
        {offline ? (
          <IllustrationPlaceholder inventoryId="ILL-003" kind="offline" />
        ) : null}
        <pre className="m-0 min-h-32 overflow-auto rounded-lg border border-border bg-card p-3 text-foreground">
          {result || "No result yet."}
        </pre>
      </SectionCard>
    </PageShell>
  );
}
