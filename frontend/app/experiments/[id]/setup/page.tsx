"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { backendFetch, backendUrl, normalizeBackendError } from "@/lib/backend";
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import PageShell from "@/src/components/ui/PageShell";
import ResponsiveList from "@/src/components/ui/ResponsiveList";
import SectionCard from "@/src/components/ui/SectionCard";
import StickyActionBar from "@/src/components/ui/StickyActionBar";

import styles from "../../experiments.module.css";

type PacketProgress = {
  id: string;
  name: string;
  status: "done" | "current" | "todo";
  locked: boolean;
};

type SetupState = {
  current_packet: string;
  completed_packets: string[];
  packet_data: Record<string, unknown>;
  packet_progress: PacketProgress[];
};

type Block = {
  id: string;
  name: string;
  description: string;
};

type PlantRow = {
  id: string;
  species_name: string;
  species_category: string;
  plant_id: string;
  bin: string | null;
  cultivar: string | null;
  status: string;
};

type BaselinePlantStatus = {
  id: string;
  plant_id: string;
  species_name: string;
  species_category: string;
  bin: string | null;
  baseline_done: boolean;
};

type BaselineStatus = {
  total_plants: number;
  baseline_completed: number;
  bins_assigned: number;
  photos_count: number;
  baseline_locked: boolean;
  plants: BaselinePlantStatus[];
};

type EnvironmentForm = {
  tent_name: string;
  light_schedule: string;
  light_height_notes: string;
  ventilation_notes: string;
  water_source: string;
  run_in_days: number;
  notes: string;
};

const DEFAULT_ENV: EnvironmentForm = {
  tent_name: "",
  light_schedule: "",
  light_height_notes: "",
  ventilation_notes: "",
  water_source: "",
  run_in_days: 14,
  notes: "",
};

const FALLBACK_PACKETS: PacketProgress[] = [
  { id: "environment", name: "Environment", status: "current", locked: false },
  { id: "plants", name: "Plants", status: "todo", locked: false },
  { id: "baseline", name: "Baseline", status: "todo", locked: false },
  { id: "groups", name: "Groups", status: "todo", locked: false },
  { id: "trays", name: "Trays", status: "todo", locked: false },
  { id: "rotation", name: "Rotation", status: "todo", locked: false },
  { id: "feeding", name: "Feeding", status: "todo", locked: false },
  { id: "review", name: "Review", status: "todo", locked: false },
];

function toEnvironmentForm(value: unknown): EnvironmentForm {
  if (!value || typeof value !== "object") {
    return DEFAULT_ENV;
  }
  const payload = value as Record<string, unknown>;
  return {
    tent_name: String(payload.tent_name ?? ""),
    light_schedule: String(payload.light_schedule ?? ""),
    light_height_notes: String(payload.light_height_notes ?? ""),
    ventilation_notes: String(payload.ventilation_notes ?? ""),
    water_source: String(payload.water_source ?? ""),
    run_in_days: Number(payload.run_in_days ?? 14) || 14,
    notes: String(payload.notes ?? ""),
  };
}

export default function ExperimentSetupPage() {
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
  const [notInvited, setNotInvited] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const [setupState, setSetupState] = useState<SetupState | null>(null);
  const [currentPacket, setCurrentPacket] = useState("environment");

  const [envForm, setEnvForm] = useState<EnvironmentForm>(DEFAULT_ENV);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [newBlockName, setNewBlockName] = useState("");
  const [newBlockDescription, setNewBlockDescription] = useState("");

  const [plants, setPlants] = useState<PlantRow[]>([]);
  const [idFormatNotes, setIdFormatNotes] = useState("");
  const [manualSpeciesName, setManualSpeciesName] = useState("");
  const [manualCategory, setManualCategory] = useState("");
  const [manualCultivar, setManualCultivar] = useState("");
  const [manualBaselineNotes, setManualBaselineNotes] = useState("");
  const [manualPlantId, setManualPlantId] = useState("");
  const [manualQuantity, setManualQuantity] = useState(1);
  const [csvText, setCsvText] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [baselineStatus, setBaselineStatus] = useState<BaselineStatus | null>(null);

  function handleRequestError(
    requestError: unknown,
    fallbackMessage: string,
  ): string {
    const normalizedError = normalizeBackendError(requestError);
    if (normalizedError.kind === "offline") {
      setOffline(true);
      return "Backend is unreachable.";
    }
    return fallbackMessage;
  }

  const fetchSetupState = useCallback(async () => {
    const response = await backendFetch(
      `/api/v1/experiments/${experimentId}/setup-state/`,
    );
    if (response.status === 403) {
      setNotInvited(true);
      return null;
    }
    if (!response.ok) {
      throw new Error("Unable to load setup state.");
    }

    const data = (await response.json()) as SetupState;
    setSetupState(data);
    setCurrentPacket(data.current_packet);
    setEnvForm(toEnvironmentForm(data.packet_data?.environment));
    const plantsData = data.packet_data?.plants as
      | { id_format_notes?: string }
      | undefined;
    setIdFormatNotes(plantsData?.id_format_notes ?? "");
    return data;
  }, [experimentId]);

  const fetchBlocks = useCallback(async () => {
    const response = await backendFetch(`/api/v1/experiments/${experimentId}/blocks/`);
    if (!response.ok) {
      throw new Error("Unable to load blocks.");
    }
    const data = (await response.json()) as Block[];
    setBlocks(data);
  }, [experimentId]);

  const fetchPlants = useCallback(async () => {
    const response = await backendFetch(`/api/v1/experiments/${experimentId}/plants/`);
    if (!response.ok) {
      throw new Error("Unable to load plants.");
    }
    const data = (await response.json()) as PlantRow[];
    setPlants(data);
  }, [experimentId]);

  const fetchBaselineStatus = useCallback(async () => {
    const response = await backendFetch(
      `/api/v1/experiments/${experimentId}/baseline/status`,
    );
    if (!response.ok) {
      throw new Error("Unable to load baseline status.");
    }
    const data = (await response.json()) as BaselineStatus;
    setBaselineStatus(data);
  }, [experimentId]);

  const reloadPageData = useCallback(async () => {
    if (!experimentId) {
      return;
    }

    setLoading(true);
    setError("");
    try {
      const meResponse = await backendFetch("/api/me");
      if (meResponse.status === 403) {
        setNotInvited(true);
        return;
      }
      await Promise.all([
        fetchSetupState(),
        fetchBlocks(),
        fetchPlants(),
        fetchBaselineStatus(),
      ]);
      setOffline(false);
    } catch (requestError) {
      setError(handleRequestError(requestError, "Unable to load setup."));
    } finally {
      setLoading(false);
    }
  }, [experimentId, fetchSetupState, fetchBlocks, fetchPlants, fetchBaselineStatus]);

  useEffect(() => {
    void reloadPageData();
  }, [reloadPageData]);

  async function setPacket(packetId: string) {
    setCurrentPacket(packetId);
    setError("");
    setNotice("");

    try {
      const response = await backendFetch(
        `/api/v1/experiments/${experimentId}/setup-state/`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ current_packet: packetId }),
        },
      );
      if (!response.ok) {
        setError("Unable to switch packet.");
        return;
      }
      const data = (await response.json()) as SetupState;
      setSetupState(data);
      setCurrentPacket(data.current_packet);
    } catch (requestError) {
      setError(handleRequestError(requestError, "Unable to switch packet."));
    }
  }

  async function saveEnvironment(showNotice = true) {
    setError("");
    try {
      const response = await backendFetch(
        `/api/v1/experiments/${experimentId}/packets/environment/`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(envForm),
        },
      );
      if (!response.ok) {
        setError("Unable to save environment packet.");
        return false;
      }
      if (showNotice) {
        setNotice("Packet 1 saved.");
      }
      await fetchSetupState();
      setOffline(false);
      return true;
    } catch (requestError) {
      setError(
        handleRequestError(requestError, "Unable to save environment packet."),
      );
      return false;
    }
  }

  async function markEnvironmentComplete() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const saved = await saveEnvironment(false);
      if (!saved) {
        return;
      }

      const response = await backendFetch(
        `/api/v1/experiments/${experimentId}/packets/environment/complete/`,
        { method: "POST" },
      );
      if (!response.ok) {
        const data = (await response.json()) as {
          detail?: string;
          errors?: string[];
        };
        setError(data.errors?.join(" ") || data.detail || "Packet 1 is not complete.");
        return;
      }

      const data = (await response.json()) as SetupState;
      setSetupState(data);
      setCurrentPacket(data.current_packet);
      setNotice("Packet 1 completed.");
      setOffline(false);
    } catch (requestError) {
      setError(handleRequestError(requestError, "Unable to complete packet."));
    } finally {
      setSaving(false);
    }
  }

  async function saveBlock(block: Block) {
    setError("");
    setNotice("");

    try {
      const response = await backendFetch(`/api/v1/blocks/${block.id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: block.description }),
      });

      if (!response.ok) {
        setError(`Unable to save block ${block.name}.`);
        return;
      }

      setNotice(`Saved block ${block.name}.`);
      await fetchBlocks();
      setOffline(false);
    } catch (requestError) {
      setError(
        handleRequestError(requestError, `Unable to save block ${block.name}.`),
      );
    }
  }

  async function addBlock() {
    setError("");
    setNotice("");

    try {
      const response = await backendFetch(
        `/api/v1/experiments/${experimentId}/blocks/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: newBlockName.trim(),
            description: newBlockDescription.trim(),
          }),
        },
      );

      if (!response.ok) {
        setError("Unable to add block.");
        return;
      }

      setNewBlockName("");
      setNewBlockDescription("");
      setNotice("Block added.");
      await fetchBlocks();
      setOffline(false);
    } catch (requestError) {
      setError(handleRequestError(requestError, "Unable to add block."));
    }
  }

  async function savePlantsPacket(showNotice = true) {
    setError("");
    try {
      const response = await backendFetch(
        `/api/v1/experiments/${experimentId}/packets/plants/`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id_format_notes: idFormatNotes }),
        },
      );
      if (!response.ok) {
        setError("Unable to save plants packet settings.");
        return false;
      }

      if (showNotice) {
        setNotice("Packet 2 settings saved.");
      }
      await fetchSetupState();
      setOffline(false);
      return true;
    } catch (requestError) {
      setError(
        handleRequestError(requestError, "Unable to save plants packet settings."),
      );
      return false;
    }
  }

  async function completePlantsPacket() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const saved = await savePlantsPacket(false);
      if (!saved) {
        return;
      }

      const response = await backendFetch(
        `/api/v1/experiments/${experimentId}/packets/plants/complete/`,
        { method: "POST" },
      );
      if (!response.ok) {
        const data = (await response.json()) as {
          detail?: string;
          errors?: string[];
        };
        setError(data.errors?.join(" ") || data.detail || "Packet 2 is not complete.");
        return;
      }

      await fetchSetupState();
      setNotice("Packet 2 completed.");
      setOffline(false);
    } catch (requestError) {
      setError(handleRequestError(requestError, "Unable to complete packet."));
    } finally {
      setSaving(false);
    }
  }

  async function saveBaselinePacket(showNotice = true) {
    setError("");
    try {
      const response = await backendFetch(
        `/api/v1/experiments/${experimentId}/packets/baseline/`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      if (!response.ok) {
        setError("Unable to save baseline packet settings.");
        return false;
      }
      if (showNotice) {
        setNotice("Packet 3 settings saved.");
      }
      await fetchSetupState();
      await fetchBaselineStatus();
      setOffline(false);
      return true;
    } catch (requestError) {
      setError(
        handleRequestError(requestError, "Unable to save baseline packet settings."),
      );
      return false;
    }
  }

  async function lockBaseline() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await backendFetch(
        `/api/v1/experiments/${experimentId}/baseline/lock`,
        { method: "POST" },
      );
      if (!response.ok) {
        setError("Unable to lock baseline.");
        return;
      }
      await fetchSetupState();
      await fetchBaselineStatus();
      setNotice("Baseline locked.");
      setOffline(false);
    } catch (requestError) {
      setError(handleRequestError(requestError, "Unable to lock baseline."));
    } finally {
      setSaving(false);
    }
  }

  async function completeBaselinePacket() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const saved = await saveBaselinePacket(false);
      if (!saved) {
        return;
      }
      const response = await backendFetch(
        `/api/v1/experiments/${experimentId}/packets/baseline/complete/`,
        { method: "POST" },
      );
      if (!response.ok) {
        const data = (await response.json()) as {
          detail?: string;
          errors?: string[];
        };
        setError(data.errors?.join(" ") || data.detail || "Packet 3 is not complete.");
        return;
      }

      await fetchSetupState();
      await fetchBaselineStatus();
      setNotice("Packet 3 completed and baseline locked.");
      setOffline(false);
    } catch (requestError) {
      setError(handleRequestError(requestError, "Unable to complete packet."));
    } finally {
      setSaving(false);
    }
  }

  async function addPlantsQuick() {
    if (manualQuantity > 1 && manualPlantId.trim()) {
      setError("Manual plant_id can only be used when quantity is 1.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      for (let i = 0; i < manualQuantity; i += 1) {
        const response = await backendFetch(
          `/api/v1/experiments/${experimentId}/plants/`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              species_name: manualSpeciesName.trim(),
              category: manualCategory.trim(),
              cultivar: manualCultivar.trim(),
              baseline_notes: manualBaselineNotes.trim(),
              plant_id: i === 0 ? manualPlantId.trim() : "",
            }),
          },
        );

        if (!response.ok) {
          const payload = (await response.json()) as { detail?: string };
          setError(payload.detail ?? "Unable to add plant.");
          return;
        }
      }

      setManualPlantId("");
      setNotice("Plant(s) added.");
      await fetchPlants();
      setOffline(false);
    } catch (requestError) {
      setError(handleRequestError(requestError, "Unable to add plant."));
    } finally {
      setSaving(false);
    }
  }

  async function importPlantsCsv() {
    setSaving(true);
    setError("");
    setNotice("");

    try {
      let response: Response;
      if (csvFile) {
        const formData = new FormData();
        formData.append("file", csvFile);
        response = await backendFetch(
          `/api/v1/experiments/${experimentId}/plants/bulk-import/`,
          {
            method: "POST",
            body: formData,
          },
        );
      } else {
        response = await backendFetch(
          `/api/v1/experiments/${experimentId}/plants/bulk-import/`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ csv_text: csvText }),
          },
        );
      }

      if (!response.ok) {
        const payload = (await response.json()) as { detail?: string };
        setError(payload.detail ?? "Unable to import CSV.");
        return;
      }

      setCsvText("");
      setCsvFile(null);
      setNotice("CSV import completed.");
      await fetchPlants();
      setOffline(false);
    } catch (requestError) {
      setError(handleRequestError(requestError, "Unable to import CSV."));
    } finally {
      setSaving(false);
    }
  }

  async function generateMissingIds() {
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await backendFetch(
        `/api/v1/experiments/${experimentId}/plants/generate-ids/`,
        { method: "POST" },
      );

      if (!response.ok) {
        setError("Unable to generate IDs.");
        return;
      }

      const data = (await response.json()) as { updated_count: number };
      setNotice(`Generated IDs for ${data.updated_count} plant(s).`);
      await fetchPlants();
      setOffline(false);
    } catch (requestError) {
      setError(handleRequestError(requestError, "Unable to generate IDs."));
    } finally {
      setSaving(false);
    }
  }

  function downloadLabels(mode: "all" | "missing_ids" = "all") {
    const url = backendUrl(
      `/api/v1/experiments/${experimentId}/plants/labels.pdf?mode=${mode}`,
    );
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const hasPendingPlantIds = plants.some((plant) => !plant.plant_id);

  const packetProgress = setupState?.packet_progress ?? FALLBACK_PACKETS;

  if (notInvited) {
    return (
      <PageShell title="Experiment Setup">
        <SectionCard>
          <IllustrationPlaceholder inventoryId="ILL-001" kind="notInvited" />
        </SectionCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Experiment Setup"
      subtitle={`Experiment: ${experimentId}`}
      stickyOffset={
        currentPacket === "environment" ||
        currentPacket === "plants" ||
        currentPacket === "baseline"
      }
      actions={
        <div className={styles.actions}>
          <Link className={styles.buttonSecondary} href="/experiments">
            Back to experiments
          </Link>
          <Link
            className={styles.buttonSecondary}
            href={`/experiments/${experimentId}/baseline`}
          >
            Baseline capture
          </Link>
          <Link
            className={styles.buttonSecondary}
            href={`/experiments/${experimentId}/plants`}
          >
            Plants list
          </Link>
        </div>
      }
    >
      {loading ? <p className={styles.mutedText}>Loading setup...</p> : null}
      {error ? <p className={styles.errorText}>{error}</p> : null}
      {notice ? <p className={styles.successText}>{notice}</p> : null}
      {offline ? (
        <IllustrationPlaceholder inventoryId="ILL-003" kind="offline" />
      ) : null}

      {!loading ? (
        <section className={styles.wizardLayout}>
          <SectionCard title="Setup Packets">
            <div className={styles.packetNav}>
              {packetProgress.map((packet) => (
                <button
                  key={packet.id}
                  type="button"
                  className={`${styles.packetButton} ${
                    packet.status === "done"
                      ? styles.packetDone
                      : packet.id === currentPacket
                        ? styles.packetCurrent
                        : ""
                  }`}
                  onClick={() => setPacket(packet.id)}
                  disabled={packet.locked}
                >
                  {packet.name}
                </button>
              ))}
            </div>
          </SectionCard>

          <div className={styles.packetPanel}>
            {currentPacket === "environment" ? (
              <>
                <SectionCard title="Packet 1: Environment">
                  <div className={styles.formGrid}>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Tent name</span>
                      <input
                        className={styles.input}
                        value={envForm.tent_name}
                        onChange={(event) =>
                          setEnvForm((prev) => ({
                            ...prev,
                            tent_name: event.target.value,
                          }))
                        }
                      />
                    </label>

                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Light schedule</span>
                      <input
                        className={styles.input}
                        value={envForm.light_schedule}
                        onChange={(event) =>
                          setEnvForm((prev) => ({
                            ...prev,
                            light_schedule: event.target.value,
                          }))
                        }
                      />
                    </label>

                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Light height notes</span>
                      <input
                        className={styles.input}
                        value={envForm.light_height_notes}
                        onChange={(event) =>
                          setEnvForm((prev) => ({
                            ...prev,
                            light_height_notes: event.target.value,
                          }))
                        }
                      />
                    </label>

                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Ventilation notes</span>
                      <textarea
                        className={styles.textarea}
                        value={envForm.ventilation_notes}
                        onChange={(event) =>
                          setEnvForm((prev) => ({
                            ...prev,
                            ventilation_notes: event.target.value,
                          }))
                        }
                      />
                    </label>

                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Water source</span>
                      <input
                        className={styles.input}
                        value={envForm.water_source}
                        onChange={(event) =>
                          setEnvForm((prev) => ({
                            ...prev,
                            water_source: event.target.value,
                          }))
                        }
                      />
                    </label>

                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Run-in days</span>
                      <input
                        className={styles.input}
                        type="number"
                        min={1}
                        value={envForm.run_in_days}
                        onChange={(event) =>
                          setEnvForm((prev) => ({
                            ...prev,
                            run_in_days: Number(event.target.value) || 14,
                          }))
                        }
                      />
                    </label>

                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Notes</span>
                      <textarea
                        className={styles.textarea}
                        value={envForm.notes}
                        onChange={(event) =>
                          setEnvForm((prev) => ({
                            ...prev,
                            notes: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                </SectionCard>

                <SectionCard title="Blocks" subtitle="At least 2 blocks required.">
                  <div className={styles.blocksList}>
                    {blocks.map((block) => (
                      <article className={styles.blockRow} key={block.id}>
                        <strong>{block.name}</strong>
                        <textarea
                          className={styles.textarea}
                          value={block.description}
                          onChange={(event) =>
                            setBlocks((prev) =>
                              prev.map((item) =>
                                item.id === block.id
                                  ? { ...item, description: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                        <button
                          className={styles.buttonSecondary}
                          type="button"
                          onClick={() => saveBlock(block)}
                        >
                          Save block
                        </button>
                      </article>
                    ))}
                  </div>

                  <div className={styles.formGrid}>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>New block name</span>
                      <input
                        className={styles.input}
                        placeholder="B5"
                        value={newBlockName}
                        onChange={(event) => setNewBlockName(event.target.value)}
                      />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Description</span>
                      <textarea
                        className={styles.textarea}
                        placeholder="Placement description"
                        value={newBlockDescription}
                        onChange={(event) => setNewBlockDescription(event.target.value)}
                      />
                    </label>
                    <button
                      className={styles.buttonSecondary}
                      type="button"
                      onClick={addBlock}
                    >
                      Add block
                    </button>
                  </div>
                </SectionCard>

                <StickyActionBar>
                  <button
                    className={styles.buttonPrimary}
                    type="button"
                    disabled={saving}
                    onClick={() => void saveEnvironment()}
                  >
                    Save
                  </button>
                  <button
                    className={styles.buttonSecondary}
                    type="button"
                    disabled={saving}
                    onClick={() => void markEnvironmentComplete()}
                  >
                    {saving ? "Completing..." : "Mark Complete"}
                  </button>
                </StickyActionBar>
              </>
            ) : null}

            {currentPacket === "plants" ? (
              <>
                <SectionCard title="Packet 2: Plants">
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>ID format notes</span>
                    <textarea
                      className={styles.textarea}
                      value={idFormatNotes}
                      onChange={(event) => setIdFormatNotes(event.target.value)}
                    />
                  </label>
                </SectionCard>

                <SectionCard title="Add Plants (Manual)">
                  <div className={styles.formGrid}>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Species name</span>
                      <input
                        className={styles.input}
                        value={manualSpeciesName}
                        onChange={(event) => setManualSpeciesName(event.target.value)}
                        placeholder="Nepenthes ventricosa"
                      />
                    </label>

                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Category</span>
                      <input
                        className={styles.input}
                        value={manualCategory}
                        onChange={(event) => setManualCategory(event.target.value)}
                        placeholder="nepenthes"
                      />
                    </label>

                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Cultivar</span>
                      <input
                        className={styles.input}
                        value={manualCultivar}
                        onChange={(event) => setManualCultivar(event.target.value)}
                      />
                    </label>

                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Quantity</span>
                      <input
                        className={styles.input}
                        type="number"
                        min={1}
                        value={manualQuantity}
                        onChange={(event) => setManualQuantity(Number(event.target.value) || 1)}
                      />
                    </label>

                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Plant ID (optional)</span>
                      <input
                        className={styles.input}
                        value={manualPlantId}
                        onChange={(event) => setManualPlantId(event.target.value)}
                        placeholder="NP-001"
                      />
                    </label>

                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Baseline notes</span>
                      <textarea
                        className={styles.textarea}
                        value={manualBaselineNotes}
                        onChange={(event) => setManualBaselineNotes(event.target.value)}
                      />
                    </label>

                    <button
                      className={styles.buttonSecondary}
                      type="button"
                      disabled={saving || !manualSpeciesName.trim()}
                      onClick={() => void addPlantsQuick()}
                    >
                      Add plants
                    </button>
                  </div>
                </SectionCard>

                <SectionCard title="Bulk Import CSV">
                  <p className={styles.inlineNote}>
                    Columns: species_name, category, cultivar, quantity, plant_id,
                    baseline_notes
                  </p>
                  <div className={styles.formGrid}>
                    <textarea
                      className={styles.textarea}
                      value={csvText}
                      onChange={(event) => setCsvText(event.target.value)}
                      placeholder={
                        "species_name,category,cultivar,quantity,plant_id,baseline_notes\\nNepenthes alata,nepenthes,,3,,batch A"
                      }
                    />
                    <input
                      className={styles.input}
                      type="file"
                      accept=".csv,text/csv"
                      onChange={(event) => setCsvFile(event.target.files?.[0] ?? null)}
                    />
                    <button
                      className={styles.buttonSecondary}
                      type="button"
                      disabled={saving || (!csvFile && !csvText.trim())}
                      onClick={() => void importPlantsCsv()}
                    >
                      Import CSV
                    </button>
                  </div>
                </SectionCard>

                <SectionCard title="Tools">
                  <div className={styles.actions}>
                    <button
                      className={styles.buttonSecondary}
                      type="button"
                      disabled={saving || !hasPendingPlantIds}
                      onClick={() => void generateMissingIds()}
                    >
                      Generate IDs for pending plants
                    </button>
                    <button
                      className={styles.buttonSecondary}
                      type="button"
                      onClick={() => downloadLabels("all")}
                    >
                      Download labels PDF
                    </button>
                  </div>
                </SectionCard>

                <SectionCard title="Plants">
                  <ResponsiveList
                    items={plants}
                    getKey={(plant) => plant.id}
                    columns={[
                      {
                        key: "plant_id",
                        label: "Plant ID",
                        render: (plant) => plant.plant_id || "(pending)",
                      },
                      {
                        key: "species",
                        label: "Species",
                        render: (plant) => plant.species_name,
                      },
                      {
                        key: "cultivar",
                        label: "Cultivar",
                        render: (plant) => plant.cultivar || "-",
                      },
                      {
                        key: "status",
                        label: "Status",
                        render: (plant) => plant.status,
                      },
                    ]}
                    renderMobileCard={(plant) => (
                      <div className={styles.cardKeyValue}>
                        <span>Plant ID</span>
                        <strong>{plant.plant_id || "(pending)"}</strong>
                        <span>Species</span>
                        <strong>{plant.species_name}</strong>
                        <span>Cultivar</span>
                        <strong>{plant.cultivar || "-"}</strong>
                        <span>Status</span>
                        <strong>{plant.status}</strong>
                      </div>
                    )}
                    emptyState={
                      <IllustrationPlaceholder inventoryId="ILL-201" kind="noPlants" />
                    }
                  />
                </SectionCard>

                <StickyActionBar>
                  <button
                    className={styles.buttonPrimary}
                    type="button"
                    disabled={saving}
                    onClick={() => void savePlantsPacket()}
                  >
                    Save
                  </button>
                  <button
                    className={styles.buttonSecondary}
                    type="button"
                    disabled={saving}
                    onClick={() => void completePlantsPacket()}
                  >
                    {saving ? "Completing..." : "Mark Complete"}
                  </button>
                </StickyActionBar>
              </>
            ) : null}

            {currentPacket === "baseline" ? (
              <>
                <SectionCard title="Packet 3: Baseline">
                  {baselineStatus ? (
                    <div className={styles.formGrid}>
                      <p className={styles.mutedText}>
                        Total plants: {baselineStatus.total_plants}
                      </p>
                      <p className={styles.mutedText}>
                        Baseline captured: {baselineStatus.baseline_completed}
                      </p>
                      <p className={styles.mutedText}>
                        Bins assigned: {baselineStatus.bins_assigned}
                      </p>
                      <p className={styles.mutedText}>
                        Baseline photos: {baselineStatus.photos_count}
                      </p>
                      {baselineStatus.baseline_locked ? (
                        <p className={styles.successText}>
                          Baseline is locked in the UI to reduce accidental edits. API edits are still allowed.
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className={styles.mutedText}>Loading baseline status...</p>
                  )}

                  <div className={styles.actions}>
                    <Link
                      className={styles.buttonPrimary}
                      href={`/experiments/${experimentId}/baseline`}
                    >
                      Start Baseline Capture
                    </Link>
                  </div>
                </SectionCard>

                <SectionCard title="Baseline Progress">
                  {baselineStatus && baselineStatus.total_plants === 0 ? (
                    <IllustrationPlaceholder inventoryId="ILL-201" kind="noPlants" />
                  ) : null}
                  {baselineStatus && baselineStatus.total_plants > 0 ? (
                    <ResponsiveList
                      items={baselineStatus.plants}
                      getKey={(plant) => plant.id}
                      columns={[
                        {
                          key: "plant_id",
                          label: "Plant ID",
                          render: (plant) => plant.plant_id || "(pending)",
                        },
                        {
                          key: "species",
                          label: "Species",
                          render: (plant) => plant.species_name,
                        },
                        {
                          key: "baseline",
                          label: "Baseline",
                          render: (plant) => (plant.baseline_done ? "Done" : "Missing"),
                        },
                        {
                          key: "bin",
                          label: "Bin",
                          render: (plant) => plant.bin || "Missing",
                        },
                      ]}
                      renderMobileCard={(plant) => (
                        <div className={styles.cardKeyValue}>
                          <span>Plant ID</span>
                          <strong>{plant.plant_id || "(pending)"}</strong>
                          <span>Species</span>
                          <strong>{plant.species_name}</strong>
                          <span>Baseline</span>
                          <strong>{plant.baseline_done ? "Done" : "Missing"}</strong>
                          <span>Bin</span>
                          <strong>{plant.bin || "Missing"}</strong>
                        </div>
                      )}
                    />
                  ) : null}
                </SectionCard>

                <StickyActionBar>
                  <button
                    className={styles.buttonPrimary}
                    type="button"
                    disabled={saving}
                    onClick={() => void saveBaselinePacket()}
                  >
                    Save
                  </button>
                  <button
                    className={styles.buttonSecondary}
                    type="button"
                    disabled={saving || baselineStatus?.baseline_locked}
                    onClick={() => void lockBaseline()}
                  >
                    {saving ? "Locking..." : "Lock Baseline"}
                  </button>
                  <button
                    className={styles.buttonSecondary}
                    type="button"
                    disabled={saving}
                    onClick={() => void completeBaselinePacket()}
                  >
                    {saving ? "Completing..." : "Mark Complete"}
                  </button>
                </StickyActionBar>
              </>
            ) : null}

            {currentPacket !== "environment" &&
            currentPacket !== "plants" &&
            currentPacket !== "baseline" ? (
              <SectionCard title={currentPacket}>
                <p className={styles.mutedText}>
                  This packet is not implemented yet. Complete Packet 1 and Packet 2 first.
                </p>
              </SectionCard>
            ) : null}
          </div>
        </section>
      ) : null}
    </PageShell>
  );
}
