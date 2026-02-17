"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { backendFetch, normalizeBackendError, unwrapList } from "@/lib/backend";
import { cn } from "@/lib/utils";
import {
  fetchExperimentStatusSummary,
  type ExperimentStatusSummary,
} from "@/lib/experiment-status";
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import { Badge } from "@/src/components/ui/badge";
import { buttonVariants } from "@/src/components/ui/button";
import { experimentsStyles as styles } from "@/src/components/ui/experiments-styles";
import PageShell from "@/src/components/ui/PageShell";
import ResponsiveList from "@/src/components/ui/ResponsiveList";
import SectionCard from "@/src/components/ui/SectionCard";
import { Textarea } from "@/src/components/ui/textarea";


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

export default function RotationPage() {
  const params = useParams();
  const router = useRouter();
  const experimentId = useMemo(() => {
    if (typeof params.id === "string") {
      return params.id;
    }
    if (Array.isArray(params.id)) {
      return params.id[0] ?? "";
    }
    return "";
  }, [params]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notInvited, setNotInvited] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [statusSummary, setStatusSummary] = useState<ExperimentStatusSummary | null>(null);
  const [summary, setSummary] = useState<RotationSummary | null>(null);
  const [slotOptions, setSlotOptions] = useState<SlotOption[]>([]);
  const [traySpeciesById, setTraySpeciesById] = useState<Record<string, string[]>>({});
  const [selectedTrayId, setSelectedTrayId] = useState("");
  const [selectedToSlotId, setSelectedToSlotId] = useState("");
  const [note, setNote] = useState("");

  const running = statusSummary?.lifecycle.state === "running";

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

  const loadSummary = useCallback(async () => {
    const [statusResponse, rotationResponse, placementResponse] = await Promise.all([
      fetchExperimentStatusSummary(experimentId),
      backendFetch(`/api/v1/experiments/${experimentId}/rotation/summary`),
      backendFetch(`/api/v1/experiments/${experimentId}/placement/summary`),
    ]);
    if (!statusResponse) {
      throw new Error("Unable to load experiment status.");
    }
    if (!rotationResponse.ok) {
      throw new Error("Unable to load rotation summary.");
    }
    if (!placementResponse.ok) {
      throw new Error("Unable to load placement summary.");
    }

    const rotationPayload = (await rotationResponse.json()) as RotationSummary;
    const placementPayload = (await placementResponse.json()) as PlacementSummary;

    const tents = unwrapList<Tent>(placementPayload.tents);
    const trays = unwrapList<PlacementTray>(placementPayload.trays);

    setStatusSummary(statusResponse);
    setSummary(rotationPayload);

    const nextTraySpeciesById: Record<string, string[]> = {};
    for (const tray of trays) {
      nextTraySpeciesById[tray.tray_id] = Array.from(new Set(tray.plants.map((plant) => plant.species_id)));
    }
    setTraySpeciesById(nextTraySpeciesById);

    const nextSlots = tents.flatMap((tent) =>
      tent.slots.map((slot) => ({
        id: slot.slot_id,
        label: `${tent.code || tent.name} / ${slot.code}`,
        allowedSpeciesIds:
          tent.allowed_species.length === 0 ? null : new Set(tent.allowed_species.map((species) => species.id)),
      })),
    );
    setSlotOptions(nextSlots);
  }, [experimentId]);

  useEffect(() => {
    async function load() {
      if (!experimentId) {
        return;
      }
      setLoading(true);
      setError("");
      setOffline(false);
      try {
        const meResponse = await backendFetch("/api/me");
        if (meResponse.status === 403) {
          setNotInvited(true);
          return;
        }

        const status = await fetchExperimentStatusSummary(experimentId);
        if (!status) {
          setError("Unable to load experiment status.");
          return;
        }
        if (!status.setup.is_complete) {
          router.replace(`/experiments/${experimentId}/setup`);
          return;
        }

        await loadSummary();
      } catch (requestError) {
        const normalized = normalizeBackendError(requestError);
        if (normalized.kind === "offline") {
          setOffline(true);
        }
        setError("Unable to load rotation page.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [experimentId, loadSummary, router]);

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

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await backendFetch(`/api/v1/experiments/${experimentId}/rotation/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tray_id: selectedTrayId,
          to_slot_id: selectedToSlotId || null,
          note: note.trim() || undefined,
        }),
      });
      const payload = (await response.json()) as { detail?: string };
      if (!response.ok) {
        setError(payload.detail || "Unable to log move.");
        return;
      }

      setNotice("Move logged.");
      setNote("");
      await loadSummary();
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to log move.");
    } finally {
      setSaving(false);
    }
  }

  if (notInvited) {
    return (
      <PageShell title="Rotation">
        <SectionCard>
          <IllustrationPlaceholder inventoryId="ILL-001" kind="notInvited" />
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
        <Link className={cn(buttonVariants({ variant: "default" }), "border border-border")} href={`/experiments/${experimentId}/overview`}>
          ← Overview
        </Link>
      }
    >
      {loading ? <p className={"text-sm text-muted-foreground"}>Loading rotation...</p> : null}
      {error ? <p className={"text-sm text-destructive"}>{error}</p> : null}
      {notice ? <p className={"text-sm text-emerald-400"}>{notice}</p> : null}
      {offline ? <IllustrationPlaceholder inventoryId="ILL-003" kind="offline" /> : null}

      {statusSummary ? (
        <SectionCard title="Experiment State">
          <Badge variant="secondary">{statusSummary.lifecycle.state.toUpperCase()}</Badge>
        </SectionCard>
      ) : null}

      {!running ? (
        <SectionCard title="Rotation Requires Running State">
          <p className={"text-sm text-muted-foreground"}>
            Rotation logs are intended for running experiments. Start the experiment first.
          </p>
          <Link className={cn(buttonVariants({ variant: "default" }), "border border-border")} href={`/experiments/${experimentId}/overview`}>
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
                <select className={styles.nativeSelect} value={selectedTrayId} onChange={(event) => setSelectedTrayId(event.target.value)}>
                  <option value="">Select tray</option>
                  {trays.map((tray) => (
                    <option key={tray.tray_id} value={tray.tray_id}>
                      {tray.tray_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={"grid gap-2"}>
                <span className={"text-sm text-muted-foreground"}>Destination slot</span>
                <select className={styles.nativeSelect} value={selectedToSlotId} onChange={(event) => setSelectedToSlotId(event.target.value)}>
                  <option value="">None / Unassigned</option>
                  {compatibleSlotsForSelectedTray.map((slot) => (
                    <option key={slot.id} value={slot.id}>
                      {slot.label}
                    </option>
                  ))}
                </select>
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
                className={cn(buttonVariants({ variant: "default" }), "border border-border")}
                type="button"
                disabled={saving || !selectedTrayId || selectedTrayBlocked}
                onClick={() => void submitLogMove()}
              >
                {saving ? "Logging..." : "Log move"}
              </button>
            </div>
          </SectionCard>

          <SectionCard title="Current Tray Locations">
            <p className={"text-sm text-muted-foreground"}>Unplaced trays: {summary.unplaced_trays_count}</p>
            <ResponsiveList
              items={trays}
              getKey={(tray) => tray.tray_id}
              columns={[
                { key: "tray", label: "Tray", render: (tray) => tray.tray_name },
                {
                  key: "slot",
                  label: "Current Slot",
                  render: (tray) => locationLabel(tray.location),
                },
                { key: "count", label: "Plants", render: (tray) => tray.plant_count },
                {
                  key: "move",
                  label: "Action",
                  render: (tray) => (
                    <button
                      className={cn(buttonVariants({ variant: "secondary" }), "border border-border")}
                      type="button"
                      onClick={() => {
                        setSelectedTrayId(tray.tray_id);
                        setSelectedToSlotId("");
                      }}
                    >
                      Move
                    </button>
                  ),
                },
              ]}
              renderMobileCard={(tray) => (
                <div className={"grid gap-2"}>
                  <span>Tray</span>
                  <strong>{tray.tray_name}</strong>
                  <span>Current slot</span>
                  <strong>{locationLabel(tray.location)}</strong>
                  <span>Plants</span>
                  <strong>{tray.plant_count}</strong>
                  <button
                    className={cn(buttonVariants({ variant: "secondary" }), "border border-border")}
                    type="button"
                    onClick={() => {
                      setSelectedTrayId(tray.tray_id);
                      setSelectedToSlotId("");
                    }}
                  >
                    Move
                  </button>
                </div>
              )}
            />
          </SectionCard>

          <SectionCard title="Recent Moves">
            <ResponsiveList
              items={recentLogs}
              getKey={(log) => log.id}
              columns={[
                { key: "tray", label: "Tray", render: (log) => log.tray_name },
                {
                  key: "from_to",
                  label: "Move",
                  render: (log) => `${log.from_slot?.label || "Unassigned"} -> ${log.to_slot?.label || "Unassigned"}`,
                },
                { key: "time", label: "Time", render: (log) => formatDateTime(log.occurred_at) },
                { key: "note", label: "Note", render: (log) => log.note || "-" },
              ]}
              renderMobileCard={(log) => (
                <div className={"grid gap-2"}>
                  <span>Tray</span>
                  <strong>{log.tray_name}</strong>
                  <span>Move</span>
                  <strong>
                    {log.from_slot?.label || "Unassigned"}
                    {" -> "}
                    {log.to_slot?.label || "Unassigned"}
                  </strong>
                  <span>Time</span>
                  <strong>{formatDateTime(log.occurred_at)}</strong>
                  <span>Note</span>
                  <strong>{log.note || "-"}</strong>
                </div>
              )}
              emptyState={<p className={"text-sm text-muted-foreground"}>No moves logged yet.</p>}
            />
          </SectionCard>
        </>
      ) : null}
    </PageShell>
  );
}
