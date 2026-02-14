"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { backendFetch, backendUrl } from "@/lib/backend";
import AppMarkPlaceholder from "@/src/components/AppMarkPlaceholder";
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
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
  plant_id: string;
  cultivar: string | null;
  status: string;
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
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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

  const [saving, setSaving] = useState(false);

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
      await Promise.all([fetchSetupState(), fetchBlocks(), fetchPlants()]);
    } catch {
      setError("Unable to load setup.");
    } finally {
      setLoading(false);
    }
  }, [experimentId, fetchSetupState, fetchBlocks, fetchPlants]);

  useEffect(() => {
    void reloadPageData();
  }, [reloadPageData]);

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
      return true;
    } catch {
      setError("Unable to save environment packet.");
      return false;
    }
  }

  async function markEnvironmentComplete() {
    setSaving(true);
    setNotice("");
    setError("");
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
    } catch {
      setError("Unable to complete packet.");
    } finally {
      setSaving(false);
    }
  }

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
    } catch {
      setError("Unable to switch packet.");
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
    } catch {
      setError(`Unable to save block ${block.name}.`);
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
    } catch {
      setError("Unable to add block.");
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
      return true;
    } catch {
      setError("Unable to save plants packet settings.");
      return false;
    }
  }

  async function completePlantsPacket() {
    setSaving(true);
    setNotice("");
    setError("");
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
    } catch {
      setError("Unable to complete packet.");
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
    } catch {
      setError("Unable to add plant.");
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

      setNotice("CSV import completed.");
      setCsvText("");
      setCsvFile(null);
      await fetchPlants();
    } catch {
      setError("Unable to import CSV.");
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
    } catch {
      setError("Unable to generate IDs.");
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

  if (notInvited) {
    return (
      <div className={styles.page}>
        <main className={styles.container}>
          <AppMarkPlaceholder />
          <h1>Experiment setup</h1>
          <IllustrationPlaceholder inventoryId="ILL-001" kind="notInvited" />
        </main>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <main className={styles.container}>
        <header className={styles.header}>
          <AppMarkPlaceholder />
          <h1>Experiment setup</h1>
          <p className={styles.muted}>Experiment: {experimentId}</p>
          <div className={styles.actions}>
            <Link className={styles.secondaryButton} href="/experiments">
              Back to experiments
            </Link>
            <Link className={styles.secondaryButton} href={`/experiments/${experimentId}/plants`}>
              Plants list
            </Link>
          </div>
        </header>

        {loading ? <p>Loading...</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}
        {notice ? <p className={styles.success}>{notice}</p> : null}

        {!loading ? (
          <section className={styles.wizardLayout}>
            <aside className={styles.packetNav}>
              {(setupState?.packet_progress ?? FALLBACK_PACKETS).map((packet) => (
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
            </aside>

            <section>
              {currentPacket === "environment" ? (
                <div className={styles.formGrid}>
                  <h2>Packet 1: Environment</h2>

                  <label className={styles.field}>
                    Tent name
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
                    Light schedule
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
                    Light height notes
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
                    Ventilation notes
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
                    Water source
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
                    Run-in days
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
                    Notes
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

                  <h3>Blocks</h3>
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
                          className={styles.secondaryButton}
                          type="button"
                          onClick={() => saveBlock(block)}
                        >
                          Save block
                        </button>
                      </article>
                    ))}
                  </div>

                  <div className={styles.formGrid}>
                    <h4>Add block</h4>
                    <input
                      className={styles.input}
                      placeholder="Name (example: B5)"
                      value={newBlockName}
                      onChange={(event) => setNewBlockName(event.target.value)}
                    />
                    <textarea
                      className={styles.textarea}
                      placeholder="Description"
                      value={newBlockDescription}
                      onChange={(event) => setNewBlockDescription(event.target.value)}
                    />
                    <button
                      className={styles.secondaryButton}
                      type="button"
                      onClick={addBlock}
                    >
                      Add block
                    </button>
                  </div>

                  <div className={styles.actions}>
                    <button
                      className={styles.button}
                      type="button"
                      disabled={saving}
                      onClick={() => void saveEnvironment()}
                    >
                      Save
                    </button>
                    <button
                      className={styles.secondaryButton}
                      type="button"
                      disabled={saving}
                      onClick={() => void markEnvironmentComplete()}
                    >
                      {saving ? "Completing..." : "Mark Complete"}
                    </button>
                  </div>
                </div>
              ) : currentPacket === "plants" ? (
                <div className={styles.formGrid}>
                  <h2>Packet 2: Plants</h2>

                  <label className={styles.field}>
                    ID format notes
                    <textarea
                      className={styles.textarea}
                      value={idFormatNotes}
                      onChange={(event) => setIdFormatNotes(event.target.value)}
                    />
                  </label>

                  <div className={styles.actions}>
                    <button
                      className={styles.button}
                      type="button"
                      disabled={saving}
                      onClick={() => void savePlantsPacket()}
                    >
                      Save
                    </button>
                    <button
                      className={styles.secondaryButton}
                      type="button"
                      disabled={saving}
                      onClick={() => void completePlantsPacket()}
                    >
                      {saving ? "Completing..." : "Mark Complete"}
                    </button>
                  </div>

                  <h3>Add plants (manual)</h3>
                  <div className={styles.formGrid}>
                    <label className={styles.field}>
                      Species name
                      <input
                        className={styles.input}
                        value={manualSpeciesName}
                        onChange={(event) => setManualSpeciesName(event.target.value)}
                        placeholder="Nepenthes ventricosa"
                      />
                    </label>

                    <label className={styles.field}>
                      Category
                      <input
                        className={styles.input}
                        value={manualCategory}
                        onChange={(event) => setManualCategory(event.target.value)}
                        placeholder="nepenthes"
                      />
                    </label>

                    <label className={styles.field}>
                      Cultivar
                      <input
                        className={styles.input}
                        value={manualCultivar}
                        onChange={(event) => setManualCultivar(event.target.value)}
                      />
                    </label>

                    <label className={styles.field}>
                      Quantity
                      <input
                        className={styles.input}
                        type="number"
                        min={1}
                        value={manualQuantity}
                        onChange={(event) =>
                          setManualQuantity(Number(event.target.value) || 1)
                        }
                      />
                    </label>

                    <label className={styles.field}>
                      Plant ID (optional)
                      <input
                        className={styles.input}
                        value={manualPlantId}
                        onChange={(event) => setManualPlantId(event.target.value)}
                        placeholder="NP-001"
                      />
                    </label>

                    <label className={styles.field}>
                      Baseline notes
                      <textarea
                        className={styles.textarea}
                        value={manualBaselineNotes}
                        onChange={(event) =>
                          setManualBaselineNotes(event.target.value)
                        }
                      />
                    </label>

                    <button
                      className={styles.button}
                      type="button"
                      disabled={saving || !manualSpeciesName.trim()}
                      onClick={() => void addPlantsQuick()}
                    >
                      Add plants
                    </button>
                  </div>

                  <h3>Bulk import CSV</h3>
                  <p className={styles.muted}>
                    Columns: species_name, category, cultivar, quantity, plant_id,
                    baseline_notes
                  </p>
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
                    className={styles.secondaryButton}
                    type="button"
                    disabled={saving || (!csvFile && !csvText.trim())}
                    onClick={() => void importPlantsCsv()}
                  >
                    Import CSV
                  </button>

                  <div className={styles.actions}>
                    <button
                      className={styles.secondaryButton}
                      type="button"
                      disabled={saving || !hasPendingPlantIds}
                      onClick={() => void generateMissingIds()}
                    >
                      Generate IDs for pending plants
                    </button>
                    <button
                      className={styles.secondaryButton}
                      type="button"
                      onClick={() => downloadLabels("all")}
                    >
                      Download labels PDF
                    </button>
                  </div>

                  <h3>Plants</h3>
                  {plants.length === 0 ? (
                    <IllustrationPlaceholder
                      inventoryId="ILL-201"
                      kind="noPlants"
                    />
                  ) : (
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Plant ID</th>
                          <th>Species</th>
                          <th>Cultivar</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {plants.map((plant) => (
                          <tr key={plant.id}>
                            <td>{plant.plant_id || "(pending)"}</td>
                            <td>{plant.species_name}</td>
                            <td>{plant.cultivar || "-"}</td>
                            <td>{plant.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ) : (
                <div className={styles.formGrid}>
                  <h2>{currentPacket}</h2>
                  <p className={styles.muted}>
                    This packet is not implemented yet. Complete Packet 1 and Packet 2 first.
                  </p>
                </div>
              )}
            </section>
          </section>
        ) : null}
      </main>
    </div>
  );
}
