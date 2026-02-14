"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { backendFetch, backendUrl, normalizeBackendError } from "@/lib/backend";
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import PageShell from "@/src/components/ui/PageShell";
import ResponsiveList from "@/src/components/ui/ResponsiveList";
import SectionCard from "@/src/components/ui/SectionCard";

import styles from "../../experiments.module.css";

type PlantRow = {
  id: string;
  species_name: string;
  species_category: string;
  plant_id: string;
  bin: string | null;
  cultivar: string | null;
  status: string;
};

export default function ExperimentPlantsPage() {
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
  const [notInvited, setNotInvited] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [offline, setOffline] = useState(false);
  const [plants, setPlants] = useState<PlantRow[]>([]);

  const [manualSpeciesName, setManualSpeciesName] = useState("");
  const [manualCategory, setManualCategory] = useState("");
  const [manualCultivar, setManualCultivar] = useState("");
  const [manualBaselineNotes, setManualBaselineNotes] = useState("");
  const [manualPlantId, setManualPlantId] = useState("");
  const [manualQuantity, setManualQuantity] = useState(1);

  const [csvText, setCsvText] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);

  const loadPlants = useCallback(async () => {
    const response = await backendFetch(`/api/v1/experiments/${experimentId}/plants/`);
    if (!response.ok) {
      throw new Error("Unable to load plants.");
    }
    const data = (await response.json()) as PlantRow[];
    setPlants(data);
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
        const me = await backendFetch("/api/me");
        if (me.status === 403) {
          setNotInvited(true);
          return;
        }
        await loadPlants();
      } catch (requestError) {
        const normalizedError = normalizeBackendError(requestError);
        if (normalizedError.kind === "offline") {
          setOffline(true);
        }
        setError("Unable to load plants.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [experimentId, loadPlants]);

  async function addPlantsQuick() {
    const quantity = Math.max(1, Number(manualQuantity) || 1);
    if (!manualSpeciesName.trim()) {
      setError("Species name is required.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      if (quantity > 1 || !manualPlantId.trim()) {
        const csvHeader = "species_name,category,cultivar,quantity,baseline_notes";
        const csvRow = [
          manualSpeciesName.trim(),
          manualCategory.trim(),
          manualCultivar.trim(),
          String(quantity),
          manualBaselineNotes.trim(),
        ]
          .map((value) => value.replace(/,/g, " "))
          .join(",");

        const response = await backendFetch(
          `/api/v1/experiments/${experimentId}/plants/bulk-import/`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ csv_text: `${csvHeader}\n${csvRow}` }),
          },
        );

        if (!response.ok) {
          const payload = (await response.json()) as { detail?: string };
          setError(payload.detail || "Unable to add plants.");
          return;
        }
      } else {
        const response = await backendFetch(`/api/v1/experiments/${experimentId}/plants/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            species_name: manualSpeciesName.trim(),
            category: manualCategory.trim(),
            cultivar: manualCultivar.trim(),
            baseline_notes: manualBaselineNotes.trim(),
            plant_id: manualPlantId.trim(),
          }),
        });

        if (!response.ok) {
          const payload = (await response.json()) as { detail?: string };
          setError(payload.detail || "Unable to add plant.");
          return;
        }
      }

      setNotice(quantity > 1 ? `Added ${quantity} plants.` : "Plant added.");
      setManualSpeciesName("");
      setManualCategory("");
      setManualCultivar("");
      setManualBaselineNotes("");
      setManualPlantId("");
      setManualQuantity(1);
      await loadPlants();
    } catch (requestError) {
      const normalizedError = normalizeBackendError(requestError);
      if (normalizedError.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to add plants.");
    } finally {
      setSaving(false);
    }
  }

  async function importPlantsCsv() {
    if (!csvText.trim() && !csvFile) {
      setError("Provide CSV text or file.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const requestInit: RequestInit = { method: "POST" };
      if (csvFile) {
        const formData = new FormData();
        formData.append("file", csvFile);
        requestInit.body = formData;
      } else {
        requestInit.headers = { "Content-Type": "application/json" };
        requestInit.body = JSON.stringify({ csv_text: csvText });
      }

      const response = await backendFetch(
        `/api/v1/experiments/${experimentId}/plants/bulk-import/`,
        requestInit,
      );

      if (!response.ok) {
        const payload = (await response.json()) as { detail?: string };
        setError(payload.detail || "Unable to import CSV.");
        return;
      }

      const payload = (await response.json()) as { created_count?: number };
      setNotice(`Imported ${payload.created_count ?? 0} plant(s).`);
      setCsvText("");
      setCsvFile(null);
      await loadPlants();
    } catch (requestError) {
      const normalizedError = normalizeBackendError(requestError);
      if (normalizedError.kind === "offline") {
        setOffline(true);
      }
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
      const payload = (await response.json()) as { updated_count?: number };
      setNotice(`Generated IDs for ${payload.updated_count ?? 0} plant(s).`);
      await loadPlants();
    } catch (requestError) {
      const normalizedError = normalizeBackendError(requestError);
      if (normalizedError.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to generate IDs.");
    } finally {
      setSaving(false);
    }
  }

  function downloadLabels() {
    window.open(
      backendUrl(`/api/v1/experiments/${experimentId}/plants/labels.pdf?mode=all`),
      "_blank",
      "noopener,noreferrer",
    );
  }

  if (notInvited) {
    return (
      <PageShell title="Plants">
        <SectionCard>
          <IllustrationPlaceholder inventoryId="ILL-001" kind="notInvited" />
        </SectionCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Plants"
      subtitle={`Experiment: ${experimentId}`}
      actions={
        <div className={styles.actions}>
          <Link className={styles.buttonPrimary} href={`/experiments/${experimentId}/overview`}>
            ← Overview
          </Link>
        </div>
      }
    >
      {loading ? <p className={styles.mutedText}>Loading plants...</p> : null}
      {error ? <p className={styles.errorText}>{error}</p> : null}
      {notice ? <p className={styles.successText}>{notice}</p> : null}
      {offline ? <IllustrationPlaceholder inventoryId="ILL-003" kind="offline" /> : null}

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
          Columns: species_name, category, cultivar, quantity, plant_id, baseline_notes
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
            disabled={saving}
            onClick={() => void generateMissingIds()}
          >
            Generate IDs for pending plants
          </button>
          <button className={styles.buttonSecondary} type="button" onClick={downloadLabels}>
            Download labels PDF
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Plant Inventory">
        {!loading ? (
          <ResponsiveList
            items={plants}
            getKey={(plant) => plant.id}
            columns={[
              {
                key: "plant_id",
                label: "Plant ID",
                render: (plant) => (
                  <Link href={`/p/${plant.id}`}>{plant.plant_id || "(pending)"}</Link>
                ),
              },
              {
                key: "species",
                label: "Species",
                render: (plant) =>
                  `${plant.species_name}${plant.species_category ? ` (${plant.species_category})` : ""}`,
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
                <strong>
                  <Link href={`/p/${plant.id}`}>{plant.plant_id || "(pending)"}</Link>
                </strong>
                <span>Species</span>
                <strong>
                  {plant.species_name}
                  {plant.species_category ? ` (${plant.species_category})` : ""}
                </strong>
                <span>Cultivar</span>
                <strong>{plant.cultivar || "-"}</strong>
                <span>Status</span>
                <strong>{plant.status}</strong>
              </div>
            )}
            emptyState={<IllustrationPlaceholder inventoryId="ILL-201" kind="noPlants" />}
          />
        ) : null}
      </SectionCard>
    </PageShell>
  );
}
