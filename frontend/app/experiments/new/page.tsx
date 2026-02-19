"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

import { buttonVariants } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import PageAlerts from "@/src/components/ui/PageAlerts";
import PageShell from "@/src/components/ui/PageShell";
import SectionCard from "@/src/components/ui/SectionCard";
import { Textarea } from "@/src/components/ui/textarea";
import { api } from "@/src/lib/api";
import { normalizeUserFacingError } from "@/src/lib/error-normalization";
import { queryKeys } from "@/src/lib/queryKeys";
import { usePageQueryState } from "@/src/lib/usePageQueryState";

export default function NewExperimentPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);

  const meQuery = useQuery({
    queryKey: queryKeys.system.me(),
    queryFn: () => api.get<{ email: string; role: string; status: string }>("/api/me"),
    staleTime: 60_000,
  });

  const meState = usePageQueryState(meQuery);
  const notInvited = meState.errorKind === "forbidden";

  const createMutation = useMutation({
    mutationFn: async () =>
      api.post<{ id: string }>("/api/v1/experiments/", {
        name: name.trim(),
        description: description.trim(),
      }),
    onMutate: () => {
      setError("");
      setOffline(false);
    },
    onSuccess: (data) => {
      router.push(`/experiments/${data.id}`);
    },
    onError: (mutationError) => {
      const normalized = normalizeUserFacingError(mutationError, "Unable to create experiment.");
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to create experiment.");
    },
  });

  const queryError = useMemo(() => {
    if (notInvited) {
      return "";
    }
    if (meState.isError) {
      if (meState.errorKind === "offline") {
        return "";
      }
      return "Unable to confirm access.";
    }
    return "";
  }, [meState.errorKind, meState.isError, notInvited]);

  const queryOffline = meState.errorKind === "offline";

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void createMutation.mutateAsync();
  }

  if (notInvited) {
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
              className={buttonVariants({ variant: "default" })}
              disabled={createMutation.isPending || meState.isLoading}
              type="submit"
            >
              {createMutation.isPending ? "Creating..." : "Create experiment"}
            </button>
            <Link className={buttonVariants({ variant: "secondary" })} href="/experiments">
              Cancel
            </Link>
          </div>

          <PageAlerts error={error || queryError} offline={offline || queryOffline} />
        </form>
      </SectionCard>
    </PageShell>
  );
}
