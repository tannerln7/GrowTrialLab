"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { unwrapList } from "@/lib/backend";
import { api, isApiError } from "@/src/lib/api";
import { parseApiErrorPayload } from "@/src/lib/errors/backendErrors";
import { addManyToSet, removeManyFromSet, setHasAll, setWithAll, toggleSet } from "@/src/lib/collections/sets";
import { formatTrayDisplay } from "@/src/lib/format/labels";
import { buildChangeset, getDraftOrPersisted, isDirtyValue } from "@/src/lib/state/drafts";
import { buttonVariants } from "@/src/components/ui/button";
import PageAlerts from "@/src/components/ui/PageAlerts";
import PageShell from "@/src/components/ui/PageShell";
import SectionCard from "@/src/components/ui/SectionCard";
import {
  RecipeDraftActionBar,
  RecipePlantDraftPanel,
  RecipeToolsPanel,
} from "@/src/features/experiments/recipes/components/RecipePanels";
import { buildPersistedRecipeMap, isActivePlant, recipeLabel, sortPlantsById } from "@/src/features/experiments/recipes/utils";
import { normalizeUserFacingError } from "@/src/lib/errors/normalizeError";
import { PlantCell } from "@/src/lib/gridkit/components";
import type { ChipSpec } from "@/src/lib/gridkit/spec";
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
      const validIds = setWithAll(recipes.map((recipe) => recipe.id));
      return setWithAll(Array.from(current).filter((recipeId) => validIds.has(recipeId)));
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

    const nextPersisted = buildPersistedRecipeMap(placement);
    setPersistedRecipeByPlantId(nextPersisted);
    setDraftPlantRecipe(nextPersisted);
    setSelectedPlantIds(setWithAll<string>([]));
    setActivePlantAnchorId(null);
    setDiagnostics(null);
  }, [placement]);

  const draftChangeCount = useMemo(() => {
    return buildChangeset<string | null>(allPlantIds, persistedRecipeByPlantId, draftPlantRecipe, { fallback: null }).length;
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

  const togglePlantSelection = useCallback((plantId: string) => {
    if (!plantById.has(plantId)) {
      return;
    }
    setSelectedPlantIds((current) => toggleSet(current, plantId));
    setActivePlantAnchorId(plantId);
  }, [plantById]);

  const togglePlantsSelectionByContainer = useCallback((plantIds: string[]) => {
    if (plantIds.length === 0) {
      return;
    }
    setSelectedPlantIds((current) => {
      if (setHasAll(current, plantIds)) {
        return removeManyFromSet(current, plantIds);
      }
      return addManyToSet(current, plantIds);
    });
  }, []);

  const selectAllPlants = useCallback(() => {
    setSelectedPlantIds(setWithAll(allPlantIds));
    setActivePlantAnchorId((current) => current || allPlantIds[0] || null);
  }, [allPlantIds]);

  const selectSameSpecies = useCallback(() => {
    if (!activePlantAnchorId) {
      return;
    }
    const anchor = plantById.get(activePlantAnchorId);
    if (!anchor) {
      return;
    }
    const matching = allPlantIds.filter((plantId) => plantById.get(plantId)?.species_id === anchor.species_id);
    setSelectedPlantIds(setWithAll(matching));
  }, [activePlantAnchorId, allPlantIds, plantById]);

  const clearPlantSelection = useCallback(() => {
    setSelectedPlantIds(setWithAll<string>([]));
    setActivePlantAnchorId(null);
  }, []);

  const stageApplyRecipeToSelection = useCallback(() => {
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
  }, [recipeById, selectedBulkRecipeId, selectedPlantIds]);

  const stageRemoveRecipeFromSelection = useCallback(() => {
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
  }, [selectedPlantIds]);

  const resetDrafts = useCallback(() => {
    setDraftPlantRecipe(persistedRecipeByPlantId);
    setDiagnostics(null);
    setError("");
    setNotice("Draft recipe changes discarded.");
  }, [persistedRecipeByPlantId]);

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
        const parsed = parseApiErrorPayload<Diagnostics>(mutationError, "Unable to save recipe assignments.");
        setError(parsed.detail);
        setDiagnostics(parsed.diagnostics);
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

  const saveDrafts = useCallback(async () => {
    const updates = buildChangeset<string | null>(allPlantIds, persistedRecipeByPlantId, draftPlantRecipe, { fallback: null }).map(
      (change) => ({
        plant_id: change.key,
        assigned_recipe_id: change.draftValue,
      }),
    );

    if (updates.length === 0) {
      setNotice("No staged recipe changes to save.");
      return;
    }

    await saveDraftMutation.mutateAsync(updates).catch(() => null);
  }, [allPlantIds, draftPlantRecipe, persistedRecipeByPlantId, saveDraftMutation]);

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

  const createRecipe = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await createRecipeMutation.mutateAsync().catch(() => null);
  }, [createRecipeMutation]);

  const toggleRecipeSelection = useCallback((recipeId: string) => {
    setSelectedRecipeIds((current) => toggleSet(current, recipeId));
  }, []);

  const clearRecipeSelection = useCallback(() => {
    setSelectedRecipeIds(setWithAll<string>([]));
  }, []);

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
      setSelectedRecipeIds(setWithAll<string>([]));
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
        const parsed = parseApiErrorPayload<Diagnostics>(details.mutationError, "Unable to delete selected recipes.");
        setError(parsed.detail);
        setDiagnostics(parsed.diagnostics);
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

  const deleteSelectedRecipes = useCallback(async () => {
    const selected = recipes.filter((recipe) => selectedRecipeIds.has(recipe.id));
    if (selected.length === 0) {
      return;
    }
    await deleteRecipesMutation.mutateAsync(selected).catch(() => null);
  }, [deleteRecipesMutation, recipes, selectedRecipeIds]);

  const renderPlantCell = useCallback((plantId: string) => {
    const plant = plantById.get(plantId);
    if (!plant) {
      return null;
    }

    const selected = selectedPlantIds.has(plantId);
    const persistedRecipeId = persistedRecipeByPlantId[plantId] ?? null;
    const draftRecipeId = getDraftOrPersisted<string | null>(draftPlantRecipe, persistedRecipeByPlantId, plantId, null);
    const draftRecipe = draftRecipeId ? recipeById.get(draftRecipeId) || null : null;
    const dirty = isDirtyValue(persistedRecipeId, draftRecipeId);
    const chips: ChipSpec[] = [];
    if (dirty) {
      chips.push({
        id: `${plant.uuid}-dirty`,
        label: "•",
        tone: "warn",
        placement: "tl",
      });
    }
    if (selected) {
      chips.push({
        id: `${plant.uuid}-selected`,
        label: "✓",
        tone: "info",
        placement: "tr",
      });
    }

    return (
      <PlantCell
        key={plant.uuid}
        plantId={plant.uuid}
        title={plant.plant_id || "(pending)"}
        subtitle={plant.species_name}
        state={{
          selected,
          tone: dirty ? "warn" : undefined,
        }}
        interactive
        onPress={() => togglePlantSelection(plant.uuid)}
        ariaLabel={plant.plant_id || "Plant"}
        chips={chips}
        className={styles.plantCell}
        titleClassName={styles.plantCellId}
        subtitleClassName={styles.plantCellSpecies}
        metaClassName={styles.plantCellMetaRow}
        meta={
          <>
            <span className={draftRecipe ? styles.recipeBadge : styles.recipeBadgeEmpty}>
              {draftRecipe ? draftRecipe.code : "No recipe"}
            </span>
            {dirty ? <span className={styles.recipeLegendItem}>Draft</span> : null}
          </>
        }
      />
    );
  }, [draftPlantRecipe, persistedRecipeByPlantId, plantById, recipeById, selectedPlantIds, togglePlantSelection]);

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

  const recipeToolsModel = useMemo(
    () => ({
      code,
      name,
      notes,
      saving,
      recipes,
      selectedRecipeIds,
    }),
    [code, name, notes, recipes, saving, selectedRecipeIds],
  );

  const recipeToolsActions = useMemo(
    () => ({
      onCodeChange: setCode,
      onNameChange: setName,
      onNotesChange: setNotes,
      onCreateRecipe: (event: FormEvent<HTMLFormElement>) => {
        void createRecipe(event);
      },
      onToggleRecipeSelection: toggleRecipeSelection,
      onClearRecipeSelection: clearRecipeSelection,
      onDeleteSelectedRecipes: () => {
        void deleteSelectedRecipes();
      },
    }),
    [clearRecipeSelection, createRecipe, deleteSelectedRecipes, toggleRecipeSelection],
  );

  const trayViewModels = useMemo(
    () =>
      sortedTrays.map((tray) => {
        const trayPlantIds = trayPlantIdsByTray[tray.tray_id] || [];
        const selectedCount = trayPlantIds.filter((plantId) => selectedPlantIds.has(plantId)).length;
        return {
          trayId: tray.tray_id,
          trayName: tray.name,
          trayCode: tray.tray_id,
          capacity: tray.capacity,
          plantIds: trayPlantIds,
          selectedCount,
          allSelected: trayPlantIds.length > 0 && selectedCount === trayPlantIds.length,
        };
      }),
    [selectedPlantIds, sortedTrays, trayPlantIdsByTray],
  );

  const unplacedViewModel = useMemo(() => {
    if (unplacedPlantIds.length === 0) {
      return null;
    }
    const selectedCount = unplacedPlantIds.filter((plantId) => selectedPlantIds.has(plantId)).length;
    return {
      plantIds: unplacedPlantIds,
      selectedCount,
      allSelected: unplacedPlantIds.every((plantId) => selectedPlantIds.has(plantId)),
    };
  }, [selectedPlantIds, unplacedPlantIds]);

  const plantDraftModel = useMemo(
    () => ({
      selectedBulkRecipeId,
      recipes,
      allPlantCount: allPlantIds.length,
      selectedPlantCount: selectedPlantIds.size,
      draftChangeCount,
      sameSpeciesDisabled,
      diagnostics,
      trays: trayViewModels,
      unplaced: unplacedViewModel,
    }),
    [
      allPlantIds.length,
      diagnostics,
      draftChangeCount,
      recipes,
      sameSpeciesDisabled,
      selectedBulkRecipeId,
      selectedPlantIds.size,
      trayViewModels,
      unplacedViewModel,
    ],
  );

  const plantDraftActions = useMemo(
    () => ({
      onBulkRecipeChange: setSelectedBulkRecipeId,
      onSelectAllPlants: selectAllPlants,
      onSelectSameSpecies: selectSameSpecies,
      onClearPlantSelection: clearPlantSelection,
      onApplyRecipeToSelection: stageApplyRecipeToSelection,
      onRemoveRecipeFromSelection: stageRemoveRecipeFromSelection,
      onToggleContainer: togglePlantsSelectionByContainer,
    }),
    [
      clearPlantSelection,
      selectAllPlants,
      selectSameSpecies,
      stageApplyRecipeToSelection,
      stageRemoveRecipeFromSelection,
      togglePlantsSelectionByContainer,
    ],
  );

  const actionBarModel = useMemo(
    () => ({
      draftChangeCount,
      saving,
    }),
    [draftChangeCount, saving],
  );

  const actionBarActions = useMemo(
    () => ({
      onSaveDrafts: () => {
        void saveDrafts();
      },
      onDiscardDrafts: resetDrafts,
    }),
    [resetDrafts, saveDrafts],
  );

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

      <RecipeToolsPanel model={recipeToolsModel} actions={recipeToolsActions} />
      <RecipePlantDraftPanel
        model={plantDraftModel}
        actions={plantDraftActions}
        recipeLabel={recipeLabel}
        formatTrayDisplay={formatTrayDisplay}
        renderPlantCell={renderPlantCell}
      />
      <RecipeDraftActionBar model={actionBarModel} actions={actionBarActions} />
    </PageShell>
  );
}
