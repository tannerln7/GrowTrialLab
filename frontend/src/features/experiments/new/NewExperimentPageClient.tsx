"use client";

import Link from "next/link";

import { buttonVariants } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import PageAlerts from "@/src/components/ui/PageAlerts";
import PageShell from "@/src/components/ui/PageShell";
import SectionCard from "@/src/components/ui/SectionCard";
import { Textarea } from "@/src/components/ui/textarea";
import { useNewExperimentController } from "@/src/features/experiments/new/useNewExperimentController";

export function NewExperimentPageClient() {
  const { ui, form, actions, mutations } = useNewExperimentController();

  if (ui.notInvited) {
    return (
      <PageShell title="New Experiment">
        <SectionCard>
          <PageAlerts notInvited />
        </SectionCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="New Experiment"
      subtitle="Create an experiment and finish bootstrap setup."
      actions={
        <Link className={buttonVariants({ variant: "secondary" })} href="/experiments">
          Cancel
        </Link>
      }
    >
      <SectionCard title="Experiment Details">
        <form className={"grid gap-3"} onSubmit={actions.onSubmit}>
          <label className={"grid gap-2"}>
            <span className={"text-sm text-muted-foreground"}>Name</span>
            <Input value={form.name} onChange={(event) => form.setName(event.target.value)} required />
          </label>

          <label className={"grid gap-2"}>
            <span className={"text-sm text-muted-foreground"}>Description</span>
            <Textarea value={form.description} onChange={(event) => form.setDescription(event.target.value)} />
          </label>

          <div className={"flex flex-wrap items-center gap-2"}>
            <button
              className={buttonVariants({ variant: "default" })}
              disabled={mutations.createMutation.isPending || ui.isLoadingMe}
              type="submit"
            >
              {mutations.createMutation.isPending ? "Creating..." : "Create experiment"}
            </button>
            <Link className={buttonVariants({ variant: "secondary" })} href="/experiments">
              Cancel
            </Link>
          </div>

          <PageAlerts error={ui.error || ui.queryError} offline={ui.offline || ui.queryOffline} />
        </form>
      </SectionCard>
    </PageShell>
  );
}
