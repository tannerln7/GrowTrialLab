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

type PlacementPlant = {
  uuid: string;
  plant_id: string;
  species_id: string;
  species_name: string;
  species_category: string;
  bin: string | null;
  status: string;
};

type TrayPlant = {
  tray_plant_id: string;
  uuid: string;
  plant_id: string;
  species_id: string;
  species_name: string;
  species_category: string;
  bin: string | null;
  status: string;
  assigned_recipe_code: string | null;
  assigned_recipe_name: string | null;
};

type PlacementTray = {
  tray_id: string;
  tray_name: string;
  block_id: string | null;
  block_name: string | null;
  tent_id: string | null;
  tent_name: string | null;
  assigned_recipe_id: string | null;
  assigned_recipe_code: string | null;
  assigned_recipe_name: string | null;
  capacity: number;
  current_count: number;
  placed_count: number;
  plants: TrayPlant[];
};

type PlacementTent = {
  tent_id: string;
  name: string;
  code: string;
  allowed_species_count: number;
  allowed_species: Array<{
    id: string;
    name: string;
    category: string;
  }>;
  blocks: Array<{
    block_id: string;
    name: string;
    description: string;
    tray_count: number;
  }>;
};

type PlacementSummary = {
  tents: PlacementTent[];
  trays: PlacementTray[];
  unplaced_plants_count: number;
  unplaced_plants: PlacementPlant[];
  unplaced_trays: Array<{
    tray_id: string;
    tray_name: string;
    capacity: number;
    current_count: number;
    assigned_recipe_id: string | null;
    assigned_recipe_code: string | null;
  }>;
};

type BlockOption = {
  id: string;
  tentId: string;
  tentName: string;
  allowedSpeciesIds: Set<string> | null;
  name: string;
  label: string;
};

type RecipeOption = {
  id: string;
  code: string;
  name: string;
};

type AutoPlaceDiagnostics = {
  remaining_unplaced_plants: number;
  reason_counts?: Record<string, number>;
  unplaceable_plants?: Array<{
    uuid: string;
    plant_id: string;
    species_name: string;
    species_category: string;
    reason: string;
  }>;
};

const RUNNING_LOCK_MESSAGE =
  "Placement cannot be edited while the experiment is running. Stop the experiment to change placement.";

const AUTO_PLACE_REASON_LABELS: Record<string, string> = {
  no_compatible_trays: "No compatible trays",
  compatible_trays_full: "Compatible trays are full",
  restriction_conflict: "Tent restriction conflict",
  no_tented_blocks: "No tent blocks available",
};

function formatAutoPlaceReason(reason: string): string {
  return AUTO_PLACE_REASON_LABELS[reason] || reason;
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
  const [statusSummary, setStatusSummary] = useState<ExperimentStatusSummary | null>(null);
  const [summary, setSummary] = useState<PlacementSummary | null>(null);
  const [blocks, setBlocks] = useState<BlockOption[]>([]);
  const [recipes, setRecipes] = useState<RecipeOption[]>([]);
  const [autoPlaceDiagnostics, setAutoPlaceDiagnostics] = useState<AutoPlaceDiagnostics | null>(null);
  const [expandedTrays, setExpandedTrays] = useState<Record<string, boolean>>({});
  const [traySelectionByPlant, setTraySelectionByPlant] = useState<Record<string, string>>({});
  const [blockSelectionByTray, setBlockSelectionByTray] = useState<Record<string, string>>({});
  const [newTrayName, setNewTrayName] = useState("");
  const [newTrayBlockId, setNewTrayBlockId] = useState("");
  const [newTrayRecipeId, setNewTrayRecipeId] = useState("");
  const [newTrayCapacity, setNewTrayCapacity] = useState(1);

  const placementLocked = statusSummary?.lifecycle.state === "running";

  const trayNameSuggestion = useMemo(
    () => suggestTrayName((summary?.trays || []).map((tray) => tray.tray_name)),
    [summary?.trays],
  );

  const loadPlacement = useCallback(async () => {
    const [summaryResponse, recipesResponse] = await Promise.all([
      backendFetch(`/api/v1/experiments/${experimentId}/placement/summary`),
      backendFetch(`/api/v1/recipes/?experiment=${experimentId}`),
    ]);
    if (!summaryResponse.ok) {
      throw new Error("Unable to load placement summary.");
    }
    if (!recipesResponse.ok) {
      throw new Error("Unable to load recipes.");
    }
    const summaryPayload = (await summaryResponse.json()) as PlacementSummary;
    const recipesPayload = (await recipesResponse.json()) as unknown;
    setSummary(summaryPayload);
    setBlocks(
      summaryPayload.tents.flatMap((tent) =>
        tent.blocks.map((block) => ({
          id: block.block_id,
          tentId: tent.tent_id,
          tentName: tent.name,
          allowedSpeciesIds:
            tent.allowed_species.length === 0
              ? null
              : new Set(tent.allowed_species.map((species) => species.id)),
          name: block.name,
          label: `${tent.name} / ${block.name}`,
        })),
      ),
    );
    setRecipes(unwrapList<RecipeOption>(recipesPayload));
    return summaryPayload;
  }, [experimentId]);

  useEffect(() => {
    if (!newTrayName.trim() && trayNameSuggestion) {
      setNewTrayName(trayNameSuggestion);
    }
  }, [newTrayName, trayNameSuggestion]);

  const trayById = useMemo(() => {
    const map = new Map<string, PlacementTray>();
    for (const tray of summary?.trays || []) {
      map.set(tray.tray_id, tray);
    }
    return map;
  }, [summary?.trays]);

  const blockById = useMemo(() => {
    const map = new Map<string, BlockOption>();
    for (const block of blocks) {
      map.set(block.id, block);
    }
    return map;
  }, [blocks]);

  const hasTentedBlocks = blocks.length > 0;

  const occupiedTrayIdByBlockId = useMemo(() => {
    const map = new Map<string, string>();
    for (const tray of summary?.trays || []) {
      if (tray.block_id) {
        map.set(tray.block_id, tray.tray_id);
      }
    }
    return map;
  }, [summary?.trays]);

  const speciesAllowedByBlock = useCallback(
    (speciesId: string, blockId: string | null): boolean => {
      if (!blockId) {
        return true;
      }
      const block = blockById.get(blockId);
      if (!block) {
        return false;
      }
      if (block.allowedSpeciesIds === null) {
        return true;
      }
      return block.allowedSpeciesIds.has(speciesId);
    },
    [blockById],
  );

  const trayRemainingCapacity = useCallback(
    (tray: PlacementTray): number => Math.max(0, tray.capacity - tray.current_count),
    [],
  );

  const compatibleBlockIdsByTray = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const tray of summary?.trays || []) {
      const compatible = blocks
        .filter((block) => {
          const occupyingTrayId = occupiedTrayIdByBlockId.get(block.id);
          return !occupyingTrayId || occupyingTrayId === tray.tray_id;
        })
        .filter((block) =>
          tray.plants.every((plant) => speciesAllowedByBlock(plant.species_id, block.id)),
        )
        .map((block) => block.id);
      map.set(tray.tray_id, compatible);
    }
    return map;
  }, [blocks, occupiedTrayIdByBlockId, summary?.trays, speciesAllowedByBlock]);

  const availableBlocksForNewTray = useMemo(
    () => blocks.filter((block) => !occupiedTrayIdByBlockId.has(block.id)),
    [blocks, occupiedTrayIdByBlockId],
  );

  const compatibleTrayIdsByPlant = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const plant of summary?.unplaced_plants || []) {
      const compatible = (summary?.trays || [])
        .filter((tray) => trayRemainingCapacity(tray) > 0)
        .filter((tray) => {
          if (!tray.block_id) {
            return true;
          }
          return speciesAllowedByBlock(plant.species_id, tray.block_id);
        })
        .map((tray) => tray.tray_id);
      map.set(plant.uuid, compatible);
    }
    return map;
  }, [summary?.trays, summary?.unplaced_plants, speciesAllowedByBlock, trayRemainingCapacity]);

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
        const summaryResponse = await fetchExperimentStatusSummary(experimentId);
        if (!summaryResponse) {
          setError("Unable to load placement status.");
          return;
        }
        setStatusSummary(summaryResponse);
        if (!summaryResponse.setup.is_complete) {
          router.replace(`/experiments/${experimentId}/setup`);
          return;
        }
        await loadPlacement();
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
  }, [experimentId, loadPlacement, router]);

  async function createTray() {
    if (placementLocked) {
      setError(RUNNING_LOCK_MESSAGE);
      return;
    }
    const trayName = newTrayName.trim() || trayNameSuggestion;
    if (!trayName) {
      setError("Tray name is required.");
      return;
    }
    if (newTrayCapacity < 1) {
      setError("Tray capacity must be at least 1.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    setAutoPlaceDiagnostics(null);
    try {
      const response = await backendFetch(`/api/v1/experiments/${experimentId}/trays`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trayName,
          block_id: newTrayBlockId || null,
          assigned_recipe_id: newTrayRecipeId || null,
          capacity: newTrayCapacity,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { detail?: string; suggested_name?: string };
        if (payload.suggested_name) {
          setNewTrayName(payload.suggested_name);
        }
        setError(payload.detail || "Unable to create tray.");
        return;
      }
      setNewTrayName("");
      setNewTrayBlockId("");
      setNewTrayRecipeId("");
      setNewTrayCapacity(1);
      setNotice("Tray created.");
      await loadPlacement();
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

  async function saveTray(tray: PlacementTray) {
    if (placementLocked) {
      setError(RUNNING_LOCK_MESSAGE);
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    setAutoPlaceDiagnostics(null);
    try {
      const response = await backendFetch(`/api/v1/trays/${tray.tray_id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: tray.tray_name,
          block: tray.block_id || null,
          assigned_recipe: tray.assigned_recipe_id || null,
          capacity: tray.capacity,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { detail?: string };
        setError(payload.detail || "Unable to save tray.");
        return;
      }
      setNotice(`${tray.tray_name} saved.`);
      await loadPlacement();
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to save tray.");
    } finally {
      setSaving(false);
    }
  }

  async function addPlantToTray(plantUuid: string) {
    if (placementLocked) {
      setError(RUNNING_LOCK_MESSAGE);
      return;
    }
    const trayId = traySelectionByPlant[plantUuid];
    if (!trayId) {
      setError("Select a tray first.");
      return;
    }
    const compatibleTrayIds = compatibleTrayIdsByPlant.get(plantUuid) || [];
    if (!compatibleTrayIds.includes(trayId)) {
      setError("Selected tray is not compatible for this plant under current tent restrictions/capacity.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    setAutoPlaceDiagnostics(null);
    try {
      const response = await backendFetch(`/api/v1/trays/${trayId}/plants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plant_id: plantUuid }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { detail?: string };
        setError(payload.detail || "Unable to add plant to tray.");
        return;
      }
      setNotice("Plant placed.");
      setTraySelectionByPlant((current) => {
        const next = { ...current };
        delete next[plantUuid];
        return next;
      });
      await loadPlacement();
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to add plant to tray.");
    } finally {
      setSaving(false);
    }
  }

  async function placeTrayIntoBlock(trayId: string) {
    if (placementLocked) {
      setError(RUNNING_LOCK_MESSAGE);
      return;
    }
    const blockId = blockSelectionByTray[trayId];
    if (!blockId) {
      setError("Select a destination block for the tray.");
      return;
    }
    const compatibleBlocks = compatibleBlockIdsByTray.get(trayId) || [];
    if (!compatibleBlocks.includes(blockId)) {
      setError("Selected block is not compatible with this tray's plants.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    setAutoPlaceDiagnostics(null);
    try {
      const response = await backendFetch(`/api/v1/trays/${trayId}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ block: blockId }),
      });
      const payload = (await response.json()) as { detail?: string };
      if (!response.ok) {
        setError(payload.detail || "Unable to place tray.");
        return;
      }
      setNotice("Tray placed.");
      await loadPlacement();
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to place tray.");
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
    setAutoPlaceDiagnostics(null);
    try {
      const response = await backendFetch(`/api/v1/trays/${trayId}/plants/${trayPlantId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = (await response.json()) as { detail?: string };
        setError(payload.detail || "Unable to remove plant from tray.");
        return;
      }
      setNotice("Plant removed from tray.");
      await loadPlacement();
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to remove plant from tray.");
    } finally {
      setSaving(false);
    }
  }

  async function autoPlacePlants() {
    if (placementLocked) {
      setError(RUNNING_LOCK_MESSAGE);
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    setAutoPlaceDiagnostics(null);
    try {
      const response = await backendFetch(`/api/v1/experiments/${experimentId}/placement/auto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "bin_balance_v1",
          clear_existing: true,
        }),
      });
      const payload = (await response.json()) as {
        detail?: string;
        placed_count?: number;
        remaining_unplaced_plants?: number;
        reason_counts?: Record<string, number>;
        unplaceable_plants?: AutoPlaceDiagnostics["unplaceable_plants"];
      };
      if (!response.ok) {
        if (response.status === 409 && typeof payload.remaining_unplaced_plants === "number") {
          setAutoPlaceDiagnostics({
            remaining_unplaced_plants: payload.remaining_unplaced_plants,
            reason_counts: payload.reason_counts,
            unplaceable_plants: payload.unplaceable_plants,
          });
        }
        setError(payload.detail || "Unable to auto-place plants.");
        return;
      }
      setNotice(`Auto-placement complete (${payload.placed_count ?? 0} placed).`);
      await loadPlacement();
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to auto-place plants.");
    } finally {
      setSaving(false);
    }
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
      subtitle="Assign plants to trays and set tray recipes."
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
        <SectionCard title="Placement Locked While Running">
          <p className={styles.mutedText}>{RUNNING_LOCK_MESSAGE}</p>
          <Link className={styles.buttonPrimary} href={`/experiments/${experimentId}/overview`}>
            Back to Overview
          </Link>
        </SectionCard>
      ) : null}

      {summary ? (
        <>
          <SectionCard title="Unplaced Plants">
            <div className={styles.actions}>
              <p className={styles.mutedText}>Unplaced active plants: {summary.unplaced_plants_count}</p>
              <button
                className={styles.buttonPrimary}
                type="button"
                disabled={saving || placementLocked}
                onClick={() => void autoPlacePlants()}
              >
                Auto-place (balance by grade)
              </button>
            </div>
            {autoPlaceDiagnostics ? (
              <article className={styles.blockRow}>
                <strong>Could not auto-place everything</strong>
                <p className={styles.mutedText}>
                  Remaining unplaced plants: {autoPlaceDiagnostics.remaining_unplaced_plants}
                </p>
                {autoPlaceDiagnostics.reason_counts ? (
                  <div className={styles.badgeRow}>
                    {Object.entries(autoPlaceDiagnostics.reason_counts).map(([reason, count]) => (
                      <span className={styles.badgeWarn} key={reason}>
                        {formatAutoPlaceReason(reason)}: {count}
                      </span>
                    ))}
                  </div>
                ) : null}
                {autoPlaceDiagnostics.unplaceable_plants?.length ? (
                  <div className={styles.stack}>
                    {autoPlaceDiagnostics.unplaceable_plants.slice(0, 10).map((plant) => (
                      <span className={styles.mutedText} key={plant.uuid}>
                        {plant.plant_id || "(pending)"} - {plant.species_name} ({formatAutoPlaceReason(plant.reason)})
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className={styles.actions}>
                  <a className={styles.buttonSecondary} href="#trays">
                    Create tray
                  </a>
                  <Link className={styles.buttonSecondary} href={`/experiments/${experimentId}/slots`}>
                    Create tent blocks
                  </Link>
                  <Link className={styles.buttonSecondary} href={`/experiments/${experimentId}/slots`}>
                    Change tent restriction
                  </Link>
                  <a className={styles.buttonSecondary} href="#trays">
                    Add capacity
                  </a>
                </div>
              </article>
            ) : null}
            <ResponsiveList
              items={summary.unplaced_plants}
              getKey={(plant) => plant.uuid}
              columns={[
                {
                  key: "plant_id",
                  label: "Plant ID",
                  render: (plant) => (
                    <Link href={`/p/${plant.uuid}`}>{plant.plant_id || "(pending)"}</Link>
                  ),
                },
                { key: "species", label: "Species", render: (plant) => plant.species_name },
                { key: "bin", label: "Grade", render: (plant) => plant.bin || "Missing" },
                {
                  key: "action",
                  label: "Action",
                  render: (plant) => {
                    const compatibleTrayIds = compatibleTrayIdsByPlant.get(plant.uuid) || [];
                    const compatibleTrays = summary.trays.filter((tray) => compatibleTrayIds.includes(tray.tray_id));
                    const selectedTray = trayById.get(traySelectionByPlant[plant.uuid] || "");
                    return (
                      <div className={styles.actions}>
                        <select
                          className={styles.select}
                          value={traySelectionByPlant[plant.uuid] || ""}
                          onChange={(event) =>
                            setTraySelectionByPlant((current) => ({
                              ...current,
                              [plant.uuid]: event.target.value,
                            }))
                          }
                          disabled={saving || placementLocked || compatibleTrays.length === 0}
                        >
                          <option value="">Select tray</option>
                          {compatibleTrays.map((tray) => (
                            <option key={tray.tray_id} value={tray.tray_id}>
                              {tray.tent_name ? `${tray.tray_name} (${tray.tent_name})` : tray.tray_name} ({tray.current_count}/{tray.capacity})
                            </option>
                          ))}
                        </select>
                        <button
                          className={styles.buttonSecondary}
                          type="button"
                          disabled={saving || placementLocked || compatibleTrays.length === 0}
                          onClick={() => void addPlantToTray(plant.uuid)}
                        >
                          Add to tray
                        </button>
                        {compatibleTrays.length === 0 ? (
                          <span className={styles.inlineNote}>Not allowed by tent restriction or all compatible trays are full.</span>
                        ) : null}
                        {selectedTray?.block_id ? (
                          <span className={styles.inlineNote}>
                            Filtered by Tent {selectedTray.tent_name || selectedTray.block_name} restrictions.
                          </span>
                        ) : null}
                      </div>
                    );
                  },
                },
              ]}
              renderMobileCard={(plant) => {
                const compatibleTrayIds = compatibleTrayIdsByPlant.get(plant.uuid) || [];
                const compatibleTrays = summary.trays.filter((tray) => compatibleTrayIds.includes(tray.tray_id));
                const selectedTray = trayById.get(traySelectionByPlant[plant.uuid] || "");
                return (
                  <div className={styles.cardKeyValue}>
                    <span>Plant ID</span>
                    <strong>
                      <Link href={`/p/${plant.uuid}`}>{plant.plant_id || "(pending)"}</Link>
                    </strong>
                    <span>Species</span>
                    <strong>{plant.species_name}</strong>
                    <span>Grade</span>
                    <strong>{plant.bin || "Missing"}</strong>
                    <select
                      className={styles.select}
                      value={traySelectionByPlant[plant.uuid] || ""}
                      onChange={(event) =>
                        setTraySelectionByPlant((current) => ({
                          ...current,
                          [plant.uuid]: event.target.value,
                        }))
                      }
                      disabled={saving || placementLocked || compatibleTrays.length === 0}
                    >
                      <option value="">Select tray</option>
                      {compatibleTrays.map((tray) => (
                        <option key={tray.tray_id} value={tray.tray_id}>
                          {tray.tent_name ? `${tray.tray_name} (${tray.tent_name})` : tray.tray_name} ({tray.current_count}/{tray.capacity})
                        </option>
                      ))}
                    </select>
                    {compatibleTrays.length === 0 ? (
                      <span className={styles.inlineNote}>Not allowed by tent restriction or all compatible trays are full.</span>
                    ) : null}
                    {selectedTray?.block_id ? (
                      <span className={styles.inlineNote}>
                        Filtered by Tent {selectedTray.tent_name || selectedTray.block_name} restrictions.
                      </span>
                    ) : null}
                    <button
                      className={styles.buttonSecondary}
                      type="button"
                      disabled={saving || placementLocked || compatibleTrays.length === 0}
                      onClick={() => void addPlantToTray(plant.uuid)}
                    >
                      Add to tray
                    </button>
                  </div>
                );
              }}
              emptyState={
                <p className={styles.mutedText}>
                  {summary.unplaced_plants_count === 0
                    ? "All active plants are placed."
                    : "No unplaced plants in this page window."}
                </p>
              }
            />
          </SectionCard>

          <SectionCard title="Tent Placement Map">
            <div className={styles.blocksList}>
              {summary.tents.map((tent) => (
                <article className={styles.blockRow} key={tent.tent_id}>
                  <div className={styles.actions}>
                    <strong>
                      {tent.name}
                      {tent.code ? ` (${tent.code})` : ""}
                    </strong>
                    <span className={styles.mutedText}>
                      Species restriction: {tent.allowed_species_count === 0 ? "Any" : `${tent.allowed_species_count} species`}
                    </span>
                  </div>
                  {tent.blocks.length === 0 ? (
                    <p className={styles.mutedText}>No blocks configured in this tent.</p>
                  ) : (
                    <div className={styles.blocksList}>
                      {tent.blocks.map((block) => {
                        const traysInBlock = summary.trays.filter((tray) => tray.block_id === block.block_id);
                        const trayInBlock = traysInBlock[0];
                        return (
                          <article className={styles.blockRow} key={block.block_id}>
                            <div className={styles.actions}>
                              <strong>{block.name}</strong>
                            </div>
                            {traysInBlock.length === 0 ? (
                              <p className={styles.mutedText}>No tray assigned to this block.</p>
                            ) : traysInBlock.length > 1 ? (
                              <div className={styles.stack}>
                                <p className={styles.inlineNote}>
                                  Multiple trays found in this block (legacy data). Only one tray per block is allowed.
                                </p>
                                {traysInBlock.map((tray) => (
                                  <div className={styles.actions} key={tray.tray_id}>
                                    <span>
                                      Tray {tray.tray_name} ({tray.current_count}/{tray.capacity})
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className={styles.stack}>
                                <div className={styles.actions}>
                                  <span>Tray</span>
                                  <strong>
                                    {trayInBlock?.tray_name} ({trayInBlock?.current_count}/{trayInBlock?.capacity})
                                  </strong>
                                </div>
                                <div className={styles.actions}>
                                  <span>Recipe</span>
                                  <strong>
                                    {trayInBlock?.assigned_recipe_code
                                      ? `${trayInBlock.assigned_recipe_code}${
                                          trayInBlock.assigned_recipe_name
                                            ? ` - ${trayInBlock.assigned_recipe_name}`
                                            : ""
                                        }`
                                      : "Missing tray recipe"}
                                  </strong>
                                </div>
                                <div className={styles.actions}>
                                  <span>Plants</span>
                                  <strong>{trayInBlock?.placed_count}</strong>
                                </div>
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Unplaced Trays">
            {summary.unplaced_trays.length > 0 && !hasTentedBlocks ? (
              <article className={styles.blockRow}>
                <strong>No tent blocks available.</strong>
                <p className={styles.inlineNote}>Create at least one tent block before placing trays.</p>
                <Link className={styles.buttonPrimary} href={`/experiments/${experimentId}/slots`}>
                  Create tent blocks
                </Link>
              </article>
            ) : null}
            {summary.unplaced_trays.length === 0 ? (
              <p className={styles.mutedText}>All trays are placed in blocks.</p>
            ) : (
              <ResponsiveList
                items={summary.unplaced_trays}
                getKey={(tray) => tray.tray_id}
                columns={[
                  { key: "tray", label: "Tray", render: (tray) => tray.tray_name },
                  {
                    key: "occupancy",
                    label: "Occupancy",
                    render: (tray) => `${tray.current_count}/${tray.capacity}`,
                  },
                  {
                    key: "recipe",
                    label: "Tray recipe",
                    render: (tray) => tray.assigned_recipe_code || "Missing",
                  },
                  {
                    key: "target",
                    label: "Destination block",
                    render: (tray) => {
                      const trayDetail = trayById.get(tray.tray_id);
                      const compatibleBlocks = blocks.filter((block) =>
                        (compatibleBlockIdsByTray.get(tray.tray_id) || []).includes(block.id),
                      );
                      return (
                        <div className={styles.actions}>
                          <select
                            className={styles.select}
                            value={blockSelectionByTray[tray.tray_id] || ""}
                            onChange={(event) =>
                              setBlockSelectionByTray((current) => ({
                                ...current,
                                [tray.tray_id]: event.target.value,
                              }))
                            }
                            disabled={compatibleBlocks.length === 0}
                          >
                            <option value="">Select block</option>
                            {compatibleBlocks.map((block) => (
                              <option key={block.id} value={block.id}>
                                {block.label}
                              </option>
                            ))}
                          </select>
                          <button
                            className={styles.buttonSecondary}
                            type="button"
                            disabled={saving || placementLocked || compatibleBlocks.length === 0}
                            onClick={() => void placeTrayIntoBlock(tray.tray_id)}
                          >
                            Place tray
                          </button>
                          {compatibleBlocks.length === 0 ? (
                            <span className={styles.inlineNote}>
                              No compatible destination blocks for this tray. All compatible blocks are occupied or restricted by tent species rules.
                              <Link href={`/experiments/${experimentId}/slots`}> Adjust tent restrictions</Link>.
                              {trayDetail?.plants.length
                                ? ` Offending species: ${Array.from(
                                    new Set(trayDetail.plants.map((item) => item.species_name)),
                                  )
                                    .slice(0, 3)
                                    .join(", ")}.`
                                : ""}
                            </span>
                          ) : null}
                        </div>
                      );
                    },
                  },
                ]}
                renderMobileCard={(tray) => {
                  const trayDetail = trayById.get(tray.tray_id);
                  const compatibleBlocks = blocks.filter((block) =>
                    (compatibleBlockIdsByTray.get(tray.tray_id) || []).includes(block.id),
                  );
                  return (
                    <div className={styles.cardKeyValue}>
                      <span>Tray</span>
                      <strong>{tray.tray_name}</strong>
                      <span>Occupancy</span>
                      <strong>{tray.current_count}/{tray.capacity}</strong>
                      <span>Tray recipe</span>
                      <strong>{tray.assigned_recipe_code || "Missing"}</strong>
                      <select
                        className={styles.select}
                        value={blockSelectionByTray[tray.tray_id] || ""}
                        onChange={(event) =>
                          setBlockSelectionByTray((current) => ({
                            ...current,
                            [tray.tray_id]: event.target.value,
                          }))
                        }
                        disabled={compatibleBlocks.length === 0}
                      >
                        <option value="">Select block</option>
                        {compatibleBlocks.map((block) => (
                          <option key={block.id} value={block.id}>
                            {block.label}
                          </option>
                        ))}
                      </select>
                      {compatibleBlocks.length === 0 ? (
                        <span className={styles.inlineNote}>
                          No compatible destination blocks for this tray. All compatible blocks are occupied or restricted by tent species rules.
                          <Link href={`/experiments/${experimentId}/slots`}> Adjust tent restrictions</Link>.
                          {trayDetail?.plants.length
                            ? ` Offending species: ${Array.from(
                                new Set(trayDetail.plants.map((item) => item.species_name)),
                              )
                                .slice(0, 3)
                                .join(", ")}.`
                            : ""}
                        </span>
                      ) : null}
                      <button
                        className={styles.buttonSecondary}
                        type="button"
                        disabled={saving || placementLocked || compatibleBlocks.length === 0}
                        onClick={() => void placeTrayIntoBlock(tray.tray_id)}
                      >
                        Place tray
                      </button>
                    </div>
                  );
                }}
              />
            )}
          </SectionCard>

          <SectionCard title="Trays">
            <div id="trays" />
            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Tray name</span>
                <input
                  className={styles.input}
                  value={newTrayName}
                  placeholder={trayNameSuggestion}
                  onChange={(event) => setNewTrayName(event.target.value)}
                  disabled={saving || placementLocked}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>How many plants fit in this tray?</span>
                <div className={styles.actions}>
                  {[1, 2, 4, 6, 8].map((capacity) => (
                    <button
                      key={capacity}
                      className={styles.buttonSecondary}
                      type="button"
                      disabled={saving || placementLocked}
                      onClick={() => setNewTrayCapacity(capacity)}
                    >
                      {capacity}
                    </button>
                  ))}
                </div>
                <input
                  className={styles.input}
                  type="number"
                  min={1}
                  value={newTrayCapacity}
                  onChange={(event) =>
                    setNewTrayCapacity(Math.max(1, Number(event.target.value) || 1))
                  }
                  disabled={saving || placementLocked}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Block (optional)</span>
                <select
                  className={styles.select}
                  value={newTrayBlockId}
                  onChange={(event) => setNewTrayBlockId(event.target.value)}
                  disabled={saving || placementLocked}
                >
                  <option value="">No block</option>
                  {availableBlocksForNewTray.map((block) => (
                    <option key={block.id} value={block.id}>
                      {block.label}
                    </option>
                  ))}
                </select>
                {availableBlocksForNewTray.length === 0 ? (
                  <span className={styles.inlineNote}>
                    All blocks already have a tray. Each block can contain only one tray.
                  </span>
                ) : null}
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Tray recipe (optional)</span>
                <select
                  className={styles.select}
                  value={newTrayRecipeId}
                  onChange={(event) => setNewTrayRecipeId(event.target.value)}
                  disabled={saving || placementLocked}
                >
                  <option value="">No recipe</option>
                  {recipes.map((recipe) => (
                    <option key={recipe.id} value={recipe.id}>
                      {recipe.code} - {recipe.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className={styles.buttonPrimary}
                type="button"
                disabled={saving || placementLocked}
                onClick={() => void createTray()}
              >
                Create tray
              </button>
            </div>

            <div className={styles.blocksList}>
              {summary.trays.map((tray) => {
                const expanded = expandedTrays[tray.tray_id] ?? true;
                return (
                  <article className={styles.blockRow} key={tray.tray_id}>
                    <div className={styles.actions}>
                      <strong>{tray.tray_name}</strong>
                      <span className={styles.mutedText}>{tray.tent_name || "Unplaced tent"}</span>
                      <span className={styles.mutedText}>{tray.current_count}/{tray.capacity} occupied</span>
                    </div>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Name</span>
                      <input
                        className={styles.input}
                        value={tray.tray_name}
                        disabled={saving || placementLocked}
                        onChange={(event) =>
                          setSummary((current) => {
                            if (!current) {
                              return current;
                            }
                            return {
                              ...current,
                              trays: current.trays.map((item) =>
                                item.tray_id === tray.tray_id
                                  ? { ...item, tray_name: event.target.value }
                                  : item,
                              ),
                            };
                          })
                        }
                      />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Capacity</span>
                      <input
                        className={styles.input}
                        type="number"
                        min={1}
                        value={tray.capacity}
                        disabled={saving || placementLocked}
                        onChange={(event) =>
                          setSummary((current) => {
                            if (!current) {
                              return current;
                            }
                            const nextValue = Math.max(1, Number(event.target.value) || 1);
                            return {
                              ...current,
                              trays: current.trays.map((item) =>
                                item.tray_id === tray.tray_id
                                  ? { ...item, capacity: nextValue }
                                  : item,
                              ),
                            };
                          })
                        }
                      />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Block</span>
                      <select
                        className={styles.select}
                        value={tray.block_id || ""}
                        disabled={saving || placementLocked}
                        onChange={(event) =>
                          setSummary((current) => {
                            if (!current) {
                              return current;
                            }
                            return {
                              ...current,
                              trays: current.trays.map((item) =>
                                item.tray_id === tray.tray_id
                                  ? { ...item, block_id: event.target.value || null }
                                  : item,
                              ),
                            };
                          })
                        }
                      >
                        <option value="">No block</option>
                        {blocks
                          .filter((block) => (compatibleBlockIdsByTray.get(tray.tray_id) || []).includes(block.id))
                          .map((block) => (
                          <option key={block.id} value={block.id}>
                            {block.label}
                          </option>
                          ))}
                      </select>
                      {tray.plants.length > 0 &&
                      (compatibleBlockIdsByTray.get(tray.tray_id) || []).length === 0 ? (
                        <p className={styles.inlineNote}>
                          No compatible destination blocks for this tray. All compatible blocks are occupied or restricted.
                        </p>
                      ) : null}
                    </label>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Tray recipe</span>
                      <select
                        className={styles.select}
                        value={tray.assigned_recipe_id || ""}
                        disabled={saving || placementLocked}
                        onChange={(event) =>
                          setSummary((current) => {
                            if (!current) {
                              return current;
                            }
                            const nextRecipe = recipes.find((recipe) => recipe.id === event.target.value);
                            return {
                              ...current,
                              trays: current.trays.map((item) =>
                                item.tray_id === tray.tray_id
                                  ? {
                                      ...item,
                                      assigned_recipe_id: event.target.value || null,
                                      assigned_recipe_code: nextRecipe?.code ?? null,
                                      assigned_recipe_name: nextRecipe?.name ?? null,
                                    }
                                  : item,
                              ),
                            };
                          })
                        }
                      >
                        <option value="">No recipe</option>
                        {recipes.map((recipe) => (
                          <option key={recipe.id} value={recipe.id}>
                            {recipe.code} - {recipe.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className={styles.actions}>
                      <button
                        className={styles.buttonSecondary}
                        type="button"
                        disabled={saving || placementLocked}
                        onClick={() => void saveTray(tray)}
                      >
                        Save tray
                      </button>
                      <button
                        className={styles.buttonSecondary}
                        type="button"
                        onClick={() =>
                          setExpandedTrays((current) => ({
                            ...current,
                            [tray.tray_id]: !expanded,
                          }))
                        }
                      >
                        {expanded ? "Hide plants" : "Show plants"}
                      </button>
                    </div>
                    {expanded ? (
                      <ResponsiveList
                        items={tray.plants}
                        getKey={(plant) => plant.tray_plant_id}
                        columns={[
                          {
                            key: "plant_id",
                            label: "Plant",
                            render: (plant) => (
                              <Link href={`/p/${plant.uuid}`}>{plant.plant_id || "(pending)"}</Link>
                            ),
                          },
                          {
                            key: "species",
                            label: "Species",
                            render: (plant) => plant.species_name,
                          },
                          {
                            key: "bin",
                            label: "Grade",
                            render: (plant) => plant.bin || "Missing",
                          },
                          {
                            key: "recipe",
                            label: "Tray Recipe",
                            render: (plant) =>
                              plant.assigned_recipe_code
                                ? `${plant.assigned_recipe_code}${plant.assigned_recipe_name ? ` - ${plant.assigned_recipe_name}` : ""}`
                                : "Missing",
                          },
                          {
                            key: "actions",
                            label: "Actions",
                            render: (plant) => (
                              <button
                                className={styles.buttonSecondary}
                                type="button"
                                disabled={saving || placementLocked}
                                onClick={() =>
                                  void removePlantFromTray(tray.tray_id, plant.tray_plant_id)
                                }
                              >
                                Remove
                              </button>
                            ),
                          },
                        ]}
                        renderMobileCard={(plant) => (
                          <div className={styles.cardKeyValue}>
                            <span>Plant</span>
                            <strong>
                              <Link href={`/p/${plant.uuid}`}>{plant.plant_id || "(pending)"}</Link>
                            </strong>
                            <span>Species</span>
                            <strong>{plant.species_name}</strong>
                            <span>Grade</span>
                            <strong>{plant.bin || "Missing"}</strong>
                            <span>Tray recipe</span>
                            <strong>
                              {plant.assigned_recipe_code
                                ? `${plant.assigned_recipe_code}${plant.assigned_recipe_name ? ` - ${plant.assigned_recipe_name}` : ""}`
                                : "Missing"}
                            </strong>
                            <button
                              className={styles.buttonSecondary}
                              type="button"
                              disabled={saving || placementLocked}
                              onClick={() =>
                                void removePlantFromTray(tray.tray_id, plant.tray_plant_id)
                              }
                            >
                              Remove
                            </button>
                          </div>
                        )}
                        emptyState={<p className={styles.mutedText}>No plants in this tray.</p>}
                      />
                    ) : null}
                  </article>
                );
              })}
            </div>
          </SectionCard>
        </>
      ) : null}
    </PageShell>
  );
}
