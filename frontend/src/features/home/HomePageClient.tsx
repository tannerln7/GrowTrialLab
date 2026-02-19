"use client";

import Link from "next/link";

import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import { buttonVariants } from "@/src/components/ui/button";
import PageShell from "@/src/components/ui/PageShell";
import SectionCard from "@/src/components/ui/SectionCard";
import { useHomeController } from "@/src/features/home/useHomeController";

export function HomePageClient() {
  const { ui, actions, mutations } = useHomeController();

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
            onClick={actions.runHealthCheck}
            disabled={mutations.healthMutation.isPending}
            type="button"
          >
            {mutations.healthMutation.isPending ? "Checking..." : "Check backend health"}
          </button>
          <button
            className={buttonVariants({ variant: "secondary" })}
            onClick={actions.loadMyProfile}
            disabled={mutations.meMutation.isPending}
            type="button"
          >
            {mutations.meMutation.isPending ? "Loading..." : "Load my profile"}
          </button>
        </div>
        {ui.notInvited ? (
          <IllustrationPlaceholder inventoryId="ILL-001" kind="notInvited" />
        ) : (
          <p className="m-0 text-muted-foreground">{ui.meResult}</p>
        )}
        {ui.offline ? (
          <IllustrationPlaceholder inventoryId="ILL-003" kind="offline" />
        ) : null}
        <pre className="m-0 min-h-32 overflow-auto rounded-lg border border-border bg-card p-3 text-foreground">
          {ui.result || "No result yet."}
        </pre>
      </SectionCard>
    </PageShell>
  );
}
