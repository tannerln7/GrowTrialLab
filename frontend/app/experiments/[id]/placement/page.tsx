"use client";

import * as Popover from "@radix-ui/react-popover";
import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
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
import StickyActionBar from "@/src/components/ui/StickyActionBar";

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

type RecipeSummary = {
  id: string;
  code: string;
  name: string;
};

type Recipe = RecipeSummary & {
  notes: string;
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
  assigned_recipe: RecipeSummary | null;
};

type Tray = {
  tray_id: string;
  name: string;
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
  assigned_recipe: RecipeSummary | null;
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
    }>;
    meta: Record<string, unknown>;
  };
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
const RECIPE_COLORS = ["#3f84e5", "#f27a54", "#17a37b", "#cc8d2b", "#8a6ae8", "#c1579a"];

function locationLabel(location: Location): string {
  if (location.status !== "placed" || !location.slot || !location.tent) {
    return "Unplaced";
  }
  return `${location.tent.code || location.tent.name} / ${location.slot.code}`;
}

function recipeLabel(recipe: RecipeSummary): string {
  return recipe.name ? `${recipe.code} - ${recipe.name}` : recipe.code;
}

function recipeChipLabel(recipe: RecipeSummary | null): string {
  if (!recipe) {
    return "Recipe: Unassigned";
  }
  return `Recipe: ${recipeLabel(recipe)}`;
}

function recipeColor(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return RECIPE_COLORS[hash % RECIPE_COLORS.length];
}

function summarizeTrayRecipes(tray: Tray): {
  label: string;
  tone: "mixed" | "assigned" | "unassigned";
  assignedRecipes: RecipeSummary[];
  hasUnassigned: boolean;
} {
  const assignedMap = new Map<string, RecipeSummary>();
  let hasUnassigned = false;

  for (const plant of tray.plants) {
    if (plant.assigned_recipe) {
      assignedMap.set(plant.assigned_recipe.id, plant.assigned_recipe);
    } else {
      hasUnassigned = true;
    }
  }

  const assignedRecipes = Array.from(assignedMap.values()).sort((left, right) =>
    left.code.localeCompare(right.code),
  );
  const variantCount = assignedRecipes.length + (hasUnassigned ? 1 : 0);

  if (variantCount > 1) {
    return {
      label: "Recipe mix: Mixed",
      tone: "mixed",
      assignedRecipes,
      hasUnassigned,
    };
  }

  if (assignedRecipes.length === 1) {
    return {
      label: `Recipe mix: ${recipeLabel(assignedRecipes[0])}`,
      tone: "assigned",
      assignedRecipes,
      hasUnassigned,
    };
  }

  return {
    label: "Recipe mix: Unassigned",
    tone: "unassigned",
    assignedRecipes,
    hasUnassigned,
  };
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
  const [newTrayCapacity, setNewTrayCapacity] = useState(1);
  const [traySelectionByPlant, setTraySelectionByPlant] = useState<Record<string, string>>({});
  const [slotSelectionByTray, setSlotSelectionByTray] = useState<Record<string, string>>({});
  const [draftRecipeByPlantId, setDraftRecipeByPlantId] = useState<Record<string, string | null>>({});
  const [overriddenPlantIds, setOverriddenPlantIds] = useState<Set<string>>(new Set());
  const [recipeSelectionByTray, setRecipeSelectionByTray] = useState<Record<string, string>>({});
  const [recipeSelectionByPlant, setRecipeSelectionByPlant] = useState<Record<string, string>>({});
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

  const recipeById = useMemo(() => {
    const map = new Map<string, RecipeSummary>();
    for (const recipe of recipes) {
      map.set(recipe.id, recipe);
    }
    return map;
  }, [recipes]);

  const persistedRecipeByPlantId = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const plant of summary?.unplaced_plants.results || []) {
      map[plant.uuid] = plant.assigned_recipe?.id || null;
    }
    for (const tray of summary?.trays.results || []) {
      for (const plant of tray.plants) {
        map[plant.uuid] = plant.assigned_recipe?.id || null;
      }
    }
    return map;
  }, [summary?.trays.results, summary?.unplaced_plants.results]);

  useEffect(() => {
    setDraftRecipeByPlantId(persistedRecipeByPlantId);
    setOverriddenPlantIds(new Set());
    setRecipeSelectionByTray({});
    setRecipeSelectionByPlant({});
  }, [persistedRecipeByPlantId]);

  const stagedChangeCount = useMemo(() => {
    let count = 0;
    for (const [plantId, persistedRecipeId] of Object.entries(persistedRecipeByPlantId)) {
      const draftRecipeId = draftRecipeByPlantId[plantId] ?? persistedRecipeId ?? null;
      if ((draftRecipeId || null) !== (persistedRecipeId || null)) {
        count += 1;
      }
    }
    return count;
  }, [draftRecipeByPlantId, persistedRecipeByPlantId]);

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

  function applyStagedRecipeToTray(tray: Tray, recipeId: string) {
    if (!recipeId) {
      setError("Select a recipe before applying.");
      return;
    }
    setError("");
    setNotice("");
    setDraftRecipeByPlantId((current) => {
      const next = { ...current };
      for (const plant of tray.plants) {
        if (overriddenPlantIds.has(plant.uuid)) {
          continue;
        }
        next[plant.uuid] = recipeId;
      }
      return next;
    });
  }

  function stagePlantRecipe(plantId: string, recipeId: string | null) {
    setError("");
    setNotice("");
    setDraftRecipeByPlantId((current) => ({
      ...current,
      [plantId]: recipeId,
    }));
    setOverriddenPlantIds((current) => {
      const next = new Set(current);
      next.add(plantId);
      return next;
    });
  }

  function revertStagedRecipeChanges() {
    setDraftRecipeByPlantId(persistedRecipeByPlantId);
    setOverriddenPlantIds(new Set());
    setRecipeSelectionByTray({});
    setRecipeSelectionByPlant({});
    setNotice("Staged recipe changes reverted.");
  }

  async function saveStagedRecipeChanges() {
    const updates = Object.entries(persistedRecipeByPlantId)
      .map(([plantId, persistedRecipeId]) => {
        const draftRecipeId = draftRecipeByPlantId[plantId] ?? persistedRecipeId ?? null;
        if ((draftRecipeId || null) === (persistedRecipeId || null)) {
          return null;
        }
        return {
          plant_id: plantId,
          assigned_recipe_id: draftRecipeId,
        };
      })
      .filter((item): item is { plant_id: string; assigned_recipe_id: string | null } => item !== null);

    if (updates.length === 0) {
      setNotice("No staged recipe changes to save.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await backendFetch(`/api/v1/experiments/${experimentId}/plants/recipes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const payload = (await response.json()) as { detail?: string; count?: number };
      if (!response.ok) {
        setError(payload.detail || "Unable to save recipe assignments.");
        return;
      }
      setNotice(`Saved recipe changes for ${payload.count || updates.length} plant(s).`);
      await loadPage();
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to save recipe assignments.");
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

  function draftRecipeForPlant(plant: { uuid: string; assigned_recipe: RecipeSummary | null }): RecipeSummary | null {
    const persistedRecipeId = plant.assigned_recipe?.id || null;
    const draftRecipeId = draftRecipeByPlantId[plant.uuid] ?? persistedRecipeId;
    if (!draftRecipeId) {
      return null;
    }
    return recipeById.get(draftRecipeId) || null;
  }

  function isPlantRecipeStaged(plant: { uuid: string; assigned_recipe: RecipeSummary | null }): boolean {
    const persistedRecipeId = plant.assigned_recipe?.id || null;
    const draftRecipeId = draftRecipeByPlantId[plant.uuid] ?? persistedRecipeId;
    return (draftRecipeId || null) !== (persistedRecipeId || null);
  }

  function renderRecipeSelect(
    value: string | undefined,
    onValueChange: (next: string) => void,
    placeholder: string,
  ) {
    return (
      <Select.Root value={value} onValueChange={onValueChange}>
        <Select.Trigger className={styles.recipeSelectTrigger} aria-label={placeholder}>
          <Select.Value placeholder={placeholder} />
          <Select.Icon>
            <ChevronDown size={14} />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content className={styles.recipeSelectContent} position="popper" sideOffset={6}>
            <Select.Viewport className={styles.recipeSelectViewport}>
              {recipes.map((recipe) => (
                <Select.Item key={recipe.id} value={recipe.id} className={styles.recipeSelectItem}>
                  <Select.ItemText>{recipeLabel(recipe)}</Select.ItemText>
                  <Select.ItemIndicator className={styles.recipeSelectIndicator}>
                    <Check size={14} />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    );
  }

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
      subtitle="Assign trays to slots, place plants into trays, and set recipes per plant."
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
              key: "recipe",
              label: "Recipe",
              render: (plant) => {
                const draftRecipe = draftRecipeForPlant(plant);
                const staged = isPlantRecipeStaged(plant);
                return (
                  <div className={styles.actions}>
                    <span className={draftRecipe ? styles.recipeChipAssigned : styles.recipeChipUnassigned}>
                      {recipeChipLabel(draftRecipe)}
                    </span>
                    {staged ? <span className={styles.recipeLegendItem}>Staged</span> : null}
                  </div>
                );
              },
            },
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
              <span>Recipe</span>
              <strong>
                <span
                  className={draftRecipeForPlant(plant) ? styles.recipeChipAssigned : styles.recipeChipUnassigned}
                >
                  {recipeChipLabel(draftRecipeForPlant(plant))}
                </span>
              </strong>
              {isPlantRecipeStaged(plant) ? <span className={styles.recipeLegendItem}>Staged</span> : null}
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
            const draftTray = {
              ...tray,
              plants: tray.plants.map((plant) => ({
                ...plant,
                assigned_recipe: draftRecipeForPlant(plant),
              })),
            };
            const trayRecipeState = summarizeTrayRecipes(draftTray);
            const trayRecipeSelection =
              recipeSelectionByTray[tray.tray_id] || trayRecipeState.assignedRecipes[0]?.id || "";

            return (
              <article key={tray.tray_id} className={styles.blockRow}>
                <div className={styles.actions}>
                  <strong>{tray.name}</strong>
                  <span
                    className={
                      trayRecipeState.tone === "assigned"
                        ? styles.recipeChipAssigned
                        : trayRecipeState.tone === "mixed"
                          ? styles.recipeChipMixed
                          : styles.recipeChipUnassigned
                    }
                  >
                    {trayRecipeState.label}
                  </span>
                </div>
                <p className={styles.mutedText}>Location: {location}</p>
                <p className={styles.mutedText}>Occupancy: {tray.current_count}/{tray.capacity}</p>
                {trayRecipeState.assignedRecipes.length > 0 || trayRecipeState.hasUnassigned ? (
                  <div className={styles.recipeLegendRow}>
                    {trayRecipeState.assignedRecipes.map((recipe) => (
                      <span key={recipe.id} className={styles.recipeLegendItem}>
                        <span className={styles.recipeDot} style={{ backgroundColor: recipeColor(recipe.id) }} />
                        {recipe.code}
                      </span>
                    ))}
                    {trayRecipeState.hasUnassigned ? (
                      <span className={styles.recipeLegendItem}>Unassigned</span>
                    ) : null}
                  </div>
                ) : null}
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
                  <Popover.Root>
                    <Popover.Trigger asChild>
                      <button className={styles.buttonSecondary} type="button" disabled={saving || recipes.length === 0}>
                        Set recipe for all plants in this tray (staged)
                      </button>
                    </Popover.Trigger>
                    <Popover.Portal>
                      <Popover.Content className={styles.recipePopover} sideOffset={8} align="start">
                        <p className={styles.fieldLabel}>Apply staged recipe to plants in this tray</p>
                        {recipes.length > 0 ? (
                          renderRecipeSelect(
                            trayRecipeSelection || undefined,
                            (next) =>
                              setRecipeSelectionByTray((current) => ({
                                ...current,
                                [tray.tray_id]: next,
                              })),
                            "Select recipe",
                          )
                        ) : (
                          <p className={styles.mutedText}>No recipes available yet.</p>
                        )}
                        <button
                          className={styles.buttonPrimary}
                          type="button"
                          disabled={!trayRecipeSelection || saving || recipes.length === 0}
                          onClick={() => applyStagedRecipeToTray(tray, trayRecipeSelection)}
                        >
                          Stage
                        </button>
                      </Popover.Content>
                    </Popover.Portal>
                  </Popover.Root>
                </div>
                {tray.plants.map((plant) => {
                  const draftRecipe = draftRecipeForPlant(plant);
                  const persistedRecipeId = plant.assigned_recipe?.id || "";
                  const draftRecipeId = draftRecipe?.id || "";
                  const selectedPlantRecipeId =
                    recipeSelectionByPlant[plant.uuid] ?? draftRecipeId;
                  const isStaged = draftRecipeId !== persistedRecipeId;
                  const isOverridden = overriddenPlantIds.has(plant.uuid);
                  return (
                    <div key={plant.uuid} className={styles.trayPlantRow}>
                      <Popover.Root>
                        <Popover.Trigger asChild>
                          <button className={styles.buttonSecondary} type="button">
                            {plant.plant_id || "(pending)"} · {plant.species_name}
                          </button>
                        </Popover.Trigger>
                        <Popover.Portal>
                          <Popover.Content className={styles.recipePopover} sideOffset={8} align="start">
                            <p className={styles.fieldLabel}>Set recipe for this plant</p>
                            {recipes.length > 0 ? (
                              renderRecipeSelect(
                                selectedPlantRecipeId || undefined,
                                (next) =>
                                  setRecipeSelectionByPlant((current) => ({
                                    ...current,
                                    [plant.uuid]: next,
                                  })),
                                "Select recipe",
                              )
                            ) : (
                              <p className={styles.mutedText}>No recipes available yet.</p>
                            )}
                            <div className={styles.actions}>
                              <button
                                className={styles.buttonPrimary}
                                type="button"
                                disabled={
                                  recipes.length === 0 ||
                                  !selectedPlantRecipeId ||
                                  selectedPlantRecipeId === draftRecipeId
                                }
                                onClick={() =>
                                  stagePlantRecipe(
                                    plant.uuid,
                                    selectedPlantRecipeId || null,
                                  )
                                }
                              >
                                Stage
                              </button>
                              <button
                                className={styles.buttonSecondary}
                                type="button"
                                disabled={!draftRecipeId}
                                onClick={() => stagePlantRecipe(plant.uuid, null)}
                              >
                                Stage clear
                              </button>
                            </div>
                          </Popover.Content>
                        </Popover.Portal>
                      </Popover.Root>
                      <span className={draftRecipe ? styles.recipeChipAssigned : styles.recipeChipUnassigned}>
                        {recipeChipLabel(draftRecipe)}
                      </span>
                      {isStaged ? <span className={styles.recipeLegendItem}>Staged</span> : null}
                      {isOverridden ? <span className={styles.recipeLegendItem}>Override</span> : null}
                      <button
                        className={styles.buttonSecondary}
                        type="button"
                        disabled={placementLocked}
                        onClick={() => void removePlantFromTray(tray.tray_id, plant.tray_plant_id)}
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
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

      <StickyActionBar>
        <span className={styles.recipeLegendItem}>{stagedChangeCount} plants changed</span>
        <button
          className={styles.buttonPrimary}
          type="button"
          disabled={saving || stagedChangeCount === 0}
          onClick={() => void saveStagedRecipeChanges()}
        >
          {saving ? "Saving..." : "Save recipe changes"}
        </button>
        <button
          className={styles.buttonSecondary}
          type="button"
          disabled={saving || stagedChangeCount === 0}
          onClick={revertStagedRecipeChanges}
        >
          Revert staged changes
        </button>
      </StickyActionBar>
    </PageShell>
  );
}
