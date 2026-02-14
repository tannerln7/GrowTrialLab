"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { backendFetch, normalizeBackendError } from "@/lib/backend";
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

type GroupRecipe = {
  id: string;
  code: string;
  name: string;
  notes: string;
};

type GroupSummary = {
  total_plants: number;
  assigned: number;
  unassigned: number;
  counts_by_recipe_code: Record<string, number>;
  counts_by_bin: Record<string, Record<string, number>>;
  counts_by_category: Record<string, Record<string, number>>;
};

type GroupsStatus = {
  baseline_packet_complete: boolean;
  bins_assigned: number;
  total_active_plants: number;
  groups_locked: boolean;
  packet_complete: boolean;
  recipes: GroupRecipe[];
  summary: GroupSummary;
  packet_data: {
    notes?: string;
    seed?: number;
    algorithm?: string;
    applied_at?: string;
    recipe_codes?: string[];
    locked?: boolean;
  };
};

type GroupsPreviewResponse = {
  seed: number;
  algorithm: string;
  proposed_assignments: Array<{
    plant_uuid: string;
    proposed_recipe_code: string;
  }>;
  summary: GroupSummary;
};

export default function AssignmentPage() {
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
  const [groupsStatus, setGroupsStatus] = useState<GroupsStatus | null>(null);
  const [groupsNotes, setGroupsNotes] = useState("");
  const [newRecipeCode, setNewRecipeCode] = useState("R0");
  const [newRecipeName, setNewRecipeName] = useState("Control");
  const [newRecipeNotes, setNewRecipeNotes] = useState("");
  const [groupsSeedInput, setGroupsSeedInput] = useState("");
  const [previewSeed, setPreviewSeed] = useState<number | null>(null);
  const [previewAssignments, setPreviewAssignments] = useState<
    Array<{ plant_uuid: string; proposed_recipe_code: string }>
  >([]);
  const [previewSummary, setPreviewSummary] = useState<GroupSummary | null>(null);
  const [postApplySummary, setPostApplySummary] = useState<GroupSummary | null>(null);

  const [groupsEditingUnlocked, setGroupsEditingUnlocked] = useState(false);
  const [showGroupsUnlockModal, setShowGroupsUnlockModal] = useState(false);
  const [groupsUnlockConfirmed, setGroupsUnlockConfirmed] = useState(false);

  const setupComplete = Boolean(statusSummary?.setup.is_complete);
  const groupsReadOnly = Boolean(groupsStatus?.groups_locked) && !groupsEditingUnlocked;
  const recipeCodeValid = /^R\d+$/.test(newRecipeCode.trim());
  const hasR0Recipe = (groupsStatus?.recipes ?? []).some((recipe) => recipe.code === "R0");
  const hasMinimumRecipes = (groupsStatus?.recipes ?? []).length >= 2;
  const hasActivePlants = (groupsStatus?.summary.total_plants ?? 0) > 0;
  const applyReady = setupComplete && hasR0Recipe && hasMinimumRecipes && hasActivePlants;
  const unassignedCount = groupsStatus?.summary.unassigned ?? 0;
  const activePlantCount = groupsStatus?.summary.total_plants ?? 0;
  const hasPostApplyDone = postApplySummary !== null;
  const doneHref = `/experiments/${experimentId}/overview?refresh=${Date.now()}`;
  const previewRows = Object.entries(previewSummary?.counts_by_recipe_code ?? {}).map(([code, count]) => ({
    code,
    count,
  }));
  const recipeRows = Object.entries(
    previewSummary?.counts_by_recipe_code ?? groupsStatus?.summary.counts_by_recipe_code ?? {},
  ).map(([code, count]) => ({ code, count }));
  const byBinRows = Object.entries(
    previewSummary?.counts_by_bin ?? groupsStatus?.summary.counts_by_bin ?? {},
  ).map(([bin, counts]) => ({
    bin,
    counts: Object.entries(counts)
      .map(([code, count]) => `${code}:${count}`)
      .join("  "),
  }));

  const fetchGroupsStatus = useCallback(async () => {
    const response = await backendFetch(`/api/v1/experiments/${experimentId}/groups/status`);
    if (!response.ok) {
      throw new Error("Unable to load assignment status.");
    }
    const data = (await response.json()) as GroupsStatus;
    setGroupsStatus(data);
    setGroupsNotes(data.packet_data?.notes ?? "");
    if (typeof data.packet_data?.seed === "number") {
      setGroupsSeedInput(String(data.packet_data.seed));
      setPreviewSeed(data.packet_data.seed);
    }
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

        const summary = await fetchExperimentStatusSummary(experimentId);
        if (!summary) {
          setError("Unable to load assignment prerequisites.");
          return;
        }
        setStatusSummary(summary);

        await fetchGroupsStatus();
      } catch (requestError) {
        const normalized = normalizeBackendError(requestError);
        if (normalized.kind === "offline") {
          setOffline(true);
        }
        setError("Unable to load assignment workspace.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [experimentId, fetchGroupsStatus]);

  async function saveGroupsPacket() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await backendFetch(
        `/api/v1/experiments/${experimentId}/packets/groups/`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: groupsNotes }),
        },
      );
      if (!response.ok) {
        setError("Unable to save assignment settings.");
        return;
      }
      setNotice("Assignment settings saved.");
      setPostApplySummary(null);
      await fetchGroupsStatus();
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to save assignment settings.");
    } finally {
      setSaving(false);
    }
  }

  async function addGroupRecipe() {
    if (!recipeCodeValid) {
      setError("Use recipe code format R0, R1, R2...");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await backendFetch(
        `/api/v1/experiments/${experimentId}/groups/recipes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: newRecipeCode.trim().toUpperCase(),
            name: newRecipeName.trim(),
            notes: newRecipeNotes.trim(),
          }),
        },
      );

      if (!response.ok) {
        const payload = (await response.json()) as { detail?: string };
        setError(payload.detail || "Unable to add recipe.");
        return;
      }

      setNotice("Recipe added.");
      setPostApplySummary(null);
      setNewRecipeCode("R1");
      setNewRecipeName("Treatment 1");
      setNewRecipeNotes("");
      await fetchGroupsStatus();
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to add recipe.");
    } finally {
      setSaving(false);
    }
  }

  async function saveRecipe(recipe: GroupRecipe) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await backendFetch(
        `/api/v1/experiments/${experimentId}/groups/recipes/${recipe.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: recipe.name, notes: recipe.notes }),
        },
      );
      if (!response.ok) {
        const payload = (await response.json()) as { detail?: string };
        setError(payload.detail || "Unable to update recipe.");
        return;
      }

      setNotice(`Saved ${recipe.code}.`);
      setPostApplySummary(null);
      await fetchGroupsStatus();
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to update recipe.");
    } finally {
      setSaving(false);
    }
  }

  async function previewGroups(reroll = false) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await backendFetch(
        `/api/v1/experiments/${experimentId}/groups/preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            reroll || !groupsSeedInput.trim()
              ? {}
              : { seed: Number(groupsSeedInput) },
          ),
        },
      );

      const data = (await response.json()) as
        | GroupsPreviewResponse
        | { detail?: string; errors?: string[] };

      if (!response.ok) {
        const payload = data as { detail?: string; errors?: string[] };
        setError(payload.errors?.join(" ") || payload.detail || "Unable to preview assignment.");
        return;
      }

      const preview = data as GroupsPreviewResponse;
      setPreviewSeed(preview.seed);
      setGroupsSeedInput(String(preview.seed));
      setPreviewAssignments(preview.proposed_assignments);
      setPreviewSummary(preview.summary);
      setPostApplySummary(null);
      setNotice(`Preview ready with seed ${preview.seed}.`);
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to preview assignment.");
    } finally {
      setSaving(false);
    }
  }

  async function applyGroups() {
    const seed = Number(groupsSeedInput || previewSeed || 0);
    if (!seed || seed < 1) {
      setError("Preview assignments first or provide a valid seed.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await backendFetch(
        `/api/v1/experiments/${experimentId}/groups/apply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seed }),
        },
      );
      const data = (await response.json()) as
        | { seed: number; summary: GroupSummary }
        | { detail?: string; errors?: string[] };

      if (!response.ok) {
        const payload = data as { detail?: string; errors?: string[] };
        setError(payload.errors?.join(" ") || payload.detail || "Unable to apply assignment.");
        return;
      }

      const payload = data as { seed: number; summary: GroupSummary };
      setPreviewSeed(payload.seed);
      setPreviewSummary(payload.summary);
      setPreviewAssignments([]);
      setPostApplySummary(payload.summary);
      setNotice(`Applied assignment with seed ${payload.seed}.`);
      const refreshedSummary = await fetchExperimentStatusSummary(experimentId);
      if (refreshedSummary) {
        setStatusSummary(refreshedSummary);
      }
      await fetchGroupsStatus();
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to apply assignment.");
    } finally {
      setSaving(false);
    }
  }

  async function lockAssignmentUi() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await backendFetch(
        `/api/v1/experiments/${experimentId}/packets/groups/complete/`,
        { method: "POST" },
      );
      const data = (await response.json()) as { detail?: string; errors?: string[] };
      if (!response.ok) {
        setError(data.errors?.join(" ") || data.detail || "Unable to lock assignment UI.");
        return;
      }
      setGroupsEditingUnlocked(false);
      setNotice("Assignment UI locked.");
      await fetchGroupsStatus();
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to lock assignment UI.");
    } finally {
      setSaving(false);
    }
  }

  if (notInvited) {
    return (
      <PageShell title="Assignment">
        <SectionCard>
          <IllustrationPlaceholder inventoryId="ILL-001" kind="notInvited" />
        </SectionCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Assignment"
      subtitle={`Experiment: ${experimentId}`}
      stickyOffset
      actions={
        <Link className={styles.buttonPrimary} href={`/experiments/${experimentId}/overview`}>
          ← Overview
        </Link>
      }
    >
      {loading ? <p className={styles.mutedText}>Loading assignment workspace...</p> : null}
      {error ? <p className={styles.errorText}>{error}</p> : null}
      {notice ? <p className={styles.successText}>{notice}</p> : null}
      {offline ? <IllustrationPlaceholder inventoryId="ILL-003" kind="offline" /> : null}

      {!loading && groupsStatus ? (
        <SectionCard title="Assignment Status">
          <p className={styles.mutedText}>Unassigned active plants: {unassignedCount}</p>
          <p className={styles.mutedText}>Total active plants: {activePlantCount}</p>
          {unassignedCount === 0 && activePlantCount > 0 ? (
            <div className={styles.stack}>
              <p className={styles.successText}>All plants assigned.</p>
              <button
                className={styles.buttonPrimary}
                type="button"
                onClick={() => router.push(doneHref)}
              >
                Back to Overview
              </button>
            </div>
          ) : null}
        </SectionCard>
      ) : null}

      {!loading && groupsStatus ? (
        <>
          <SectionCard title="Recipes" subtitle="Define control and treatment recipes (R0, R1, ...)">
            {!setupComplete ? (
              <p className={styles.inlineNote}>
                Recipes are part of setup. Assignments are applied after setup is complete.
              </p>
            ) : null}
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Notes</span>
              <textarea
                className={styles.textarea}
                value={groupsNotes}
                disabled={groupsReadOnly}
                onChange={(event) => setGroupsNotes(event.target.value)}
              />
            </label>

            <div className={styles.blocksList}>
              {(groupsStatus?.recipes ?? []).map((recipe) => (
                <article className={styles.blockRow} key={recipe.id}>
                  <strong>{recipe.code}</strong>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Name</span>
                    <input
                      className={styles.input}
                      value={recipe.name}
                      disabled={groupsReadOnly}
                      onChange={(event) =>
                        setGroupsStatus((prev) => {
                          if (!prev) {
                            return prev;
                          }
                          return {
                            ...prev,
                            recipes: prev.recipes.map((item) =>
                              item.id === recipe.id
                                ? { ...item, name: event.target.value }
                                : item,
                            ),
                          };
                        })
                      }
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Notes</span>
                    <textarea
                      className={styles.textarea}
                      value={recipe.notes}
                      disabled={groupsReadOnly}
                      onChange={(event) =>
                        setGroupsStatus((prev) => {
                          if (!prev) {
                            return prev;
                          }
                          return {
                            ...prev,
                            recipes: prev.recipes.map((item) =>
                              item.id === recipe.id
                                ? { ...item, notes: event.target.value }
                                : item,
                            ),
                          };
                        })
                      }
                    />
                  </label>
                  <button
                    className={styles.buttonSecondary}
                    type="button"
                    disabled={saving || groupsReadOnly}
                    onClick={() => void saveRecipe(recipe)}
                  >
                    Save recipe
                  </button>
                </article>
              ))}
            </div>

            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Recipe code</span>
                <input
                  className={styles.input}
                  placeholder="R0"
                  value={newRecipeCode}
                  disabled={groupsReadOnly}
                  onChange={(event) => setNewRecipeCode(event.target.value.toUpperCase())}
                />
              </label>
              {!recipeCodeValid && newRecipeCode.trim() ? (
                <p className={styles.errorText}>Use format R0, R1, R2...</p>
              ) : null}
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Name</span>
                <input
                  className={styles.input}
                  value={newRecipeName}
                  disabled={groupsReadOnly}
                  onChange={(event) => setNewRecipeName(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Notes</span>
                <textarea
                  className={styles.textarea}
                  value={newRecipeNotes}
                  disabled={groupsReadOnly}
                  onChange={(event) => setNewRecipeNotes(event.target.value)}
                />
              </label>
              <button
                className={styles.buttonSecondary}
                type="button"
                disabled={saving || groupsReadOnly || !recipeCodeValid}
                onClick={() => void addGroupRecipe()}
              >
                Add recipe
              </button>
            </div>
          </SectionCard>

          <SectionCard title="Preview Distribution" subtitle="Planned assignment counts by recipe">
            {previewRows.length > 0 ? (
              <ResponsiveList
                items={previewRows}
                getKey={(item) => item.code}
                columns={[
                  { key: "recipe", label: "Recipe", render: (item) => item.code },
                  { key: "count", label: "Planned Count", render: (item) => item.count },
                ]}
                renderMobileCard={(item) => (
                  <div className={styles.cardKeyValue}>
                    <span>Recipe</span>
                    <strong>{item.code}</strong>
                    <span>Planned count</span>
                    <strong>{item.count}</strong>
                  </div>
                )}
              />
            ) : (
              <p className={styles.mutedText}>Preview assignment to see planned distribution.</p>
            )}
          </SectionCard>

          <SectionCard title="Assignment" subtitle="Preview and apply stratified assignment">
            {!setupComplete ? (
              <p className={styles.inlineNote}>
                Complete plants and slots in setup before running assignment preview/apply.
              </p>
            ) : null}
            {!hasR0Recipe || !hasMinimumRecipes ? (
              <p className={styles.inlineNote}>
                Add recipes with codes R0 and at least one treatment (R1+) before applying.
              </p>
            ) : null}
            {!hasActivePlants ? (
              <p className={styles.inlineNote}>Add active plants before applying assignment.</p>
            ) : null}
            {hasPostApplyDone ? (
              <div className={styles.stack}>
                <p className={styles.successText}>
                  Assigned {postApplySummary.assigned} plants. Unassigned remaining:{" "}
                  {postApplySummary.unassigned}.
                </p>
                <button
                  className={styles.buttonPrimary}
                  type="button"
                  onClick={() => router.push(doneHref)}
                >
                  Done → Overview
                </button>
              </div>
            ) : null}
            {!hasPostApplyDone ? (
              <>
                <div className={styles.formGrid}>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Seed (optional)</span>
                    <input
                      className={styles.input}
                      type="number"
                      min={1}
                      value={groupsSeedInput}
                      disabled={groupsReadOnly || !applyReady}
                      onChange={(event) => setGroupsSeedInput(event.target.value)}
                    />
                  </label>
                </div>

                <div className={styles.actions}>
                  <button
                    className={styles.buttonPrimary}
                    type="button"
                    disabled={saving || groupsReadOnly || !applyReady}
                    onClick={() => void previewGroups()}
                  >
                    Preview assignment
                  </button>
                  <button
                    className={styles.buttonSecondary}
                    type="button"
                    disabled={saving || groupsReadOnly || !applyReady}
                    onClick={() => void applyGroups()}
                  >
                    Apply assignment
                  </button>
                  <button
                    className={styles.buttonSecondary}
                    type="button"
                    disabled={saving || groupsReadOnly || !applyReady}
                    onClick={() => {
                      setGroupsSeedInput("");
                      setPreviewSeed(null);
                      setPreviewAssignments([]);
                      void previewGroups(true);
                    }}
                  >
                    Reroll
                  </button>
                  {groupsStatus?.groups_locked ? (
                    groupsReadOnly ? (
                      <button
                        className={styles.buttonSecondary}
                        type="button"
                        onClick={() => setShowGroupsUnlockModal(true)}
                      >
                        Unlock editing
                      </button>
                    ) : (
                      <button
                        className={styles.buttonSecondary}
                        type="button"
                        onClick={() => {
                          setGroupsEditingUnlocked(false);
                          setGroupsUnlockConfirmed(false);
                        }}
                      >
                        Re-lock
                      </button>
                    )
                  ) : null}
                </div>
                {previewSeed ? (
                  <p className={styles.mutedText}>Preview seed: {previewSeed}</p>
                ) : null}
              </>
            ) : null}
            {groupsStatus?.groups_locked ? (
              <p className={styles.inlineNote}>
                Locked prevents accidental edits in the UI. API edits are still allowed.
              </p>
            ) : null}
          </SectionCard>

          <SectionCard title="Distribution Summary">
            <p className={styles.mutedText}>
              {groupsStatus
                ? `${groupsStatus.summary.assigned} assigned / ${groupsStatus.summary.total_plants} plants`
                : "No assignment data yet."}
            </p>
            <ResponsiveList
              items={recipeRows}
              getKey={(item) => item.code}
              columns={[
                { key: "recipe", label: "Recipe", render: (item) => item.code },
                { key: "count", label: "Count", render: (item) => item.count },
              ]}
              renderMobileCard={(item) => (
                <div className={styles.cardKeyValue}>
                  <span>Recipe</span>
                  <strong>{item.code}</strong>
                  <span>Count</span>
                  <strong>{item.count}</strong>
                </div>
              )}
            />
            <ResponsiveList
              items={byBinRows}
              getKey={(item) => item.bin}
              columns={[
                { key: "bin", label: "Bin", render: (item) => item.bin },
                {
                  key: "counts",
                  label: "Recipe Split",
                  render: (item) => item.counts || "-",
                },
              ]}
              renderMobileCard={(item) => (
                <div className={styles.cardKeyValue}>
                  <span>Bin</span>
                  <strong>{item.bin}</strong>
                  <span>Recipe split</span>
                  <strong>{item.counts || "-"}</strong>
                </div>
              )}
            />
            {previewAssignments.length > 0 ? (
              <ResponsiveList
                items={previewAssignments}
                getKey={(item) => item.plant_uuid}
                columns={[
                  { key: "plant", label: "Plant UUID", render: (item) => item.plant_uuid },
                  {
                    key: "recipe",
                    label: "Proposed Group",
                    render: (item) => item.proposed_recipe_code,
                  },
                ]}
                renderMobileCard={(item) => (
                  <div className={styles.cardKeyValue}>
                    <span>Plant UUID</span>
                    <strong>{item.plant_uuid}</strong>
                    <span>Proposed Group</span>
                    <strong>{item.proposed_recipe_code}</strong>
                  </div>
                )}
              />
            ) : null}
          </SectionCard>

          <StickyActionBar>
            {hasPostApplyDone ? (
              <button
                className={styles.buttonPrimary}
                type="button"
                onClick={() => router.push(doneHref)}
              >
                Done → Overview
              </button>
            ) : (
              <>
                <button
                  className={styles.buttonPrimary}
                  type="button"
                  disabled={saving || groupsReadOnly}
                  onClick={() => void saveGroupsPacket()}
                >
                  Save
                </button>
                <button
                  className={styles.buttonSecondary}
                  type="button"
                  disabled={saving || !setupComplete}
                  onClick={() => void lockAssignmentUi()}
                >
                  {saving ? "Locking..." : "Lock UI guardrail"}
                </button>
                <Link className={styles.buttonSecondary} href={`/experiments/${experimentId}/overview`}>
                  Done → Overview
                </Link>
              </>
            )}
          </StickyActionBar>
        </>
      ) : null}

      {showGroupsUnlockModal ? (
        <div className={styles.modalBackdrop} role="presentation">
          <SectionCard title="Unlock group editing">
            <p className={styles.mutedText}>
              Unlocking is local to this page session. Use this only when you need to revise
              assignments.
            </p>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={groupsUnlockConfirmed}
                onChange={(event) => setGroupsUnlockConfirmed(event.target.checked)}
              />
              <span>I understand and want to enable editing.</span>
            </label>
            <div className={styles.actions}>
              <button
                className={styles.buttonSecondary}
                type="button"
                onClick={() => {
                  setShowGroupsUnlockModal(false);
                  setGroupsUnlockConfirmed(false);
                }}
              >
                Cancel
              </button>
              <button
                className={styles.buttonDanger}
                type="button"
                disabled={!groupsUnlockConfirmed}
                onClick={() => {
                  setGroupsEditingUnlocked(true);
                  setShowGroupsUnlockModal(false);
                  setGroupsUnlockConfirmed(false);
                }}
              >
                Unlock editing
              </button>
            </div>
          </SectionCard>
        </div>
      ) : null}
    </PageShell>
  );
}
