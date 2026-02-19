"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { backendUrl, unwrapList } from "@/lib/backend";
import { suggestPlantId } from "@/lib/id-suggestions";
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import { buttonVariants } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { NativeSelect } from "@/src/components/ui/native-select";
import PageAlerts from "@/src/components/ui/PageAlerts";
import PageShell from "@/src/components/ui/PageShell";
import ResponsiveList from "@/src/components/ui/ResponsiveList";
import SectionCard from "@/src/components/ui/SectionCard";
import { Textarea } from "@/src/components/ui/textarea";
import { api, isApiError } from "@/src/lib/api";
import { normalizeUserFacingError } from "@/src/lib/error-normalization";
import { queryKeys } from "@/src/lib/queryKeys";
import { usePageQueryState } from "@/src/lib/usePageQueryState";

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

type ExperimentPlantsPageClientProps = {
  experimentId: string;
};

export function ExperimentPlantsPageClient({ experimentId }: ExperimentPlantsPageClientProps) {
  const queryClient = useQueryClient();

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mutationOffline, setMutationOffline] = useState(false);

  const [manualSpeciesName, setManualSpeciesName] = useState("");
  const [manualCategory, setManualCategory] = useState("");
  const [manualCultivar, setManualCultivar] = useState("");
  const [manualBaselineNotes, setManualBaselineNotes] = useState("");
  const [manualPlantId, setManualPlantId] = useState("");
  const [manualQuantity, setManualQuantity] = useState(1);
  const [selectedPresetId, setSelectedPresetId] = useState("custom");

  const [csvText, setCsvText] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);

  const plantsQueryKey = queryKeys.experiment.feature(experimentId, "plants", "list");
  const plantsQuery = useQuery({
    queryKey: plantsQueryKey,
    queryFn: () => api.get<unknown>(`/api/v1/experiments/${experimentId}/plants/`),
    enabled: Boolean(experimentId),
  });

  const plantsState = usePageQueryState(plantsQuery);
  const notInvited = plantsState.errorKind === "forbidden";

  const plants = useMemo(() => {
    if (!plantsQuery.data) {
      return [] as PlantRow[];
    }
    try {
      return unwrapList<PlantRow>(plantsQuery.data);
    } catch {
      return [] as PlantRow[];
    }
  }, [plantsQuery.data]);

  const suggestedPlantId = useMemo(
    () => suggestPlantId(plants.map((plant) => plant.plant_id).filter((id) => id), manualCategory),
    [manualCategory, plants],
  );

  useEffect(() => {
    if (!manualPlantId.trim()) {
      setManualPlantId(suggestedPlantId);
    }
  }, [manualPlantId, suggestedPlantId]);

  const queryOffline = plantsState.errorKind === "offline";
  const queryError = useMemo(() => {
    if (notInvited || !plantsState.isError || queryOffline) {
      return "";
    }
    return "Unable to load plants.";
  }, [notInvited, plantsState.isError, queryOffline]);

  const saving = false;

  const addPlantsMutation = useMutation({
    mutationFn: async () => {
      const quantity = Math.max(1, Number(manualQuantity) || 1);
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

        await api.post(`/api/v1/experiments/${experimentId}/plants/bulk-import/`, {
          csv_text: `${csvHeader}\n${csvRow}`,
        });
        return { quantity };
      }

      await api.post(`/api/v1/experiments/${experimentId}/plants/`, {
        species_name: manualSpeciesName.trim(),
        category: manualCategory.trim(),
        cultivar: manualCultivar.trim(),
        baseline_notes: manualBaselineNotes.trim(),
        plant_id: manualPlantId.trim(),
      });
      return { quantity };
    },
    onMutate: () => {
      setError("");
      setNotice("");
      setMutationOffline(false);
    },
    onSuccess: async (result) => {
      setNotice(result.quantity > 1 ? `Added ${result.quantity} plants.` : "Plant added.");
      setManualSpeciesName("");
      setManualCategory("");
      setManualCultivar("");
      setManualBaselineNotes("");
      setManualPlantId("");
      setManualQuantity(1);
      setSelectedPresetId("custom");
      await queryClient.invalidateQueries({ queryKey: plantsQueryKey });
    },
    onError: (mutationError) => {
      if (isApiError(mutationError)) {
        const payload = mutationError.payload as { suggested_plant_id?: string } | undefined;
        if (payload?.suggested_plant_id) {
          setManualPlantId(payload.suggested_plant_id);
        }
      }
      const normalized = normalizeUserFacingError(mutationError, "Unable to add plants.");
      if (normalized.kind === "offline") {
        setMutationOffline(true);
      }
      setError("Unable to add plants.");
    },
  });

  const importCsvMutation = useMutation({
    mutationFn: async () => {
      if (csvFile) {
        const formData = new FormData();
        formData.append("file", csvFile);
        return api.postForm<{ created_count?: number }>(
          `/api/v1/experiments/${experimentId}/plants/bulk-import/`,
          formData,
        );
      }
      return api.post<{ created_count?: number }>(
        `/api/v1/experiments/${experimentId}/plants/bulk-import/`,
        { csv_text: csvText },
      );
    },
    onMutate: () => {
      setError("");
      setNotice("");
      setMutationOffline(false);
    },
    onSuccess: async (payload) => {
      setNotice(`Imported ${payload.created_count ?? 0} plant(s).`);
      setCsvText("");
      setCsvFile(null);
      await queryClient.invalidateQueries({ queryKey: plantsQueryKey });
    },
    onError: (mutationError) => {
      const normalized = normalizeUserFacingError(mutationError, "Unable to import CSV.");
      if (normalized.kind === "offline") {
        setMutationOffline(true);
      }
      setError("Unable to import CSV.");
    },
  });

  const generateIdsMutation = useMutation({
    mutationFn: () =>
      api.post<{ updated_count?: number }>(
        `/api/v1/experiments/${experimentId}/plants/generate-ids/`,
      ),
    onMutate: () => {
      setError("");
      setNotice("");
      setMutationOffline(false);
    },
    onSuccess: async (payload) => {
      setNotice(`Generated IDs for ${payload.updated_count ?? 0} plant(s).`);
      await queryClient.invalidateQueries({ queryKey: plantsQueryKey });
    },
    onError: (mutationError) => {
      const normalized = normalizeUserFacingError(mutationError, "Unable to generate IDs.");
      if (normalized.kind === "offline") {
        setMutationOffline(true);
      }
      setError("Unable to generate IDs.");
    },
  });

  const isSaving =
    saving || addPlantsMutation.isPending || importCsvMutation.isPending || generateIdsMutation.isPending;

  async function addPlantsQuick() {
    const quantity = Math.max(1, Number(manualQuantity) || 1);
    if (!manualSpeciesName.trim()) {
      setError("Species name is required.");
      return;
    }
    if (!experimentId) {
      return;
    }
    await addPlantsMutation.mutateAsync().catch(() => null);
    if (quantity < 1) {
      setError("Unable to add plants.");
    }
  }

  async function importPlantsCsv() {
    if (!csvText.trim() && !csvFile) {
      setError("Provide CSV text or file.");
      return;
    }
    if (!experimentId) {
      return;
    }
    await importCsvMutation.mutateAsync().catch(() => null);
  }

  async function generateMissingIds() {
    if (!experimentId) {
      return;
    }
    await generateIdsMutation.mutateAsync().catch(() => null);
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
          <PageAlerts notInvited />
        </SectionCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Plants"
      subtitle={`Experiment: ${experimentId}`}
      actions={
        <div className={"flex flex-wrap items-center gap-2"}>
          <Link className={buttonVariants({ variant: "default" })} href={`/experiments/${experimentId}/overview`}>
            ← Overview
          </Link>
        </div>
      }
    >
      <PageAlerts
        loading={plantsState.isLoading}
        loadingText="Loading plants..."
        error={error || queryError}
        notice={notice}
        offline={mutationOffline || queryOffline}
      />

      <SectionCard title="Add Plants (Manual)">
        <div className={"grid gap-3"}>
          <label className={"grid gap-2"}>
            <span className={"text-sm text-muted-foreground"}>Plant preset</span>
            <NativeSelect
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
            </NativeSelect>
          </label>
          <label className={"grid gap-2"}>
            <span className={"text-sm text-muted-foreground"}>Species name</span>
            <Input
              value={manualSpeciesName}
              onChange={(event) => setManualSpeciesName(event.target.value)}
              placeholder="Nepenthes ventricosa"
            />
          </label>
          <label className={"grid gap-2"}>
            <span className={"text-sm text-muted-foreground"}>Category</span>
            <Input
              value={manualCategory}
              onChange={(event) => setManualCategory(event.target.value)}
              placeholder="nepenthes"
            />
          </label>
          <label className={"grid gap-2"}>
            <span className={"text-sm text-muted-foreground"}>Cultivar</span>
            <Input
              value={manualCultivar}
              onChange={(event) => setManualCultivar(event.target.value)}
            />
          </label>
          <label className={"grid gap-2"}>
            <span className={"text-sm text-muted-foreground"}>Quantity</span>
            <Input
              type="number"
              min={1}
              value={manualQuantity}
              onChange={(event) => setManualQuantity(Number(event.target.value) || 1)}
            />
          </label>
          <label className={"grid gap-2"}>
            <span className={"text-sm text-muted-foreground"}>Plant ID (optional)</span>
            <Input
              value={manualPlantId}
              onChange={(event) => setManualPlantId(event.target.value)}
              placeholder={suggestedPlantId}
            />
          </label>
          <label className={"grid gap-2"}>
            <span className={"text-sm text-muted-foreground"}>Baseline notes</span>
            <Textarea
              value={manualBaselineNotes}
              onChange={(event) => setManualBaselineNotes(event.target.value)}
            />
          </label>
          <button
            className={buttonVariants({ variant: "secondary" })}
            type="button"
            disabled={isSaving || !manualSpeciesName.trim()}
            onClick={() => void addPlantsQuick()}
          >
            Add plants
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Bulk Import CSV">
        <p className={"text-sm text-muted-foreground"}>
          Columns: species_name, category, cultivar, quantity, plant_id, baseline_notes
        </p>
        <div className={"grid gap-3"}>
          <Textarea
            value={csvText}
            onChange={(event) => setCsvText(event.target.value)}
            placeholder={
              "species_name,category,cultivar,quantity,plant_id,baseline_notes\\nNepenthes alata,nepenthes,,3,,batch A"
            }
          />
          <Input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => setCsvFile(event.target.files?.[0] ?? null)}
          />
          <button
            className={buttonVariants({ variant: "secondary" })}
            type="button"
            disabled={isSaving || (!csvFile && !csvText.trim())}
            onClick={() => void importPlantsCsv()}
          >
            Import CSV
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Tools">
        <div className={"flex flex-wrap items-center gap-2"}>
          <button
            className={buttonVariants({ variant: "secondary" })}
            type="button"
            disabled={isSaving}
            onClick={() => void generateMissingIds()}
          >
            Generate IDs for pending plants
          </button>
          <button className={buttonVariants({ variant: "secondary" })} type="button" onClick={downloadLabels}>
            Download labels PDF
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Plant Inventory">
        {!plantsState.isLoading ? (
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
              <div className={"grid gap-2"}>
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
