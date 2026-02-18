"use client";

import Link from "next/link";
import { useState } from "react";

import { backendFetch, normalizeBackendError } from "@/lib/backend";
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import { buttonVariants } from "@/src/components/ui/button";
import PageShell from "@/src/components/ui/PageShell";
import SectionCard from "@/src/components/ui/SectionCard";

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");
  const [meLoading, setMeLoading] = useState(false);
  const [meResult, setMeResult] = useState<string>("No profile loaded.");
  const [notInvited, setNotInvited] = useState(false);
  const [offline, setOffline] = useState(false);

  async function checkBackendHealth() {
    setLoading(true);
    setResult("");
    try {
      const response = await backendFetch("/healthz");
      if (!response.ok) {
        throw new Error("Backend returned a non-OK response.");
      }
      const data = await response.json();
      setResult(JSON.stringify(data, null, 2));
      setOffline(false);
    } catch {
      setOffline(true);
      setResult("Unable to reach backend.");
    } finally {
      setLoading(false);
    }
  }

  async function loadMe() {
    setMeLoading(true);
    try {
      const response = await backendFetch("/api/me");
      if (response.status === 403) {
        setNotInvited(true);
        setMeResult("Not invited.");
        return;
      }
      if (!response.ok) {
        setMeResult("Unable to load profile.");
        return;
      }
      const data = await response.json();
      setMeResult(`${data.email} (${data.role}, ${data.status})`);
      setNotInvited(false);
      setOffline(false);
    } catch (requestError) {
      const error = normalizeBackendError(requestError);
      if (error.kind === "offline") {
        setOffline(true);
      }
      setMeResult("Unable to load profile.");
    } finally {
      setMeLoading(false);
    }
  }

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
            onClick={checkBackendHealth}
            disabled={loading}
            type="button"
          >
            {loading ? "Checking..." : "Check backend health"}
          </button>
          <button
            className={buttonVariants({ variant: "secondary" })}
            onClick={loadMe}
            disabled={meLoading}
            type="button"
          >
            {meLoading ? "Loading..." : "Load my profile"}
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
