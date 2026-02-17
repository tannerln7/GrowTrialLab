"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { backendFetch, backendUrl, normalizeBackendError, unwrapList } from "@/lib/backend";
import { suggestPlantId } from "@/lib/id-suggestions";
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import PageShell from "@/src/components/ui/PageShell";
import ResponsiveList from "@/src/components/ui/ResponsiveList";
import SectionCard from "@/src/components/ui/SectionCard";


type PlantRow = {
  id: string;
  species_name: string;
  species_category: string;
  plant_id: string;
  grade: string | null;
  cultivar: string | null;
  status: string;
};

type PlantPreset = {
  id: string;
  speciesName: string;
  category: string;
  cultivar?: string;
};

const CARNIVOROUS_PLANT_PRESETS: PlantPreset[] = [
  { id: "nep-ventricosa", speciesName: "Nepenthes ventricosa", category: "nepenthes" },
  { id: "nep-alata", speciesName: "Nepenthes alata", category: "nepenthes" },
  { id: "nep-ampullaria", speciesName: "Nepenthes ampullaria", category: "nepenthes" },
  { id: "nep-maxima", speciesName: "Nepenthes maxima", category: "nepenthes" },
  { id: "nep-rajah", speciesName: "Nepenthes rajah", category: "nepenthes" },
  { id: "flytrap-typical", speciesName: "Dionaea muscipula", category: "flytrap", cultivar: "Typical" },
  { id: "flytrap-b52", speciesName: "Dionaea muscipula", category: "flytrap", cultivar: "B52" },
  { id: "drosera-capensis", speciesName: "Drosera capensis", category: "drosera" },
  { id: "drosera-aliciae", speciesName: "Drosera aliciae", category: "drosera" },
  { id: "drosera-spatulata", speciesName: "Drosera spatulata", category: "drosera" },
  { id: "sarracenia-purpurea", speciesName: "Sarracenia purpurea", category: "sarracenia" },
  { id: "sarracenia-flava", speciesName: "Sarracenia flava", category: "sarracenia" },
  { id: "pinguicula-moranensis", speciesName: "Pinguicula moranensis", category: "pinguicula" },
  { id: "pinguicula-gigantea", speciesName: "Pinguicula gigantea", category: "pinguicula" },
  { id: "cephalotus-follicularis", speciesName: "Cephalotus follicularis", category: "cephalotus" },
  { id: "utricularia-sandersonii", speciesName: "Utricularia sandersonii", category: "utricularia" },
];

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
  const [selectedPresetId, setSelectedPresetId] = useState("custom");

  const [csvText, setCsvText] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);

  const suggestedPlantId = useMemo(
    () => suggestPlantId(plants.map((plant) => plant.plant_id).filter((id) => id), manualCategory),
    [manualCategory, plants],
  );

  useEffect(() => {
    if (!manualPlantId.trim()) {
      setManualPlantId(suggestedPlantId);
    }
  }, [manualPlantId, suggestedPlantId]);

  const loadPlants = useCallback(async () => {
    const response = await backendFetch(`/api/v1/experiments/${experimentId}/plants/`);
    if (!response.ok) {
      throw new Error("Unable to load plants.");
    }
    const data = (await response.json()) as unknown;
    setPlants(unwrapList<PlantRow>(data));
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
          const payload = (await response.json()) as { detail?: string; suggested_plant_id?: string };
          if (payload.suggested_plant_id) {
            setManualPlantId(payload.suggested_plant_id);
          }
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
      setSelectedPresetId("custom");
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
        <div className={"gt-btnbar"}>
          <Link className={"gt-button gt-button--primary"} href={`/experiments/${experimentId}/overview`}>
            ← Overview
          </Link>
        </div>
      }
    >
      {loading ? <p className={"gt-text-muted"}>Loading plants...</p> : null}
      {error ? <p className={"gt-text-danger"}>{error}</p> : null}
      {notice ? <p className={"gt-text-success"}>{notice}</p> : null}
      {offline ? <IllustrationPlaceholder inventoryId="ILL-003" kind="offline" /> : null}

      <SectionCard title="Add Plants (Manual)">
        <div className={"gt-stack"}>
          <label className={"gt-col"}>
            <span className={"gt-text-muted"}>Plant preset</span>
            <select
              className={"gt-input"}
              value={selectedPresetId}
              onChange={(event) => {
                const nextPresetId = event.target.value;
                setSelectedPresetId(nextPresetId);
                if (nextPresetId === "custom") {
                  return;
                }
                const preset = CARNIVOROUS_PLANT_PRESETS.find((item) => item.id === nextPresetId);
                if (!preset) {
                  return;
                }
                setManualSpeciesName(preset.speciesName);
                setManualCategory(preset.category);
                setManualCultivar(preset.cultivar ?? "");
              }}
            >
              <option value="custom">Custom (not listed)</option>
              {CARNIVOROUS_PLANT_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.speciesName}
                  {preset.cultivar ? ` — ${preset.cultivar}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className={"gt-col"}>
            <span className={"gt-text-muted"}>Species name</span>
            <input
              className={"gt-input"}
              value={manualSpeciesName}
              onChange={(event) => setManualSpeciesName(event.target.value)}
              placeholder="Nepenthes ventricosa"
            />
          </label>
          <label className={"gt-col"}>
            <span className={"gt-text-muted"}>Category</span>
            <input
              className={"gt-input"}
              value={manualCategory}
              onChange={(event) => setManualCategory(event.target.value)}
              placeholder="nepenthes"
            />
          </label>
          <label className={"gt-col"}>
            <span className={"gt-text-muted"}>Cultivar</span>
            <input
              className={"gt-input"}
              value={manualCultivar}
              onChange={(event) => setManualCultivar(event.target.value)}
            />
          </label>
          <label className={"gt-col"}>
            <span className={"gt-text-muted"}>Quantity</span>
            <input
              className={"gt-input"}
              type="number"
              min={1}
              value={manualQuantity}
              onChange={(event) => setManualQuantity(Number(event.target.value) || 1)}
            />
          </label>
          <label className={"gt-col"}>
            <span className={"gt-text-muted"}>Plant ID (optional)</span>
            <input
              className={"gt-input"}
              value={manualPlantId}
              onChange={(event) => setManualPlantId(event.target.value)}
              placeholder={suggestedPlantId}
            />
          </label>
          <label className={"gt-col"}>
            <span className={"gt-text-muted"}>Baseline notes</span>
            <textarea
              className={"gt-textarea"}
              value={manualBaselineNotes}
              onChange={(event) => setManualBaselineNotes(event.target.value)}
            />
          </label>
          <button
            className={"gt-button gt-button--secondary"}
            type="button"
            disabled={saving || !manualSpeciesName.trim()}
            onClick={() => void addPlantsQuick()}
          >
            Add plants
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Bulk Import CSV">
        <p className={"gt-text-muted"}>
          Columns: species_name, category, cultivar, quantity, plant_id, baseline_notes
        </p>
        <div className={"gt-stack"}>
          <textarea
            className={"gt-textarea"}
            value={csvText}
            onChange={(event) => setCsvText(event.target.value)}
            placeholder={
              "species_name,category,cultivar,quantity,plant_id,baseline_notes\\nNepenthes alata,nepenthes,,3,,batch A"
            }
          />
          <input
            className={"gt-input"}
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => setCsvFile(event.target.files?.[0] ?? null)}
          />
          <button
            className={"gt-button gt-button--secondary"}
            type="button"
            disabled={saving || (!csvFile && !csvText.trim())}
            onClick={() => void importPlantsCsv()}
          >
            Import CSV
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Tools">
        <div className={"gt-btnbar"}>
          <button
            className={"gt-button gt-button--secondary"}
            type="button"
            disabled={saving}
            onClick={() => void generateMissingIds()}
          >
            Generate IDs for pending plants
          </button>
          <button className={"gt-button gt-button--secondary"} type="button" onClick={downloadLabels}>
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
              <div className={"gt-col"}>
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
