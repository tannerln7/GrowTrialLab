"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { backendUrl, unwrapList } from "@/lib/backend";
import { suggestPlantId } from "@/lib/id-suggestions";
import { buttonVariants } from "@/src/components/ui/button";
import PageAlerts from "@/src/components/ui/PageAlerts";
import PageShell from "@/src/components/ui/PageShell";
import SectionCard from "@/src/components/ui/SectionCard";
import {
  CsvImportPanel,
  ManualAddPlantsPanel,
  PlantInventoryPanel,
  PlantsToolsPanel,
} from "@/src/features/experiments/plants/components/PlantsPanels";
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

  const addPlantsQuick = useCallback(async () => {
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
  }, [addPlantsMutation, experimentId, manualQuantity, manualSpeciesName]);

  const importPlantsCsv = useCallback(async () => {
    if (!csvText.trim() && !csvFile) {
      setError("Provide CSV text or file.");
      return;
    }
    if (!experimentId) {
      return;
    }
    await importCsvMutation.mutateAsync().catch(() => null);
  }, [csvFile, csvText, experimentId, importCsvMutation]);

  const generateMissingIds = useCallback(async () => {
    if (!experimentId) {
      return;
    }
    await generateIdsMutation.mutateAsync().catch(() => null);
  }, [experimentId, generateIdsMutation]);

  const downloadLabels = useCallback(() => {
    window.open(
      backendUrl(`/api/v1/experiments/${experimentId}/plants/labels.pdf?mode=all`),
      "_blank",
      "noopener,noreferrer",
    );
  }, [experimentId]);

  const handlePresetChange = useCallback(
    (nextPresetId: string) => {
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
    },
    [],
  );

  const manualAddModel = useMemo(
    () => ({
      selectedPresetId,
      presets: CARNIVOROUS_PLANT_PRESETS,
      manualSpeciesName,
      manualCategory,
      manualCultivar,
      manualQuantity,
      manualPlantId,
      suggestedPlantId,
      manualBaselineNotes,
      isSaving,
    }),
    [
      isSaving,
      manualBaselineNotes,
      manualCategory,
      manualCultivar,
      manualPlantId,
      manualQuantity,
      manualSpeciesName,
      selectedPresetId,
      suggestedPlantId,
    ],
  );

  const manualAddActions = useMemo(
    () => ({
      onPresetChange: handlePresetChange,
      onSpeciesNameChange: setManualSpeciesName,
      onCategoryChange: setManualCategory,
      onCultivarChange: setManualCultivar,
      onQuantityChange: (value: string) => setManualQuantity(Number(value) || 1),
      onPlantIdChange: setManualPlantId,
      onBaselineNotesChange: setManualBaselineNotes,
      onAddPlants: () => {
        void addPlantsQuick();
      },
    }),
    [addPlantsQuick, handlePresetChange],
  );

  const csvImportModel = useMemo(
    () => ({
      csvText,
      csvFileName: csvFile?.name || "",
      isSaving,
    }),
    [csvFile?.name, csvText, isSaving],
  );

  const csvImportActions = useMemo(
    () => ({
      onCsvTextChange: setCsvText,
      onCsvFileChange: setCsvFile,
      onImportCsv: () => {
        void importPlantsCsv();
      },
    }),
    [importPlantsCsv],
  );

  const toolsModel = useMemo(
    () => ({
      isSaving,
    }),
    [isSaving],
  );

  const toolsActions = useMemo(
    () => ({
      onGenerateIds: () => {
        void generateMissingIds();
      },
      onDownloadLabels: downloadLabels,
    }),
    [downloadLabels, generateMissingIds],
  );

  const inventoryModel = useMemo(
    () => ({
      plants,
      loading: plantsState.isLoading,
    }),
    [plants, plantsState.isLoading],
  );

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

      <ManualAddPlantsPanel model={manualAddModel} actions={manualAddActions} />
      <CsvImportPanel model={csvImportModel} actions={csvImportActions} />
      <PlantsToolsPanel model={toolsModel} actions={toolsActions} />
      <PlantInventoryPanel model={inventoryModel} />
    </PageShell>
  );
}
