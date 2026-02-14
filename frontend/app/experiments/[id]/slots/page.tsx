"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { backendFetch, normalizeBackendError, unwrapList } from "@/lib/backend";
import { suggestBlockName, suggestTentCode, suggestTentName } from "@/lib/id-suggestions";
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import PageShell from "@/src/components/ui/PageShell";
import SectionCard from "@/src/components/ui/SectionCard";

import styles from "../../experiments.module.css";

type Species = {
  id: string;
  name: string;
  category: string;
};

type TentBlock = {
  id: string;
  name: string;
  description: string;
  tray_count: number;
};

type Tent = {
  id: string;
  name: string;
  code: string;
  notes: string;
  allowed_species: Species[];
  blocks: TentBlock[];
};

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
  const [speciesSearch, setSpeciesSearch] = useState("");
  const [newTentName, setNewTentName] = useState("");
  const [newTentCode, setNewTentCode] = useState("");
  const [newBlockNameByTent, setNewBlockNameByTent] = useState<Record<string, string>>({});
  const [newBlockDescByTent, setNewBlockDescByTent] = useState<Record<string, string>>({});

  const filteredSpecies = useMemo(() => {
    const q = speciesSearch.trim().toLowerCase();
    if (!q) {
      return species;
    }
    return species.filter((item) => item.name.toLowerCase().includes(q));
  }, [species, speciesSearch]);

  const tentNameSuggestion = useMemo(
    () => suggestTentName(tents.map((item) => item.name)),
    [tents],
  );
  const tentCodeSuggestion = useMemo(
    () => suggestTentCode(tents.map((item) => item.code)),
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

    const tentsPayload = (await tentsResponse.json()) as Tent[];
    const speciesPayload = (await speciesResponse.json()) as unknown;
    setTents(tentsPayload);
    setSpecies(unwrapList<Species>(speciesPayload));
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
    const tentName = newTentName.trim() || tentNameSuggestion;
    const tentCode = newTentCode.trim() || tentCodeSuggestion;
    if (!tentName) {
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
          name: tentName,
          code: tentCode,
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

  async function saveTent(tent: Tent) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await backendFetch(`/api/v1/tents/${tent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: tent.name,
          code: tent.code,
          notes: tent.notes,
          allowed_species: tent.allowed_species.map((item) => item.id),
        }),
      });
      const payload = (await response.json()) as { detail?: string };
      if (!response.ok) {
        setError(payload.detail || "Unable to save tent.");
        return;
      }
      setNotice(`${tent.name} saved.`);
      await loadData();
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to save tent.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTent(tentId: string) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await backendFetch(`/api/v1/tents/${tentId}`, {
        method: "DELETE",
      });
      if (response.status === 204) {
        setNotice("Tent deleted.");
        await loadData();
        return;
      }
      const payload = (await response.json()) as { detail?: string };
      setError(payload.detail || "Unable to delete tent.");
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to delete tent.");
    } finally {
      setSaving(false);
    }
  }

  async function createTentDefaults(tentId: string) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await backendFetch(`/api/v1/tents/${tentId}/blocks/defaults`, {
        method: "POST",
      });
      const payload = (await response.json()) as { detail?: string; created_count?: number };
      if (!response.ok) {
        setError(payload.detail || "Unable to create default blocks.");
        return;
      }
      setNotice(`Default blocks ready (${payload.created_count ?? 0} created).`);
      await loadData();
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to create default blocks.");
    } finally {
      setSaving(false);
    }
  }

  async function createBlock(tentId: string) {
    const tent = tents.find((item) => item.id === tentId);
    const suggestedName = suggestBlockName(tent?.blocks.map((item) => item.name) || []);
    const blockName = (newBlockNameByTent[tentId] || suggestedName).trim();
    if (!blockName) {
      setError("Block name is required.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await backendFetch(`/api/v1/tents/${tentId}/blocks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: blockName,
          description: (newBlockDescByTent[tentId] || "").trim(),
        }),
      });
      const payload = (await response.json()) as { detail?: string; suggested_name?: string };
      if (!response.ok) {
        if (payload.suggested_name) {
          setNewBlockNameByTent((current) => ({ ...current, [tentId]: payload.suggested_name || "" }));
        }
        setError(payload.detail || "Unable to create block.");
        return;
      }
      setNotice("Block created.");
      setNewBlockNameByTent((current) => {
        const next = { ...current };
        delete next[tentId];
        return next;
      });
      setNewBlockDescByTent((current) => ({ ...current, [tentId]: "" }));
      await loadData();
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to create block.");
    } finally {
      setSaving(false);
    }
  }

  async function saveBlock(block: TentBlock) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await backendFetch(`/api/v1/blocks/${block.id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: block.description }),
      });
      const payload = (await response.json()) as { detail?: string };
      if (!response.ok) {
        setError(payload.detail || "Unable to save block.");
        return;
      }
      setNotice(`${block.name} saved.`);
      await loadData();
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to save block.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteBlock(blockId: string) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await backendFetch(`/api/v1/blocks/${blockId}/`, {
        method: "DELETE",
      });
      if (response.status === 204) {
        setNotice("Block deleted.");
        await loadData();
        return;
      }
      const payload = (await response.json()) as { detail?: string };
      setError(payload.detail || "Unable to delete block.");
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to delete block.");
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
      title="Tents & Slots"
      subtitle="Manage tents, species restrictions, and blocks."
      actions={
        <Link className={styles.buttonPrimary} href={`/experiments/${experimentId}/overview`}>
          ← Overview
        </Link>
      }
    >
      {loading ? <p className={styles.mutedText}>Loading tents...</p> : null}
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
              placeholder={tentNameSuggestion}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Code (optional)</span>
            <input
              className={styles.input}
              value={newTentCode}
              onChange={(event) => setNewTentCode(event.target.value)}
              placeholder={tentCodeSuggestion}
            />
          </label>
          <button className={styles.buttonPrimary} type="button" disabled={saving} onClick={() => void createTent()}>
            {saving ? "Saving..." : "Add tent"}
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Tents">
        {tents.length === 0 ? (
          <p className={styles.mutedText}>No tents yet.</p>
        ) : (
          <div className={styles.blocksList}>
            {tents.map((tent) => (
              <article className={styles.blockRow} key={tent.id}>
                <div className={styles.actions}>
                  <strong>
                    {tent.name}
                    {tent.code ? ` (${tent.code})` : ""}
                  </strong>
                  <span className={styles.mutedText}>
                    Allowed species: {tent.allowed_species.length === 0 ? "Any" : tent.allowed_species.length}
                  </span>
                </div>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Name</span>
                  <input
                    className={styles.input}
                    value={tent.name}
                    onChange={(event) =>
                      setTents((current) =>
                        current.map((item) => (item.id === tent.id ? { ...item, name: event.target.value } : item)),
                      )
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Code</span>
                  <input
                    className={styles.input}
                    value={tent.code}
                    onChange={(event) =>
                      setTents((current) =>
                        current.map((item) => (item.id === tent.id ? { ...item, code: event.target.value } : item)),
                      )
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Species restrictions</span>
                  <input
                    className={styles.input}
                    value={speciesSearch}
                    onChange={(event) => setSpeciesSearch(event.target.value)}
                    placeholder="Search species"
                  />
                  <div className={styles.checkboxGroup}>
                    {filteredSpecies.map((item) => {
                      const checked = tent.allowed_species.some((selected) => selected.id === item.id);
                      return (
                        <label className={styles.checkboxRow} key={`${tent.id}:${item.id}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) =>
                              setTents((current) =>
                                current.map((entry) => {
                                  if (entry.id !== tent.id) {
                                    return entry;
                                  }
                                  const nextSpecies = event.target.checked
                                    ? [...entry.allowed_species, item]
                                    : entry.allowed_species.filter((selected) => selected.id !== item.id);
                                  return { ...entry, allowed_species: nextSpecies };
                                }),
                              )
                            }
                          />
                          <span>{item.name}</span>
                        </label>
                      );
                    })}
                  </div>
                  <p className={styles.mutedText}>
                    Leave empty to allow any species.
                  </p>
                </label>

                <div className={styles.actions}>
                  <button className={styles.buttonSecondary} type="button" disabled={saving} onClick={() => void saveTent(tent)}>
                    Save tent
                  </button>
                  <button
                    className={styles.buttonSecondary}
                    type="button"
                    disabled={saving}
                    onClick={() => void createTentDefaults(tent.id)}
                  >
                    Create default blocks
                  </button>
                  <button className={styles.buttonDanger} type="button" disabled={saving} onClick={() => void deleteTent(tent.id)}>
                    Delete tent
                  </button>
                </div>

                <div className={styles.formGrid}>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>New block name</span>
                    <input
                      className={styles.input}
                      value={
                        newBlockNameByTent[tent.id] ??
                        suggestBlockName(tent.blocks.map((item) => item.name))
                      }
                      placeholder={suggestBlockName(tent.blocks.map((item) => item.name))}
                      onChange={(event) =>
                        setNewBlockNameByTent((current) => ({ ...current, [tent.id]: event.target.value }))
                      }
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Description</span>
                    <input
                      className={styles.input}
                      value={newBlockDescByTent[tent.id] || ""}
                      placeholder="Front-left"
                      onChange={(event) =>
                        setNewBlockDescByTent((current) => ({ ...current, [tent.id]: event.target.value }))
                      }
                    />
                  </label>
                  <button className={styles.buttonPrimary} type="button" disabled={saving} onClick={() => void createBlock(tent.id)}>
                    Add block
                  </button>
                </div>

                {tent.blocks.length === 0 ? (
                  <p className={styles.mutedText}>No blocks in this tent yet.</p>
                ) : (
                  <div className={styles.blocksList}>
                    {tent.blocks.map((block) => (
                      <article className={styles.blockRow} key={block.id}>
                        <div className={styles.actions}>
                          <strong>{block.name}</strong>
                          <span className={styles.mutedText}>Trays: {block.tray_count}</span>
                        </div>
                        <textarea
                          className={styles.textarea}
                          value={block.description}
                          onChange={(event) =>
                            setTents((current) =>
                              current.map((tentItem) =>
                                tentItem.id === tent.id
                                  ? {
                                      ...tentItem,
                                      blocks: tentItem.blocks.map((entry) =>
                                        entry.id === block.id
                                          ? { ...entry, description: event.target.value }
                                          : entry,
                                      ),
                                    }
                                  : tentItem,
                              ),
                            )
                          }
                        />
                        <div className={styles.actions}>
                          <button className={styles.buttonSecondary} type="button" disabled={saving} onClick={() => void saveBlock(block)}>
                            Save block
                          </button>
                          <button className={styles.buttonDanger} type="button" disabled={saving} onClick={() => void deleteBlock(block.id)}>
                            Delete block
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </PageShell>
  );
}
