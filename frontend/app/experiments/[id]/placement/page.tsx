"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { backendFetch, normalizeBackendError, unwrapList } from "@/lib/backend";
import { suggestTrayName } from "@/lib/id-suggestions";
import {
  fetchExperimentStatusSummary,
  type ExperimentStatusSummary,
} from "@/lib/experiment-status";
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import PageShell from "@/src/components/ui/PageShell";
import ResponsiveList from "@/src/components/ui/ResponsiveList";
import SectionCard from "@/src/components/ui/SectionCard";

import styles from "../../experiments.module.css";

type Species = { id: string; name: string; category: string };

type Slot = {
  slot_id: string;
  code: string;
  label: string;
  shelf_index: number;
  slot_index: number;
  tray_count: number;
};

type Tent = {
  tent_id: string;
  name: string;
  code: string;
  allowed_species_count: number;
  allowed_species: Species[];
  slots: Slot[];
};

type Location = {
  status: "placed" | "unplaced";
  tent: { id: string; code: string | null; name: string } | null;
  slot: { id: string; code: string; label: string; shelf_index: number; slot_index: number } | null;
  tray: { id: string; code: string; name: string; capacity: number; current_count: number } | null;
};

type TrayPlant = {
  tray_plant_id: string;
  uuid: string;
  plant_id: string;
  species_id: string;
  species_name: string;
  species_category: string;
  grade: string | null;
  status: string;
};

type Tray = {
  tray_id: string;
  name: string;
  assigned_recipe_id: string | null;
  assigned_recipe_code: string | null;
  assigned_recipe_name: string | null;
  capacity: number;
  current_count: number;
  location: Location;
  plants: TrayPlant[];
};

type UnplacedPlant = {
  uuid: string;
  plant_id: string;
  species_id: string;
  species_name: string;
  species_category: string;
  grade: string | null;
  status: string;
};

type PlacementSummary = {
  tents: { count: number; results: Tent[]; meta: Record<string, unknown> };
  trays: { count: number; results: Tray[]; meta: Record<string, unknown> };
  unplaced_plants: {
    count: number;
    results: UnplacedPlant[];
    meta: { remaining_count?: number };
  };
  unplaced_trays: {
    count: number;
    results: Array<{
      tray_id: string;
      tray_name: string;
      capacity: number;
      current_count: number;
      assigned_recipe_id: string | null;
      assigned_recipe_code: string | null;
    }>;
    meta: Record<string, unknown>;
  };
};

type Recipe = {
  id: string;
  code: string;
  name: string;
  notes: string;
};

type Diagnostics = {
  reason_counts?: Record<string, number>;
  unplaceable_plants?: Array<{
    plant_id: string;
    species_name: string;
    reason: string;
  }>;
};

const RUNNING_LOCK_MESSAGE =
  "Placement cannot be edited while the experiment is running. Stop the experiment to change placement.";

function locationLabel(location: Location): string {
  if (location.status !== "placed" || !location.slot || !location.tent) {
    return "Unplaced";
  }
  return `${location.tent.code || location.tent.name} / ${location.slot.code}`;
}

export default function PlacementPage() {
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
  const [summary, setSummary] = useState<PlacementSummary | null>(null);
  const [statusSummary, setStatusSummary] = useState<ExperimentStatusSummary | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [newTrayName, setNewTrayName] = useState("");
  const [newTraySlotId, setNewTraySlotId] = useState("");
  const [newTrayRecipeId, setNewTrayRecipeId] = useState("");
  const [newTrayCapacity, setNewTrayCapacity] = useState(1);
  const [traySelectionByPlant, setTraySelectionByPlant] = useState<Record<string, string>>({});
  const [slotSelectionByTray, setSlotSelectionByTray] = useState<Record<string, string>>({});
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);

  const placementLocked = statusSummary?.lifecycle.state === "running";

  const trayNameSuggestion = useMemo(
    () => suggestTrayName((summary?.trays.results || []).map((tray) => tray.name)),
    [summary?.trays.results],
  );

  useEffect(() => {
    if (!newTrayName.trim() && trayNameSuggestion) {
      setNewTrayName(trayNameSuggestion);
    }
  }, [newTrayName, trayNameSuggestion]);

  const allSlots = useMemo(() => {
    return (summary?.tents.results || []).flatMap((tent) =>
      tent.slots.map((slot) => ({
        id: slot.slot_id,
        label: `${tent.code || tent.name} / ${slot.code}`,
        tentId: tent.tent_id,
        allowedSpeciesIds:
          tent.allowed_species.length === 0 ? null : new Set(tent.allowed_species.map((species) => species.id)),
      })),
    );
  }, [summary?.tents.results]);

  const occupiedSlotByTray = useMemo(() => {
    const map = new Map<string, string>();
    for (const tray of summary?.trays.results || []) {
      if (tray.location.slot?.id) {
        map.set(tray.location.slot.id, tray.tray_id);
      }
    }
    return map;
  }, [summary?.trays.results]);

  const availableSlotsForNewTray = useMemo(
    () => allSlots.filter((slot) => !occupiedSlotByTray.has(slot.id)),
    [allSlots, occupiedSlotByTray],
  );

  const loadPage = useCallback(async () => {
    const [summaryResponse, statusResponse, recipesResponse] = await Promise.all([
      backendFetch(`/api/v1/experiments/${experimentId}/placement/summary`),
      fetchExperimentStatusSummary(experimentId),
      backendFetch(`/api/v1/experiments/${experimentId}/recipes`),
    ]);

    if (!summaryResponse.ok) {
      throw new Error("Unable to load placement summary.");
    }
    if (!statusResponse) {
      throw new Error("Unable to load status summary.");
    }
    if (!recipesResponse.ok) {
      throw new Error("Unable to load recipes.");
    }

    const summaryPayload = (await summaryResponse.json()) as PlacementSummary;
    const recipesPayload = (await recipesResponse.json()) as unknown;
    setSummary(summaryPayload);
    setStatusSummary(statusResponse);
    setRecipes(unwrapList<Recipe>(recipesPayload));
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
          setError("Unable to load setup status.");
          return;
        }
        if (!status.setup.is_complete) {
          router.replace(`/experiments/${experimentId}/setup`);
          return;
        }

        await loadPage();
      } catch (requestError) {
        const normalized = normalizeBackendError(requestError);
        if (normalized.kind === "offline") {
          setOffline(true);
        }
        setError("Unable to load placement page.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [experimentId, loadPage, router]);

  async function createTray() {
    if (placementLocked) {
      setError(RUNNING_LOCK_MESSAGE);
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await backendFetch(`/api/v1/experiments/${experimentId}/trays`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newTrayName.trim() || trayNameSuggestion,
          slot_id: newTraySlotId || null,
          assigned_recipe_id: newTrayRecipeId || null,
          capacity: newTrayCapacity,
        }),
      });
      const payload = (await response.json()) as { detail?: string; suggested_name?: string };
      if (!response.ok) {
        if (payload.suggested_name) {
          setNewTrayName(payload.suggested_name);
        }
        setError(payload.detail || "Unable to create tray.");
        return;
      }
      setNotice("Tray created.");
      setNewTrayName("");
      setNewTraySlotId("");
      setNewTrayRecipeId("");
      setNewTrayCapacity(1);
      await loadPage();
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to create tray.");
    } finally {
      setSaving(false);
    }
  }

  async function updateTray(tray: Tray, updates: Record<string, unknown>) {
    if (placementLocked) {
      setError(RUNNING_LOCK_MESSAGE);
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await backendFetch(`/api/v1/trays/${tray.tray_id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const payload = (await response.json()) as { detail?: string };
      if (!response.ok) {
        setError(payload.detail || "Unable to update tray.");
        return;
      }
      setNotice("Tray updated.");
      await loadPage();
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to update tray.");
    } finally {
      setSaving(false);
    }
  }

  async function addPlantToTray(plantId: string, trayId: string) {
    if (!trayId) {
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await backendFetch(`/api/v1/trays/${trayId}/plants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plant_id: plantId }),
      });
      const payload = (await response.json()) as { detail?: string };
      if (!response.ok) {
        setError(payload.detail || "Unable to place plant.");
        return;
      }
      setNotice("Plant placed.");
      await loadPage();
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to place plant.");
    } finally {
      setSaving(false);
    }
  }

  async function removePlantFromTray(trayId: string, trayPlantId: string) {
    if (placementLocked) {
      setError(RUNNING_LOCK_MESSAGE);
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await backendFetch(`/api/v1/trays/${trayId}/plants/${trayPlantId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = (await response.json()) as { detail?: string };
        setError(payload.detail || "Unable to remove plant.");
        return;
      }
      setNotice("Plant removed from tray.");
      await loadPage();
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to remove plant.");
    } finally {
      setSaving(false);
    }
  }

  async function runAutoPlace() {
    if (placementLocked) {
      setError(RUNNING_LOCK_MESSAGE);
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    setDiagnostics(null);
    try {
      const response = await backendFetch(`/api/v1/experiments/${experimentId}/placement/auto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "bin_balance_v1", clear_existing: true }),
      });
      const payload = (await response.json()) as { detail?: string; diagnostics?: Diagnostics };
      if (!response.ok) {
        setError(payload.detail || "Unable to auto-place.");
        setDiagnostics(payload.diagnostics || null);
        return;
      }
      setNotice("Auto-place complete.");
      await loadPage();
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to auto-place.");
    } finally {
      setSaving(false);
    }
  }

  const compatibleTraysByPlant = useMemo(() => {
    const map = new Map<string, Tray[]>();

    for (const plant of summary?.unplaced_plants.results || []) {
      const compatible = (summary?.trays.results || []).filter((tray) => {
        if (tray.current_count >= tray.capacity) {
          return false;
        }
        if (tray.location.status !== "placed") {
          return true;
        }
        const tent = (summary?.tents.results || []).find((item) => item.tent_id === tray.location.tent?.id);
        if (!tent || tent.allowed_species.length === 0) {
          return true;
        }
        return tent.allowed_species.some((species) => species.id === plant.species_id);
      });
      map.set(plant.uuid, compatible);
    }

    return map;
  }, [summary?.tents.results, summary?.trays.results, summary?.unplaced_plants.results]);

  if (notInvited) {
    return (
      <PageShell title="Placement">
        <SectionCard>
          <IllustrationPlaceholder inventoryId="ILL-001" kind="notInvited" />
        </SectionCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Placement"
      subtitle="Assign trays to slots and place plants into trays."
      actions={
        <Link className={styles.buttonPrimary} href={`/experiments/${experimentId}/overview`}>
          ← Overview
        </Link>
      }
    >
      {loading ? <p className={styles.mutedText}>Loading placement...</p> : null}
      {error ? <p className={styles.errorText}>{error}</p> : null}
      {notice ? <p className={styles.successText}>{notice}</p> : null}
      {offline ? <IllustrationPlaceholder inventoryId="ILL-003" kind="offline" /> : null}

      {placementLocked ? (
        <SectionCard title="Placement Locked">
          <p className={styles.inlineNote}>{RUNNING_LOCK_MESSAGE}</p>
        </SectionCard>
      ) : null}

      <SectionCard title="Create Tray">
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Tray code/name</span>
            <input className={styles.input} value={newTrayName} onChange={(event) => setNewTrayName(event.target.value)} />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Slot (optional)</span>
            <select className={styles.select} value={newTraySlotId} onChange={(event) => setNewTraySlotId(event.target.value)}>
              <option value="">Unplaced</option>
              {availableSlotsForNewTray.map((slot) => (
                <option key={slot.id} value={slot.id}>
                  {slot.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Recipe (optional)</span>
            <select className={styles.select} value={newTrayRecipeId} onChange={(event) => setNewTrayRecipeId(event.target.value)}>
              <option value="">None</option>
              {recipes.map((recipe) => (
                <option key={recipe.id} value={recipe.id}>
                  {recipe.code} · {recipe.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Capacity</span>
            <input
              className={styles.input}
              type="number"
              min={1}
              value={newTrayCapacity}
              onChange={(event) => setNewTrayCapacity(Number.parseInt(event.target.value || "1", 10))}
            />
          </label>
          <button className={styles.buttonPrimary} type="button" disabled={saving} onClick={() => void createTray()}>
            {saving ? "Saving..." : "Create tray"}
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Unplaced Plants">
        <p className={styles.mutedText}>Remaining: {summary?.unplaced_plants.meta.remaining_count ?? 0}</p>
        <ResponsiveList
          items={summary?.unplaced_plants.results || []}
          getKey={(plant) => plant.uuid}
          columns={[
            { key: "plant", label: "Plant", render: (plant) => plant.plant_id || "(pending)" },
            { key: "species", label: "Species", render: (plant) => plant.species_name },
            { key: "grade", label: "Grade", render: (plant) => plant.grade || "Missing" },
            {
              key: "tray",
              label: "Add to tray",
              render: (plant) => {
                const options = compatibleTraysByPlant.get(plant.uuid) || [];
                return (
                  <div className={styles.actions}>
                    <select
                      className={styles.select}
                      value={traySelectionByPlant[plant.uuid] || ""}
                      onChange={(event) =>
                        setTraySelectionByPlant((current) => ({ ...current, [plant.uuid]: event.target.value }))
                      }
                    >
                      <option value="">Select tray</option>
                      {options.map((tray) => (
                        <option key={tray.tray_id} value={tray.tray_id}>
                          {tray.name} ({tray.current_count}/{tray.capacity})
                        </option>
                      ))}
                    </select>
                    <button
                      className={styles.buttonSecondary}
                      type="button"
                      disabled={!traySelectionByPlant[plant.uuid]}
                      onClick={() => void addPlantToTray(plant.uuid, traySelectionByPlant[plant.uuid] || "")}
                    >
                      Add
                    </button>
                  </div>
                );
              },
            },
          ]}
          renderMobileCard={(plant) => (
            <div className={styles.cardKeyValue}>
              <span>Plant</span>
              <strong>{plant.plant_id || "(pending)"}</strong>
              <span>Species</span>
              <strong>{plant.species_name}</strong>
              <span>Grade</span>
              <strong>{plant.grade || "Missing"}</strong>
            </div>
          )}
        />
      </SectionCard>

      <SectionCard title="Trays">
        <div className={styles.blocksList}>
          {(summary?.trays.results || []).map((tray) => {
            const location = locationLabel(tray.location);
            const availableSlots = allSlots.filter((slot) => {
              const occupiedBy = occupiedSlotByTray.get(slot.id);
              return !occupiedBy || occupiedBy === tray.tray_id;
            });

            return (
              <article key={tray.tray_id} className={styles.blockRow}>
                <strong>{tray.name}</strong>
                <p className={styles.mutedText}>Location: {location}</p>
                <p className={styles.mutedText}>Occupancy: {tray.current_count}/{tray.capacity}</p>
                <div className={styles.actions}>
                  <select
                    className={styles.select}
                    value={slotSelectionByTray[tray.tray_id] ?? (tray.location.slot?.id || "")}
                    onChange={(event) =>
                      setSlotSelectionByTray((current) => ({ ...current, [tray.tray_id]: event.target.value }))
                    }
                    disabled={placementLocked}
                  >
                    <option value="">Unplaced</option>
                    {availableSlots.map((slot) => (
                      <option key={slot.id} value={slot.id}>
                        {slot.label}
                      </option>
                    ))}
                  </select>
                  <button
                    className={styles.buttonSecondary}
                    type="button"
                    disabled={placementLocked}
                    onClick={() =>
                      void updateTray(tray, {
                        slot_id: slotSelectionByTray[tray.tray_id] || null,
                      })
                    }
                  >
                    Move tray
                  </button>
                  <select
                    className={styles.select}
                    value={tray.assigned_recipe_id || ""}
                    onChange={(event) =>
                      void updateTray(tray, {
                        assigned_recipe: event.target.value || null,
                      })
                    }
                    disabled={placementLocked}
                  >
                    <option value="">No tray recipe</option>
                    {recipes.map((recipe) => (
                      <option key={recipe.id} value={recipe.id}>
                        {recipe.code} · {recipe.name}
                      </option>
                    ))}
                  </select>
                </div>
                {tray.plants.map((plant) => (
                  <div key={plant.uuid} className={styles.actions}>
                    <span className={styles.mutedText}>
                      {plant.plant_id || "(pending)"} · {plant.species_name}
                    </span>
                    <button
                      className={styles.buttonSecondary}
                      type="button"
                      disabled={placementLocked}
                      onClick={() => void removePlantFromTray(tray.tray_id, plant.tray_plant_id)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </article>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Auto-place">
        <button className={styles.buttonPrimary} type="button" disabled={saving || placementLocked} onClick={() => void runAutoPlace()}>
          {saving ? "Running..." : "Auto-place (balance by grade)"}
        </button>
        {diagnostics?.reason_counts ? (
          <div className={styles.cardKeyValue}>
            <span>Reasons</span>
            <strong>{Object.entries(diagnostics.reason_counts).map(([key, value]) => `${key}: ${value}`).join(" · ")}</strong>
            {diagnostics.unplaceable_plants?.slice(0, 10).map((plant) => (
              <span key={`${plant.plant_id}-${plant.reason}`}>{`${plant.plant_id || "(pending)"} · ${plant.species_name} · ${plant.reason}`}</span>
            ))}
          </div>
        ) : null}
      </SectionCard>
    </PageShell>
  );
}
