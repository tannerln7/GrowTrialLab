"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, CheckSquare, Layers, Save, Trash2, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { unwrapList } from "@/lib/backend";
import { cn } from "@/lib/utils";
import { api, isApiError } from "@/src/lib/api";
import { buttonVariants } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { NativeSelect } from "@/src/components/ui/native-select";
import PageAlerts from "@/src/components/ui/PageAlerts";
import PageShell from "@/src/components/ui/PageShell";
import SectionCard from "@/src/components/ui/SectionCard";
import StickyActionBar from "@/src/components/ui/StickyActionBar";
import { TooltipIconButton } from "@/src/components/ui/tooltip-icon-button";
import { normalizeUserFacingError } from "@/src/lib/error-normalization";
import { queryKeys } from "@/src/lib/queryKeys";
import { usePageQueryState } from "@/src/lib/usePageQueryState";

import { experimentsStyles as styles } from "@/src/components/ui/experiments-styles";

type Recipe = {
  id: string;
  code: string;
  name: string;
  notes: string;
};

type RecipeSummary = {
  id: string;
  code: string;
  name: string;
};

type PlantCell = {
  uuid: string;
  plant_id: string;
  species_id: string;
  species_name: string;
  species_category: string;
  grade: string | null;
  status: string;
  assigned_recipe: RecipeSummary | null;
};

type TraySummary = {
  tray_id: string;
  name: string;
  capacity: number;
  current_count: number;
  plants: PlantCell[];
};

type PlacementSummary = {
  trays: {
    count: number;
    results: TraySummary[];
    meta: Record<string, unknown>;
  };
  unplaced_plants: {
    count: number;
    results: PlantCell[];
    meta: { remaining_count?: number };
  };
};

type Diagnostics = {
  reason_counts?: Record<string, number>;
  invalid_updates?: Array<{ plant_id: string; reason: string }>;
};

function isActivePlant(status: string): boolean {
  return status.toLowerCase() === "active";
}

function sortPlantsById(left: PlantCell, right: PlantCell): number {
  const leftCode = left.plant_id || "";
  const rightCode = right.plant_id || "";
  if (leftCode !== rightCode) {
    return leftCode.localeCompare(rightCode);
  }
  return left.uuid.localeCompare(right.uuid);
}

function recipeLabel(recipe: RecipeSummary | Recipe): string {
  return recipe.name ? `${recipe.code} - ${recipe.name}` : recipe.code;
}

function formatTrayDisplay(rawValue: string | null | undefined, fallbackValue?: string): string {
  const raw = (rawValue || "").trim() || (fallbackValue || "").trim();
  if (!raw) {
    return "";
  }
  const match = raw.match(/^(?:tray|tr|t)?[\s_-]*0*([0-9]+)$/i);
  if (!match) {
    return raw;
  }
  const trayNumber = Number.parseInt(match[1], 10);
  if (!Number.isFinite(trayNumber)) {
    return raw;
  }
  return `Tray ${trayNumber}`;
}

function TrayHeaderToggle({
  onClick,
  allSelected,
  label,
  icon: Icon,
}: {
  onClick: () => void;
  allSelected: boolean;
  label: string;
  icon: LucideIcon;
}) {
  return (
    <button className={styles.trayHeaderSelect} type="button" onClick={onClick}>
      <Icon size={14} />
      {allSelected ? "Deselect" : "Select"} {label}
    </button>
  );
}

type ExperimentRecipesPageClientProps = {
  experimentId: string;
};

export function ExperimentRecipesPageClient({ experimentId }: ExperimentRecipesPageClientProps) {
  const queryClient = useQueryClient();

  const [saving, setSaving] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);

  const [code, setCode] = useState("R0");
  const [name, setName] = useState("Control");
  const [notes, setNotes] = useState("");

  const [selectedRecipeIds, setSelectedRecipeIds] = useState<Set<string>>(new Set());
  const [selectedPlantIds, setSelectedPlantIds] = useState<Set<string>>(new Set());
  const [activePlantAnchorId, setActivePlantAnchorId] = useState<string | null>(null);
  const [selectedBulkRecipeId, setSelectedBulkRecipeId] = useState("");

  const [persistedRecipeByPlantId, setPersistedRecipeByPlantId] = useState<Record<string, string | null>>({});
  const [draftPlantRecipe, setDraftPlantRecipe] = useState<Record<string, string | null>>({});

  const recipesQueryKey = queryKeys.experiment.feature(experimentId, "recipes");
  const placementQueryKey = queryKeys.experiment.feature(experimentId, "placementSummary");

  const recipesQuery = useQuery({
    queryKey: recipesQueryKey,
    queryFn: () => api.get<unknown>(`/api/v1/experiments/${experimentId}/recipes`),
    enabled: Boolean(experimentId),
  });

  const placementQuery = useQuery({
    queryKey: placementQueryKey,
    queryFn: () => api.get<PlacementSummary>(`/api/v1/experiments/${experimentId}/placement/summary`),
    enabled: Boolean(experimentId),
  });

  const recipesState = usePageQueryState(recipesQuery);
  const placementState = usePageQueryState(placementQuery);

  const recipes = useMemo(() => {
    if (!recipesQuery.data) {
      return [] as Recipe[];
    }
    try {
      return unwrapList<Recipe>(recipesQuery.data).sort((left, right) => left.code.localeCompare(right.code));
    } catch {
      return [] as Recipe[];
    }
  }, [recipesQuery.data]);

  const placement = placementQuery.data ?? null;

  useEffect(() => {
    setSelectedBulkRecipeId((current) => (current && recipes.some((recipe) => recipe.id === current) ? current : recipes[0]?.id || ""));
    setSelectedRecipeIds((current) => {
      const validIds = new Set(recipes.map((recipe) => recipe.id));
      const next = new Set<string>();
      for (const recipeId of current) {
        if (validIds.has(recipeId)) {
          next.add(recipeId);
        }
      }
      return next;
    });
  }, [recipes]);

  const sortedTrays = useMemo(() => {
    return [...(placement?.trays.results || [])].sort((left, right) => left.name.localeCompare(right.name));
  }, [placement?.trays.results]);

  const trayPlantIdsByTray = useMemo(() => {
    const grouped: Record<string, string[]> = {};
    for (const tray of sortedTrays) {
      grouped[tray.tray_id] = tray.plants.filter((plant) => isActivePlant(plant.status)).sort(sortPlantsById).map((plant) => plant.uuid);
    }
    return grouped;
  }, [sortedTrays]);

  const unplacedPlantIds = useMemo(() => {
    return [...(placement?.unplaced_plants.results || [])]
      .filter((plant) => isActivePlant(plant.status))
      .sort(sortPlantsById)
      .map((plant) => plant.uuid);
  }, [placement?.unplaced_plants.results]);

  const plantById = useMemo(() => {
    const map = new Map<string, PlantCell>();
    for (const tray of sortedTrays) {
      for (const plant of tray.plants) {
        if (isActivePlant(plant.status)) {
          map.set(plant.uuid, plant);
        }
      }
    }
    for (const plant of placement?.unplaced_plants.results || []) {
      if (isActivePlant(plant.status)) {
        map.set(plant.uuid, plant);
      }
    }
    return map;
  }, [placement?.unplaced_plants, sortedTrays]);

  const allPlantIds = useMemo(() => {
    return Array.from(plantById.values()).sort(sortPlantsById).map((plant) => plant.uuid);
  }, [plantById]);

  const recipeById = useMemo(() => {
    const map = new Map<string, Recipe>();
    for (const recipe of recipes) {
      map.set(recipe.id, recipe);
    }
    return map;
  }, [recipes]);

  useEffect(() => {
    if (!placement) {
      return;
    }

    const nextPersisted: Record<string, string | null> = {};
    for (const tray of placement.trays.results) {
      for (const plant of tray.plants) {
        if (isActivePlant(plant.status)) {
          nextPersisted[plant.uuid] = plant.assigned_recipe?.id || null;
        }
      }
    }
    for (const plant of placement.unplaced_plants.results) {
      if (isActivePlant(plant.status)) {
        nextPersisted[plant.uuid] = plant.assigned_recipe?.id || null;
      }
    }

    setPersistedRecipeByPlantId(nextPersisted);
    setDraftPlantRecipe(nextPersisted);
    setSelectedPlantIds(new Set());
    setActivePlantAnchorId(null);
    setDiagnostics(null);
  }, [placement]);

  const draftChangeCount = useMemo(() => {
    let count = 0;
    for (const plantId of allPlantIds) {
      const persistedRecipeId = persistedRecipeByPlantId[plantId] ?? null;
      const draftRecipeId = draftPlantRecipe[plantId] ?? persistedRecipeId;
      if ((persistedRecipeId || null) !== (draftRecipeId || null)) {
        count += 1;
      }
    }
    return count;
  }, [allPlantIds, draftPlantRecipe, persistedRecipeByPlantId]);

  const sameSpeciesDisabled = useMemo(() => {
    if (!activePlantAnchorId) {
      return true;
    }
    const anchor = plantById.get(activePlantAnchorId);
    if (!anchor) {
      return true;
    }
    return !allPlantIds.some((plantId) => {
      const plant = plantById.get(plantId);
      return !!plant && plant.species_id === anchor.species_id;
    });
  }, [activePlantAnchorId, allPlantIds, plantById]);

  function togglePlantSelection(plantId: string) {
    if (!plantById.has(plantId)) {
      return;
    }
    setSelectedPlantIds((current) => {
      const next = new Set(current);
      if (next.has(plantId)) {
        next.delete(plantId);
      } else {
        next.add(plantId);
      }
      return next;
    });
    setActivePlantAnchorId(plantId);
  }

  function togglePlantsSelectionByContainer(plantIds: string[]) {
    if (plantIds.length === 0) {
      return;
    }
    setSelectedPlantIds((current) => {
      const next = new Set(current);
      const allSelected = plantIds.every((plantId) => next.has(plantId));
      for (const plantId of plantIds) {
        if (allSelected) {
          next.delete(plantId);
        } else {
          next.add(plantId);
        }
      }
      return next;
    });
  }

  function selectAllPlants() {
    setSelectedPlantIds(new Set(allPlantIds));
    setActivePlantAnchorId((current) => current || allPlantIds[0] || null);
  }

  function selectSameSpecies() {
    if (!activePlantAnchorId) {
      return;
    }
    const anchor = plantById.get(activePlantAnchorId);
    if (!anchor) {
      return;
    }
    const matching = allPlantIds.filter((plantId) => plantById.get(plantId)?.species_id === anchor.species_id);
    setSelectedPlantIds(new Set(matching));
  }

  function clearPlantSelection() {
    setSelectedPlantIds(new Set());
    setActivePlantAnchorId(null);
  }

  function stageApplyRecipeToSelection() {
    if (selectedPlantIds.size === 0) {
      setError("Select one or more plants first.");
      return;
    }
    if (!selectedBulkRecipeId) {
      setError("Select a recipe first.");
      return;
    }

    setDraftPlantRecipe((current) => {
      const next = { ...current };
      for (const plantId of selectedPlantIds) {
        next[plantId] = selectedBulkRecipeId;
      }
      return next;
    });

    setDiagnostics(null);
    setError("");
    const recipe = recipeById.get(selectedBulkRecipeId);
    setNotice(`Staged ${recipe ? recipeLabel(recipe) : "recipe"} for ${selectedPlantIds.size} plant(s).`);
  }

  function stageRemoveRecipeFromSelection() {
    if (selectedPlantIds.size === 0) {
      setError("Select one or more plants first.");
      return;
    }

    setDraftPlantRecipe((current) => {
      const next = { ...current };
      for (const plantId of selectedPlantIds) {
        next[plantId] = null;
      }
      return next;
    });

    setDiagnostics(null);
    setError("");
    setNotice(`Staged recipe removal for ${selectedPlantIds.size} plant(s).`);
  }

  function resetDrafts() {
    setDraftPlantRecipe(persistedRecipeByPlantId);
    setDiagnostics(null);
    setError("");
    setNotice("Draft recipe changes discarded.");
  }

  const saveDraftMutation = useMutation({
    mutationFn: async (updates: Array<{ plant_id: string; assigned_recipe_id: string | null }>) =>
      api.patch(`/api/v1/experiments/${experimentId}/plants/recipes`, { updates }),
    onMutate: () => {
      setSaving(true);
      setError("");
      setNotice("");
      setDiagnostics(null);
      setOffline(false);
    },
    onSuccess: async (_result, updates) => {
      setNotice(`Saved ${updates.length} plant recipe assignment(s).`);
      await queryClient.invalidateQueries({ queryKey: placementQueryKey });
    },
    onError: (mutationError) => {
      if (isApiError(mutationError)) {
        setError(mutationError.detail || "Unable to save recipe assignments.");
        setDiagnostics((mutationError.diagnostics as Diagnostics | undefined) || null);
        return;
      }
      const normalized = normalizeUserFacingError(mutationError, "Unable to save recipe assignments.");
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to save recipe assignments.");
    },
    onSettled: () => {
      setSaving(false);
    },
  });

  async function saveDrafts() {
    const updates = allPlantIds
      .map((plantId) => {
        const persistedRecipeId = persistedRecipeByPlantId[plantId] ?? null;
        const draftRecipeId = draftPlantRecipe[plantId] ?? persistedRecipeId;
        if ((persistedRecipeId || null) === (draftRecipeId || null)) {
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

    await saveDraftMutation.mutateAsync(updates).catch(() => null);
  }

  const createRecipeMutation = useMutation({
    mutationFn: () =>
      api.post<{ detail?: string; id?: string }>(`/api/v1/experiments/${experimentId}/recipes`, {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        notes: notes.trim(),
      }),
    onMutate: () => {
      setSaving(true);
      setError("");
      setNotice("");
      setDiagnostics(null);
      setOffline(false);
    },
    onSuccess: async (payload) => {
      setNotice("Recipe created.");
      setCode(`R${recipes.length}`);
      setName(`Treatment ${Math.max(1, recipes.length)}`);
      setNotes("");
      await queryClient.invalidateQueries({ queryKey: recipesQueryKey });
      if (payload.id) {
        setSelectedBulkRecipeId(payload.id);
      }
    },
    onError: (mutationError) => {
      const normalized = normalizeUserFacingError(mutationError, "Unable to create recipe.");
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to create recipe.");
    },
    onSettled: () => {
      setSaving(false);
    },
  });

  async function createRecipe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await createRecipeMutation.mutateAsync().catch(() => null);
  }

  function toggleRecipeSelection(recipeId: string) {
    setSelectedRecipeIds((current) => {
      const next = new Set(current);
      if (next.has(recipeId)) {
        next.delete(recipeId);
      } else {
        next.add(recipeId);
      }
      return next;
    });
  }

  function clearRecipeSelection() {
    setSelectedRecipeIds(new Set());
  }

  const deleteRecipesMutation = useMutation({
    mutationFn: async (selected: Recipe[]) => {
      let deletedCount = 0;
      for (const recipe of selected) {
        try {
          await api.delete(`/api/v1/recipes/${recipe.id}`);
          deletedCount += 1;
        } catch (mutationError) {
          throw { mutationError, deletedCount };
        }
      }
      return { deletedCount };
    },
    onMutate: () => {
      setSaving(true);
      setError("");
      setNotice("");
      setDiagnostics(null);
      setOffline(false);
    },
    onSuccess: async ({ deletedCount }) => {
      setSelectedRecipeIds(new Set());
      setNotice(`Deleted ${deletedCount} recipe(s).`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: recipesQueryKey }),
        queryClient.invalidateQueries({ queryKey: placementQueryKey }),
      ]);
    },
    onError: async (wrappedError) => {
      const details = wrappedError as unknown as { mutationError: unknown; deletedCount: number };
      if (details.deletedCount > 0) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: recipesQueryKey }),
          queryClient.invalidateQueries({ queryKey: placementQueryKey }),
        ]);
      }

      if (isApiError(details.mutationError)) {
        setError(details.mutationError.detail || "Unable to delete selected recipes.");
        setDiagnostics((details.mutationError.diagnostics as Diagnostics | undefined) || null);
        return;
      }

      const normalized = normalizeUserFacingError(details.mutationError, "Unable to delete selected recipes.");
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to delete selected recipes.");
    },
    onSettled: () => {
      setSaving(false);
    },
  });

  async function deleteSelectedRecipes() {
    const selected = recipes.filter((recipe) => selectedRecipeIds.has(recipe.id));
    if (selected.length === 0) {
      return;
    }
    await deleteRecipesMutation.mutateAsync(selected).catch(() => null);
  }

  function renderPlantCell(plantId: string) {
    const plant = plantById.get(plantId);
    if (!plant) {
      return null;
    }

    const selected = selectedPlantIds.has(plantId);
    const persistedRecipeId = persistedRecipeByPlantId[plantId] ?? null;
    const draftRecipeId = draftPlantRecipe[plantId] ?? persistedRecipeId;
    const draftRecipe = draftRecipeId ? recipeById.get(draftRecipeId) || null : null;
    const dirty = (persistedRecipeId || null) !== (draftRecipeId || null);

    return (
      <article
        key={plant.uuid}
        className={cn(
          styles.plantCell,
          styles.cellFrame,
          styles.cellSurfaceLevel1,
          styles.cellInteractive,
          selected ? styles.plantCellSelected : "",
          dirty ? styles.plantCellDirty : "",
        )}
        onClick={() => togglePlantSelection(plant.uuid)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            togglePlantSelection(plant.uuid);
          }
        }}
        role="button"
        tabIndex={0}
        aria-pressed={selected}
      >
        {selected ? (
          <span className={styles.plantCellCheck}>
            <Check size={12} />
          </span>
        ) : null}
        {dirty ? <span className={styles.plantCellDirtyDot} aria-hidden="true" /> : null}
        <strong className={styles.plantCellId}>{plant.plant_id || "(pending)"}</strong>
        <span className={styles.plantCellSpecies}>{plant.species_name}</span>
        <div className={styles.plantCellMetaRow}>
          <span className={draftRecipe ? styles.recipeBadge : styles.recipeBadgeEmpty}>
            {draftRecipe ? draftRecipe.code : "No recipe"}
          </span>
          {dirty ? <span className={styles.recipeLegendItem}>Draft</span> : null}
        </div>
      </article>
    );
  }

  const notInvited = recipesState.errorKind === "forbidden" || placementState.errorKind === "forbidden";
  const loading = recipesState.isLoading || placementState.isLoading;
  const queryOffline = recipesState.errorKind === "offline" || placementState.errorKind === "offline";
  const queryError = useMemo(() => {
    if (notInvited) {
      return "";
    }
    if ((recipesState.isError || placementState.isError) && !queryOffline) {
      return "Unable to load recipes page.";
    }
    return "";
  }, [notInvited, placementState.isError, queryOffline, recipesState.isError]);

  if (notInvited) {
    return (
      <PageShell title="Recipes">
        <SectionCard>
          <PageAlerts notInvited />
        </SectionCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Recipes"
      subtitle="Assign recipes to individual plants using tray-grouped selection and draft saves."
      actions={
        <Link className={buttonVariants({ variant: "default" })} href={`/experiments/${experimentId}/overview`}>
          ← Overview
        </Link>
      }
    >
      <PageAlerts
        loading={loading}
        loadingText="Loading recipes..."
        error={error || queryError}
        notice={notice}
        offline={offline || queryOffline}
      />

      <SectionCard title="Recipe Tools">
        <form className={styles.recipeCreateCompact} onSubmit={(event) => void createRecipe(event)}>
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="Code (R0)"
            aria-label="Recipe code"
          />
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Name"
            aria-label="Recipe name"
          />
          <Input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Notes (optional)"
            aria-label="Recipe notes"
          />
          <button className={buttonVariants({ variant: "default" })} type="submit" disabled={saving}>
            {saving ? "Saving..." : "Create recipe"}
          </button>
        </form>

        <div className={cn(styles.toolbarSummaryRow, "flex flex-wrap items-center gap-2")}>
          <span className="text-sm text-muted-foreground">Recipes: {recipes.length}</span>
          <span className="text-sm text-muted-foreground">Selected: {selectedRecipeIds.size}</span>
          <div className={cn(styles.toolbarActionsCompact, "flex flex-wrap items-center gap-2")}>
            <TooltipIconButton
              label="Clear recipe selection"
              icon={<X size={16} />}
              onClick={clearRecipeSelection}
              disabled={selectedRecipeIds.size === 0}
              size="sm"
            />
            {selectedRecipeIds.size > 0 ? (
              <TooltipIconButton
                label="Delete selected recipes"
                icon={<Trash2 size={16} />}
                onClick={() => void deleteSelectedRecipes()}
                variant="destructive"
                disabled={saving}
                size="sm"
              />
            ) : null}
          </div>
        </div>

        <div className={cn(styles.trayMainGrid, styles.cellGridResponsive)} data-cell-size="md">
          {recipes.map((recipe) => {
            const selected = selectedRecipeIds.has(recipe.id);
            return (
              <article
                key={recipe.id}
                className={cn(
                  styles.trayGridCell,
                  styles.recipeCell,
                  styles.cellFrame,
                  styles.cellSurfaceLevel1,
                  styles.cellInteractive,
                  selected ? styles.plantCellSelected : "",
                )}
                onClick={() => toggleRecipeSelection(recipe.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleRecipeSelection(recipe.id);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
              >
                {selected ? (
                  <span className={styles.plantCellCheck}>
                    <Check size={12} />
                  </span>
                ) : null}
                <strong className={styles.recipeCellCode}>{recipe.code}</strong>
                <span className={styles.recipeCellName}>{recipe.name}</span>
              </article>
            );
          })}
          {recipes.length === 0 ? <p className="text-sm text-muted-foreground">No recipes yet.</p> : null}
        </div>
      </SectionCard>

      <SectionCard title="Plants by Tray (Draft)">
        <div className={styles.placementToolbar}>
          <NativeSelect
            className={styles.toolbarInlineSelect}
            value={selectedBulkRecipeId}
            onChange={(event) => setSelectedBulkRecipeId(event.target.value)}
            aria-label="Recipe for selected plants"
          >
            <option value="">Select recipe</option>
            {recipes.map((recipe) => (
              <option key={recipe.id} value={recipe.id}>
                {recipeLabel(recipe)}
              </option>
            ))}
          </NativeSelect>
          <div className={cn(styles.toolbarActionsCompact, "flex flex-wrap items-center gap-2")}>
            <TooltipIconButton
              label="Select all plants"
              icon={<CheckSquare size={16} />}
              onClick={selectAllPlants}
              disabled={allPlantIds.length === 0}
              size="sm"
            />
            <TooltipIconButton
              label="Select same species"
              icon={<Layers size={16} />}
              onClick={selectSameSpecies}
              disabled={sameSpeciesDisabled}
              size="sm"
            />
            <TooltipIconButton
              label="Clear plant selection"
              icon={<X size={16} />}
              onClick={clearPlantSelection}
              disabled={selectedPlantIds.size === 0}
              size="sm"
            />
            <button
              className={buttonVariants({ variant: "default" })}
              type="button"
              disabled={selectedPlantIds.size === 0 || !selectedBulkRecipeId}
              onClick={stageApplyRecipeToSelection}
            >
              <ArrowRight size={16} />
              Apply to selected
            </button>
            <button
              className={buttonVariants({ variant: "secondary" })}
              type="button"
              disabled={selectedPlantIds.size === 0}
              onClick={stageRemoveRecipeFromSelection}
            >
              <X size={16} />
              Remove recipe
            </button>
          </div>
        </div>

        <div className={cn(styles.toolbarSummaryRow, "flex flex-wrap items-center gap-2")}>
          <span className="text-sm text-muted-foreground">Plants in view: {allPlantIds.length}</span>
          <span className="text-sm text-muted-foreground">Selected plants: {selectedPlantIds.size}</span>
          <span className="text-sm text-muted-foreground">Draft changes: {draftChangeCount}</span>
        </div>

        {diagnostics?.reason_counts ? (
          <div className={"grid gap-2"}>
            <span>Diagnostics</span>
            <strong>{Object.entries(diagnostics.reason_counts).map(([key, value]) => `${key}: ${value}`).join(" · ")}</strong>
            {diagnostics.invalid_updates?.slice(0, 8).map((item) => (
              <span key={`${item.plant_id}-${item.reason}`}>{`${item.plant_id} · ${item.reason}`}</span>
            ))}
          </div>
        ) : null}

        <div className={cn(styles.trayManagerGrid, styles.cellGridResponsive)} data-cell-size="lg">
          {sortedTrays.map((tray) => {
            const trayPlantIds = trayPlantIdsByTray[tray.tray_id] || [];
            const selectedCount = trayPlantIds.filter((plantId) => selectedPlantIds.has(plantId)).length;
            const allSelected = trayPlantIds.length > 0 && selectedCount === trayPlantIds.length;

            return (
              <article key={tray.tray_id} className={cn(styles.trayEditorCell, "rounded-lg border border-border shadow-sm", styles.cellSurfaceLevel2)}>
                <div className={styles.trayHeaderRow}>
                  <div className={styles.trayHeaderMeta}>
                    <strong>{formatTrayDisplay(tray.name, tray.tray_id)}</strong>
                    <span className="text-sm text-muted-foreground">Occupancy: {trayPlantIds.length}/{tray.capacity}</span>
                  </div>
                  <div className={styles.trayHeaderActions}>
                    <span className="text-sm text-muted-foreground">Selected: {selectedCount}</span>
                    <TrayHeaderToggle
                      onClick={() => togglePlantsSelectionByContainer(trayPlantIds)}
                      allSelected={allSelected}
                      label={formatTrayDisplay(tray.name, tray.tray_id)}
                      icon={CheckSquare}
                    />
                  </div>
                </div>
                <div className={cn(styles.plantCellGridTray, styles.cellGridResponsive)} data-cell-size="sm">
                  {trayPlantIds.map((plantId) => renderPlantCell(plantId))}
                </div>
              </article>
            );
          })}

          {unplacedPlantIds.length > 0 ? (
            <article className={cn(styles.trayEditorCell, "rounded-lg border border-border shadow-sm", styles.cellSurfaceLevel2)}>
              <div className={styles.trayHeaderRow}>
                <div className={styles.trayHeaderMeta}>
                  <strong>Unplaced</strong>
                  <span className="text-sm text-muted-foreground">Plants: {unplacedPlantIds.length}</span>
                </div>
                <div className={styles.trayHeaderActions}>
                  <span className="text-sm text-muted-foreground">
                    Selected: {unplacedPlantIds.filter((plantId) => selectedPlantIds.has(plantId)).length}
                  </span>
                  <TrayHeaderToggle
                    onClick={() => togglePlantsSelectionByContainer(unplacedPlantIds)}
                    allSelected={unplacedPlantIds.every((plantId) => selectedPlantIds.has(plantId))}
                    label="Unplaced"
                    icon={CheckSquare}
                  />
                </div>
              </div>
              <div className={cn(styles.plantCellGridTray, styles.cellGridResponsive)} data-cell-size="sm">
                {unplacedPlantIds.map((plantId) => renderPlantCell(plantId))}
              </div>
            </article>
          ) : null}
        </div>
      </SectionCard>

      <StickyActionBar>
        <span className={styles.recipeLegendItem}>{draftChangeCount} recipe mapping change(s)</span>
        <button
          className={buttonVariants({ variant: "default" })}
          type="button"
          disabled={saving || draftChangeCount === 0}
          onClick={() => void saveDrafts()}
        >
          <Save size={16} />
          {saving ? "Saving..." : "Save Recipe Mapping"}
        </button>
        <button className={buttonVariants({ variant: "secondary" })} type="button" disabled={saving || draftChangeCount === 0} onClick={resetDrafts}>
          Discard drafts
        </button>
      </StickyActionBar>
    </PageShell>
  );
}
