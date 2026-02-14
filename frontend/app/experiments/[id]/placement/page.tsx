"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { backendFetch, normalizeBackendError, unwrapList } from "@/lib/backend";
import { fetchExperimentStatusSummary } from "@/lib/experiment-status";
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import PageShell from "@/src/components/ui/PageShell";
import ResponsiveList from "@/src/components/ui/ResponsiveList";
import SectionCard from "@/src/components/ui/SectionCard";

import styles from "../../experiments.module.css";

type PlacementPlant = {
  uuid: string;
  plant_id: string;
  species_name: string;
  bin: string | null;
  assigned_recipe_code: string | null;
};

type TrayPlant = {
  tray_plant_id: string;
  uuid: string;
  plant_id: string;
  species_name: string;
  bin: string | null;
  assigned_recipe_code: string | null;
};

type PlacementTray = {
  tray_id: string;
  name: string;
  block_id: string | null;
  block_name: string | null;
  plant_count: number;
  plants: TrayPlant[];
};

type PlacementSummary = {
  trays: PlacementTray[];
  unplaced_active_plants_count: number;
  unplaced_active_plants: PlacementPlant[];
};

type BlockOption = {
  id: string;
  name: string;
};

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
  const [blocks, setBlocks] = useState<BlockOption[]>([]);
  const [expandedTrays, setExpandedTrays] = useState<Record<string, boolean>>({});
  const [traySelectionByPlant, setTraySelectionByPlant] = useState<Record<string, string>>({});
  const [newTrayName, setNewTrayName] = useState("");
  const [newTrayBlockId, setNewTrayBlockId] = useState("");

  const loadPlacement = useCallback(async () => {
    const [summaryResponse, blocksResponse] = await Promise.all([
      backendFetch(`/api/v1/experiments/${experimentId}/placement/summary`),
      backendFetch(`/api/v1/experiments/${experimentId}/blocks/`),
    ]);
    if (!summaryResponse.ok) {
      throw new Error("Unable to load placement summary.");
    }
    if (!blocksResponse.ok) {
      throw new Error("Unable to load blocks.");
    }
    const summaryPayload = (await summaryResponse.json()) as PlacementSummary;
    const blocksPayload = (await blocksResponse.json()) as unknown;
    setSummary(summaryPayload);
    setBlocks(unwrapList<BlockOption>(blocksPayload));
    return summaryPayload;
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
        const statusSummary = await fetchExperimentStatusSummary(experimentId);
        if (!statusSummary) {
          setError("Unable to load placement status.");
          return;
        }
        if (!statusSummary.setup.is_complete) {
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
    if (!newTrayName.trim()) {
      setError("Tray name is required.");
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
          name: newTrayName.trim(),
          block_id: newTrayBlockId || null,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { detail?: string };
        setError(payload.detail || "Unable to create tray.");
        return;
      }
      setNewTrayName("");
      setNewTrayBlockId("");
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
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await backendFetch(`/api/v1/trays/${tray.tray_id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: tray.name,
          block: tray.block_id || null,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { detail?: string };
        setError(payload.detail || "Unable to save tray.");
        return;
      }
      setNotice(`${tray.name} saved.`);
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
    const trayId = traySelectionByPlant[plantUuid];
    if (!trayId) {
      setError("Select a tray first.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
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

  async function removePlantFromTray(trayId: string, trayPlantId: string) {
    setSaving(true);
    setError("");
    setNotice("");
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
      subtitle="Assign plants to trays (physical containers)."
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

      {summary ? (
        <>
          <SectionCard title="Unplaced Plants">
            <p className={styles.mutedText}>
              Unplaced active plants: {summary.unplaced_active_plants_count}
            </p>
            <ResponsiveList
              items={summary.unplaced_active_plants}
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
                { key: "bin", label: "Bin", render: (plant) => plant.bin || "Missing" },
                {
                  key: "group",
                  label: "Group",
                  render: (plant) => plant.assigned_recipe_code || "Missing",
                },
                {
                  key: "action",
                  label: "Action",
                  render: (plant) => (
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
                      >
                        <option value="">Select tray</option>
                        {summary.trays.map((tray) => (
                          <option key={tray.tray_id} value={tray.tray_id}>
                            {tray.name}
                          </option>
                        ))}
                      </select>
                      <button
                        className={styles.buttonSecondary}
                        type="button"
                        disabled={saving || summary.trays.length === 0}
                        onClick={() => void addPlantToTray(plant.uuid)}
                      >
                        Add to tray
                      </button>
                    </div>
                  ),
                },
              ]}
              renderMobileCard={(plant) => (
                <div className={styles.cardKeyValue}>
                  <span>Plant ID</span>
                  <strong>
                    <Link href={`/p/${plant.uuid}`}>{plant.plant_id || "(pending)"}</Link>
                  </strong>
                  <span>Species</span>
                  <strong>{plant.species_name}</strong>
                  <span>Bin</span>
                  <strong>{plant.bin || "Missing"}</strong>
                  <span>Group</span>
                  <strong>{plant.assigned_recipe_code || "Missing"}</strong>
                  <select
                    className={styles.select}
                    value={traySelectionByPlant[plant.uuid] || ""}
                    onChange={(event) =>
                      setTraySelectionByPlant((current) => ({
                        ...current,
                        [plant.uuid]: event.target.value,
                      }))
                    }
                  >
                    <option value="">Select tray</option>
                    {summary.trays.map((tray) => (
                      <option key={tray.tray_id} value={tray.tray_id}>
                        {tray.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className={styles.buttonSecondary}
                    type="button"
                    disabled={saving || summary.trays.length === 0}
                    onClick={() => void addPlantToTray(plant.uuid)}
                  >
                    Add to tray
                  </button>
                </div>
              )}
              emptyState={
                <p className={styles.mutedText}>
                  {summary.unplaced_active_plants_count === 0
                    ? "All active plants are placed."
                    : "No unplaced plants in this page window."}
                </p>
              }
            />
          </SectionCard>

          <SectionCard title="Trays">
            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Tray name</span>
                <input
                  className={styles.input}
                  value={newTrayName}
                  placeholder="T1"
                  onChange={(event) => setNewTrayName(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Block (optional)</span>
                <select
                  className={styles.select}
                  value={newTrayBlockId}
                  onChange={(event) => setNewTrayBlockId(event.target.value)}
                >
                  <option value="">No block</option>
                  {blocks.map((block) => (
                    <option key={block.id} value={block.id}>
                      {block.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className={styles.buttonPrimary}
                type="button"
                disabled={saving}
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
                      <strong>{tray.name}</strong>
                      <span className={styles.mutedText}>{tray.plant_count} plant(s)</span>
                    </div>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Name</span>
                      <input
                        className={styles.input}
                        value={tray.name}
                        onChange={(event) =>
                          setSummary((current) => {
                            if (!current) {
                              return current;
                            }
                            return {
                              ...current,
                              trays: current.trays.map((item) =>
                                item.tray_id === tray.tray_id
                                  ? { ...item, name: event.target.value }
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
                        {blocks.map((block) => (
                          <option key={block.id} value={block.id}>
                            {block.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className={styles.actions}>
                      <button
                        className={styles.buttonSecondary}
                        type="button"
                        disabled={saving}
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
                            label: "Bin",
                            render: (plant) => plant.bin || "Missing",
                          },
                          {
                            key: "group",
                            label: "Group",
                            render: (plant) => plant.assigned_recipe_code || "Missing",
                          },
                          {
                            key: "actions",
                            label: "Actions",
                            render: (plant) => (
                              <button
                                className={styles.buttonSecondary}
                                type="button"
                                disabled={saving}
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
                            <span>Bin</span>
                            <strong>{plant.bin || "Missing"}</strong>
                            <span>Group</span>
                            <strong>{plant.assigned_recipe_code || "Missing"}</strong>
                            <button
                              className={styles.buttonSecondary}
                              type="button"
                              disabled={saving}
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
