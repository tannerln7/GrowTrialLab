"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import type { ExperimentStatusSummary } from "@/lib/experiment-status";
import { unwrapList } from "@/lib/backend";
import { Badge } from "@/src/components/ui/badge";
import { buttonVariants } from "@/src/components/ui/button";
import { NativeSelect } from "@/src/components/ui/native-select";
import PageAlerts from "@/src/components/ui/PageAlerts";
import PageShell from "@/src/components/ui/PageShell";
import ResponsiveList from "@/src/components/ui/ResponsiveList";
import SectionCard from "@/src/components/ui/SectionCard";
import { Textarea } from "@/src/components/ui/textarea";
import { api } from "@/src/lib/api";
import { normalizeUserFacingError } from "@/src/lib/error-normalization";
import { queryKeys } from "@/src/lib/queryKeys";
import { usePageQueryState } from "@/src/lib/usePageQueryState";

type Location = {
  status: "placed" | "unplaced";
  tent: { id: string; code: string | null; name: string } | null;
  slot: {
    id: string;
    code: string;
    label: string;
    shelf_index: number;
    slot_index: number;
  } | null;
  tray: {
    id: string;
    code: string;
    name: string;
    capacity: number;
    current_count: number;
  } | null;
};

type RotationTray = {
  tray_id: string;
  tray_name: string;
  location: Location;
  plant_count: number;
};

type RotationLog = {
  id: string;
  tray_name: string;
  from_slot: { id: string; code: string; label: string; tent_name: string } | null;
  to_slot: { id: string; code: string; label: string; tent_name: string } | null;
  occurred_at: string;
  note: string;
};

type RotationSummary = {
  trays: { count: number; results: RotationTray[]; meta: Record<string, unknown> };
  recent_logs: { count: number; results: RotationLog[]; meta: Record<string, unknown> };
  unplaced_trays_count: number;
};

type Species = { id: string; name: string; category: string };
type Tent = {
  tent_id: string;
  name: string;
  code: string;
  allowed_species: Species[];
  slots: Array<{
    slot_id: string;
    code: string;
    label: string;
    shelf_index: number;
    slot_index: number;
  }>;
};

type PlacementTray = {
  tray_id: string;
  plants: Array<{
    species_id: string;
    species_name: string;
    species_category: string;
  }>;
};

type PlacementSummary = {
  tents: { count: number; results: Tent[]; meta: Record<string, unknown> };
  trays: { count: number; results: PlacementTray[]; meta: Record<string, unknown> };
};

type SlotOption = {
  id: string;
  label: string;
  allowedSpeciesIds: Set<string> | null;
};

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function locationLabel(location: Location): string {
  if (location.status !== "placed" || !location.slot || !location.tent) {
    return "Unplaced";
  }
  return `${location.tent.code || location.tent.name} / ${location.slot.code}`;
}

type ExperimentRotationPageClientProps = {
  experimentId: string;
};

export function ExperimentRotationPageClient({ experimentId }: ExperimentRotationPageClientProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mutationOffline, setMutationOffline] = useState(false);
  const [selectedTrayId, setSelectedTrayId] = useState("");
  const [selectedToSlotId, setSelectedToSlotId] = useState("");
  const [note, setNote] = useState("");

  const statusQuery = useQuery({
    queryKey: queryKeys.experiment.status(experimentId),
    queryFn: () =>
      api.get<ExperimentStatusSummary>(
        `/api/v1/experiments/${experimentId}/status/summary`,
      ),
    enabled: Boolean(experimentId),
  });

  const rotationQueryKey = queryKeys.experiment.feature(experimentId, "rotationSummary");
  const placementQueryKey = queryKeys.experiment.feature(experimentId, "placementSummary");

  const rotationQuery = useQuery({
    queryKey: rotationQueryKey,
    queryFn: () => api.get<RotationSummary>(`/api/v1/experiments/${experimentId}/rotation/summary`),
    enabled: Boolean(experimentId) && Boolean(statusQuery.data?.setup.is_complete),
  });

  const placementQuery = useQuery({
    queryKey: placementQueryKey,
    queryFn: () => api.get<PlacementSummary>(`/api/v1/experiments/${experimentId}/placement/summary`),
    enabled: Boolean(experimentId) && Boolean(statusQuery.data?.setup.is_complete),
  });

  const statusState = usePageQueryState(statusQuery);
  const rotationState = usePageQueryState(rotationQuery);
  const placementState = usePageQueryState(placementQuery);

  useEffect(() => {
    if (!experimentId || !statusQuery.data) {
      return;
    }
    if (!statusQuery.data.setup.is_complete) {
      router.replace(`/experiments/${experimentId}/setup`);
    }
  }, [experimentId, router, statusQuery.data]);

  const summary = rotationQuery.data ?? null;
  const placementSummary = placementQuery.data ?? null;

  const slotOptions = useMemo(() => {
    if (!placementSummary) {
      return [] as SlotOption[];
    }
    const tents = unwrapList<Tent>(placementSummary.tents);
    return tents.flatMap((tent) =>
      tent.slots.map((slot) => ({
        id: slot.slot_id,
        label: `${tent.code || tent.name} / ${slot.code}`,
        allowedSpeciesIds:
          tent.allowed_species.length === 0 ? null : new Set(tent.allowed_species.map((species) => species.id)),
      })),
    );
  }, [placementSummary]);

  const traySpeciesById = useMemo(() => {
    if (!placementSummary) {
      return {} as Record<string, string[]>;
    }
    const trays = unwrapList<PlacementTray>(placementSummary.trays);
    const next: Record<string, string[]> = {};
    for (const tray of trays) {
      next[tray.tray_id] = Array.from(new Set(tray.plants.map((plant) => plant.species_id)));
    }
    return next;
  }, [placementSummary]);

  const running = statusQuery.data?.lifecycle.state === "running";

  const compatibleSlotsForSelectedTray = useMemo(() => {
    if (!selectedTrayId) {
      return slotOptions;
    }
    const speciesIds = traySpeciesById[selectedTrayId] || [];
    if (speciesIds.length === 0) {
      return slotOptions;
    }
    return slotOptions.filter((slot) => {
      if (slot.allowedSpeciesIds === null) {
        return true;
      }
      return speciesIds.every((speciesId) => slot.allowedSpeciesIds?.has(speciesId));
    });
  }, [selectedTrayId, slotOptions, traySpeciesById]);

  const selectedTrayBlocked = selectedTrayId !== "" && compatibleSlotsForSelectedTray.length === 0;

  const logMutation = useMutation({
    mutationFn: () =>
      api.post<{ detail?: string }>(`/api/v1/experiments/${experimentId}/rotation/log`, {
        tray_id: selectedTrayId,
        to_slot_id: selectedToSlotId || null,
        note: note.trim() || undefined,
      }),
    onMutate: () => {
      setError("");
      setNotice("");
      setMutationOffline(false);
    },
    onSuccess: async () => {
      setNotice("Move logged.");
      setNote("");
      await queryClient.invalidateQueries({ queryKey: rotationQueryKey });
    },
    onError: (mutationError) => {
      const normalized = normalizeUserFacingError(mutationError, "Unable to log move.");
      if (normalized.kind === "offline") {
        setMutationOffline(true);
      }
      setError("Unable to log move.");
    },
  });

  async function submitLogMove() {
    if (!selectedTrayId) {
      setError("Select a tray first.");
      return;
    }
    if (selectedToSlotId && !compatibleSlotsForSelectedTray.some((slot) => slot.id === selectedToSlotId)) {
      setError("Selected destination slot is not compatible with this tray's plants.");
      return;
    }
    if (selectedTrayBlocked) {
      setError("No compatible destination slots for this tray.");
      return;
    }

    await logMutation.mutateAsync().catch(() => null);
  }

  const loading =
    statusState.isLoading ||
    (Boolean(statusQuery.data?.setup.is_complete) && (rotationState.isLoading || placementState.isLoading));
  const notInvited = statusState.errorKind === "forbidden";
  const offline =
    mutationOffline ||
    statusState.errorKind === "offline" ||
    rotationState.errorKind === "offline" ||
    placementState.errorKind === "offline";
  const queryError = useMemo(() => {
    if (notInvited) {
      return "";
    }
    if (statusState.isError && statusState.errorKind !== "offline") {
      return "Unable to load rotation page.";
    }
    if ((rotationState.isError || placementState.isError) && !offline) {
      return "Unable to load rotation page.";
    }
    return "";
  }, [notInvited, offline, placementState.isError, rotationState.isError, statusState.errorKind, statusState.isError]);

  if (notInvited) {
    return (
      <PageShell title="Rotation">
        <SectionCard>
          <PageAlerts notInvited />
        </SectionCard>
      </PageShell>
    );
  }

  const trays = summary ? unwrapList<RotationTray>(summary.trays) : [];
  const recentLogs = summary ? unwrapList<RotationLog>(summary.recent_logs) : [];

  return (
    <PageShell
      title="Rotation"
      subtitle="Log tray moves and review recent rotation history."
      actions={
        <Link className={buttonVariants({ variant: "default" })} href={`/experiments/${experimentId}/overview`}>
          ← Overview
        </Link>
      }
    >
      <PageAlerts
        loading={loading}
        loadingText="Loading rotation..."
        error={error || queryError}
        notice={notice}
        offline={offline}
      />

      {statusQuery.data ? (
        <SectionCard title="Experiment State">
          <Badge variant="secondary">{statusQuery.data.lifecycle.state.toUpperCase()}</Badge>
        </SectionCard>
      ) : null}

      {!running ? (
        <SectionCard title="Rotation Requires Running State">
          <p className={"text-sm text-muted-foreground"}>
            Rotation logs are intended for running experiments. Start the experiment first.
          </p>
          <Link className={buttonVariants({ variant: "default" })} href={`/experiments/${experimentId}/overview`}>
            Start experiment from Overview
          </Link>
        </SectionCard>
      ) : null}

      {running && summary ? (
        <>
          <SectionCard title="Log a Move">
            <div className={"grid gap-3"}>
              <label className={"grid gap-2"}>
                <span className={"text-sm text-muted-foreground"}>Tray</span>
                <NativeSelect value={selectedTrayId} onChange={(event) => setSelectedTrayId(event.target.value)}>
                  <option value="">Select tray</option>
                  {trays.map((tray) => (
                    <option key={tray.tray_id} value={tray.tray_id}>
                      {tray.tray_name}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <label className={"grid gap-2"}>
                <span className={"text-sm text-muted-foreground"}>Destination slot</span>
                <NativeSelect value={selectedToSlotId} onChange={(event) => setSelectedToSlotId(event.target.value)}>
                  <option value="">None / Unassigned</option>
                  {compatibleSlotsForSelectedTray.map((slot) => (
                    <option key={slot.id} value={slot.id}>
                      {slot.label}
                    </option>
                  ))}
                </NativeSelect>
                {selectedTrayBlocked ? (
                  <p className={"text-sm text-muted-foreground"}>
                    No compatible destination slots for this tray. This tray contains plants not allowed in restricted tents.
                    <Link href={`/experiments/${experimentId}/placement?step=1`}> Adjust tent restrictions</Link>.
                  </p>
                ) : null}
              </label>
              <label className={"grid gap-2"}>
                <span className={"text-sm text-muted-foreground"}>Note (optional)</span>
                <Textarea value={note} onChange={(event) => setNote(event.target.value)} />
              </label>
              <button
                className={buttonVariants({ variant: "default" })}
                type="button"
                disabled={logMutation.isPending || selectedTrayBlocked}
                onClick={() => void submitLogMove()}
              >
                {logMutation.isPending ? "Saving..." : "Log move"}
              </button>
            </div>
          </SectionCard>

          <SectionCard title="Trays">
            <ResponsiveList
              items={trays}
              getKey={(tray) => tray.tray_id}
              columns={[
                {
                  key: "tray",
                  label: "Tray",
                  render: (tray) => tray.tray_name,
                },
                {
                  key: "location",
                  label: "Location",
                  render: (tray) => locationLabel(tray.location),
                },
                {
                  key: "plants",
                  label: "Plants",
                  render: (tray) => tray.plant_count,
                },
              ]}
              renderMobileCard={(tray) => (
                <div className={"grid gap-2"}>
                  <span>Tray</span>
                  <strong>{tray.tray_name}</strong>
                  <span>Location</span>
                  <strong>{locationLabel(tray.location)}</strong>
                  <span>Plants</span>
                  <strong>{tray.plant_count}</strong>
                </div>
              )}
            />
          </SectionCard>

          <SectionCard title="Recent Logs">
            <ResponsiveList
              items={recentLogs}
              getKey={(item) => item.id}
              columns={[
                {
                  key: "tray",
                  label: "Tray",
                  render: (item) => item.tray_name,
                },
                {
                  key: "from",
                  label: "From",
                  render: (item) => item.from_slot ? `${item.from_slot.tent_name} / ${item.from_slot.code}` : "Unplaced",
                },
                {
                  key: "to",
                  label: "To",
                  render: (item) => item.to_slot ? `${item.to_slot.tent_name} / ${item.to_slot.code}` : "Unplaced",
                },
                {
                  key: "when",
                  label: "When",
                  render: (item) => formatDateTime(item.occurred_at),
                },
              ]}
              renderMobileCard={(item) => (
                <div className={"grid gap-2"}>
                  <span>Tray</span>
                  <strong>{item.tray_name}</strong>
                  <span>From</span>
                  <strong>{item.from_slot ? `${item.from_slot.tent_name} / ${item.from_slot.code}` : "Unplaced"}</strong>
                  <span>To</span>
                  <strong>{item.to_slot ? `${item.to_slot.tent_name} / ${item.to_slot.code}` : "Unplaced"}</strong>
                  <span>When</span>
                  <strong>{formatDateTime(item.occurred_at)}</strong>
                  {item.note ? (
                    <>
                      <span>Note</span>
                      <strong>{item.note}</strong>
                    </>
                  ) : null}
                </div>
              )}
            />
          </SectionCard>
        </>
      ) : null}
    </PageShell>
  );
}
