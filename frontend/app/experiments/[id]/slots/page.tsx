"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { backendFetch, normalizeBackendError, unwrapList } from "@/lib/backend";
import { suggestTentCode, suggestTentName } from "@/lib/id-suggestions";
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import PageShell from "@/src/components/ui/PageShell";
import SectionCard from "@/src/components/ui/SectionCard";

import styles from "../../experiments.module.css";

type Species = {
  id: string;
  name: string;
  category: string;
};

type Slot = {
  id: string;
  shelf_index: number;
  slot_index: number;
  code: string;
  label: string;
};

type Tent = {
  id: string;
  name: string;
  code: string;
  notes: string;
  allowed_species: Species[];
  layout: {
    schema_version: number;
    shelves: Array<{ index: number; tray_count: number }>;
  };
  slots: Slot[];
};

function buildDefaultShelves(tent: Tent): number[] {
  if (tent.layout?.schema_version === 1 && Array.isArray(tent.layout.shelves)) {
    return tent.layout.shelves.map((shelf) => shelf.tray_count);
  }
  return [4];
}

export default function ExperimentSlotsPage() {
  const params = useParams();
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
  const [offline, setOffline] = useState(false);
  const [notInvited, setNotInvited] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tents, setTents] = useState<Tent[]>([]);
  const [species, setSpecies] = useState<Species[]>([]);
  const [newTentName, setNewTentName] = useState("");
  const [newTentCode, setNewTentCode] = useState("");
  const [shelfCountsByTent, setShelfCountsByTent] = useState<Record<string, number[]>>({});

  const tentNameSuggestion = useMemo(
    () => suggestTentName(tents.map((tent) => tent.name)),
    [tents],
  );
  const tentCodeSuggestion = useMemo(
    () => suggestTentCode(tents.map((tent) => tent.code)),
    [tents],
  );

  const loadData = useCallback(async () => {
    const [tentsResponse, speciesResponse] = await Promise.all([
      backendFetch(`/api/v1/experiments/${experimentId}/tents`),
      backendFetch("/api/v1/species/"),
    ]);

    if (!tentsResponse.ok) {
      throw new Error("Unable to load tents.");
    }
    if (!speciesResponse.ok) {
      throw new Error("Unable to load species.");
    }

    const tentsPayload = (await tentsResponse.json()) as unknown;
    const speciesPayload = (await speciesResponse.json()) as unknown;
    const tentRows = unwrapList<Tent>(tentsPayload);
    setTents(tentRows);
    setSpecies(unwrapList<Species>(speciesPayload));

    setShelfCountsByTent((current) => {
      const next = { ...current };
      for (const tent of tentRows) {
        if (!next[tent.id] || next[tent.id].length === 0) {
          next[tent.id] = buildDefaultShelves(tent);
        }
      }
      return next;
    });
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

        await loadData();
      } catch (requestError) {
        const normalized = normalizeBackendError(requestError);
        if (normalized.kind === "offline") {
          setOffline(true);
        }
        setError("Unable to load tents and slots.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [experimentId, loadData]);

  useEffect(() => {
    if (!newTentName.trim()) {
      setNewTentName(tentNameSuggestion);
    }
  }, [newTentName, tentNameSuggestion]);

  useEffect(() => {
    if (!newTentCode.trim()) {
      setNewTentCode(tentCodeSuggestion);
    }
  }, [newTentCode, tentCodeSuggestion]);

  async function createTent() {
    const name = newTentName.trim() || tentNameSuggestion;
    const code = newTentCode.trim() || tentCodeSuggestion;
    if (!name) {
      setError("Tent name is required.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await backendFetch(`/api/v1/experiments/${experimentId}/tents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          code,
          allowed_species: [],
        }),
      });
      const payload = (await response.json()) as {
        detail?: string;
        suggested_name?: string;
        suggested_code?: string;
      };
      if (!response.ok) {
        if (payload.suggested_name) {
          setNewTentName(payload.suggested_name);
        }
        if (payload.suggested_code) {
          setNewTentCode(payload.suggested_code);
        }
        setError(payload.detail || "Unable to create tent.");
        return;
      }

      setNotice("Tent created.");
      setNewTentName("");
      setNewTentCode("");
      await loadData();
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to create tent.");
    } finally {
      setSaving(false);
    }
  }

  async function saveTentRestrictions(tent: Tent, allowedSpeciesIds: string[]) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await backendFetch(`/api/v1/tents/${tent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allowed_species: allowedSpeciesIds,
        }),
      });
      const payload = (await response.json()) as { detail?: string };
      if (!response.ok) {
        setError(payload.detail || "Unable to update tent restrictions.");
        return;
      }
      setNotice(`Updated restrictions for ${tent.name}.`);
      await loadData();
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to update tent restrictions.");
    } finally {
      setSaving(false);
    }
  }

  function updateShelfCount(tentId: string, shelfIndex: number, nextCount: number) {
    setShelfCountsByTent((current) => {
      const next = [...(current[tentId] || [4])];
      next[shelfIndex] = Math.max(0, nextCount);
      return { ...current, [tentId]: next };
    });
  }

  function addShelf(tentId: string) {
    setShelfCountsByTent((current) => {
      const next = [...(current[tentId] || [4]), 0];
      return { ...current, [tentId]: next };
    });
  }

  function removeShelf(tentId: string) {
    setShelfCountsByTent((current) => {
      const values = [...(current[tentId] || [4])];
      if (values.length <= 1) {
        return current;
      }
      values.pop();
      return { ...current, [tentId]: values };
    });
  }

  async function generateSlots(tentId: string) {
    const shelfCounts = shelfCountsByTent[tentId] || [4];
    const layout = {
      schema_version: 1,
      shelves: shelfCounts.map((trayCount, index) => ({
        index: index + 1,
        tray_count: Math.max(0, trayCount),
      })),
    };

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await backendFetch(`/api/v1/tents/${tentId}/slots/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout }),
      });
      const payload = (await response.json()) as {
        detail?: string;
        diagnostics?: {
          would_orphan_trays?: Array<{ tray_code: string; slot_shelf_index: number; slot_index: number }>;
        };
      };
      if (!response.ok) {
        const orphanMessage = payload.diagnostics?.would_orphan_trays?.length
          ? ` Would orphan: ${payload.diagnostics.would_orphan_trays
              .map((item) => `${item.tray_code} @ S${item.slot_shelf_index}-${item.slot_index}`)
              .join(", ")}.`
          : "";
        setError((payload.detail || "Unable to generate slots.") + orphanMessage);
        return;
      }

      setNotice("Slots generated.");
      await loadData();
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to generate slots.");
    } finally {
      setSaving(false);
    }
  }

  if (notInvited) {
    return (
      <PageShell title="Slots">
        <SectionCard>
          <IllustrationPlaceholder inventoryId="ILL-001" kind="notInvited" />
        </SectionCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Slots"
      subtitle="Configure tent shelves and generate slot grids for tray placement."
      actions={
        <Link className={styles.buttonPrimary} href={`/experiments/${experimentId}/overview`}>
          ← Overview
        </Link>
      }
    >
      {loading ? <p className={styles.mutedText}>Loading slots...</p> : null}
      {error ? <p className={styles.errorText}>{error}</p> : null}
      {notice ? <p className={styles.successText}>{notice}</p> : null}
      {offline ? <IllustrationPlaceholder inventoryId="ILL-003" kind="offline" /> : null}

      <SectionCard title="Add Tent">
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Tent name</span>
            <input
              className={styles.input}
              value={newTentName}
              onChange={(event) => setNewTentName(event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Tent code</span>
            <input
              className={styles.input}
              value={newTentCode}
              onChange={(event) => setNewTentCode(event.target.value)}
            />
          </label>
          <button className={styles.buttonPrimary} type="button" disabled={saving} onClick={() => void createTent()}>
            {saving ? "Saving..." : "Add tent"}
          </button>
        </div>
      </SectionCard>

      {tents.map((tent) => {
        const shelfCounts = shelfCountsByTent[tent.id] || buildDefaultShelves(tent);
        const totalSlots = shelfCounts.reduce((acc, value) => acc + Math.max(0, value), 0);
        const selectedSpecies = new Set(tent.allowed_species.map((item) => item.id));

        return (
          <SectionCard key={tent.id} title={`${tent.name}${tent.code ? ` (${tent.code})` : ""}`}>
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Allowed species</span>
                <div className={styles.selectionGrid}>
                  {species.map((item) => {
                    const checked = selectedSpecies.has(item.id);
                    return (
                      <label key={item.id} className={styles.checkboxRow}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            const next = new Set(selectedSpecies);
                            if (event.target.checked) {
                              next.add(item.id);
                            } else {
                              next.delete(item.id);
                            }
                            void saveTentRestrictions(tent, Array.from(next));
                          }}
                        />
                        <span>{item.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className={styles.field}>
                <span className={styles.fieldLabel}>Shelves</span>
                <div className={styles.actions}>
                  <button className={styles.buttonSecondary} type="button" onClick={() => addShelf(tent.id)}>
                    Add shelf
                  </button>
                  <button className={styles.buttonSecondary} type="button" onClick={() => removeShelf(tent.id)}>
                    Remove shelf
                  </button>
                </div>
                {shelfCounts.map((count, index) => (
                  <label className={styles.field} key={`${tent.id}-shelf-${index + 1}`}>
                    <span className={styles.fieldLabel}>Shelf {index + 1} tray count</span>
                    <input
                      className={styles.input}
                      type="number"
                      min={0}
                      value={count}
                      onChange={(event) =>
                        updateShelfCount(tent.id, index, Number.parseInt(event.target.value || "0", 10))
                      }
                    />
                  </label>
                ))}
              </div>

              <div className={styles.field}>
                <span className={styles.fieldLabel}>Live preview</span>
                <div className={styles.previewGrid}>
                  {shelfCounts.map((count, index) => (
                    <div className={styles.previewRow} key={`${tent.id}-preview-${index + 1}`}>
                      <strong className={styles.mutedText}>Shelf {index + 1}</strong>
                      <div className={styles.previewCells}>
                        {Array.from({ length: Math.max(0, count) }).map((_, slotIndex) => (
                          <span className={styles.previewCell} key={`${tent.id}-${index + 1}-${slotIndex + 1}`}>
                            {`S${index + 1}-${slotIndex + 1}`}
                          </span>
                        ))}
                        {count === 0 ? <span className={styles.mutedText}>No slots</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button
                className={styles.buttonPrimary}
                type="button"
                disabled={saving}
                onClick={() => void generateSlots(tent.id)}
              >
                {saving ? "Generating..." : `Generate slots (${totalSlots})`}
              </button>
            </div>

            <div className={styles.blocksList}>
              {tent.slots.length === 0 ? (
                <p className={styles.mutedText}>No slots generated for this tent yet.</p>
              ) : (
                tent.slots.map((slot) => (
                  <article className={styles.blockRow} key={slot.id}>
                    <strong>{slot.label}</strong>
                    <p className={styles.mutedText}>{slot.code}</p>
                  </article>
                ))
              )}
            </div>
          </SectionCard>
        );
      })}
    </PageShell>
  );
}
