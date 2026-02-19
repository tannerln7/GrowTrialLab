import Link from "next/link";

import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import { buttonVariants } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { NativeSelect } from "@/src/components/ui/native-select";
import ResponsiveList from "@/src/components/ui/ResponsiveList";
import SectionCard from "@/src/components/ui/SectionCard";
import { Textarea } from "@/src/components/ui/textarea";

type PlantPreset = {
  id: string;
  speciesName: string;
  category: string;
  cultivar?: string;
};

type PlantRow = {
  id: string;
  species_name: string;
  species_category: string;
  plant_id: string;
  cultivar: string | null;
  status: string;
};

type ManualAddModel = {
  selectedPresetId: string;
  presets: PlantPreset[];
  manualSpeciesName: string;
  manualCategory: string;
  manualCultivar: string;
  manualQuantity: number;
  manualPlantId: string;
  suggestedPlantId: string;
  manualBaselineNotes: string;
  isSaving: boolean;
};

type ManualAddActions = {
  onPresetChange: (presetId: string) => void;
  onSpeciesNameChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onCultivarChange: (value: string) => void;
  onQuantityChange: (value: string) => void;
  onPlantIdChange: (value: string) => void;
  onBaselineNotesChange: (value: string) => void;
  onAddPlants: () => void;
};

type CsvImportModel = {
  csvText: string;
  csvFileName: string;
  isSaving: boolean;
};

type CsvImportActions = {
  onCsvTextChange: (value: string) => void;
  onCsvFileChange: (file: File | null) => void;
  onImportCsv: () => void;
};

type ToolsModel = {
  isSaving: boolean;
};

type ToolsActions = {
  onGenerateIds: () => void;
  onDownloadLabels: () => void;
};

type InventoryModel = {
  plants: PlantRow[];
  loading: boolean;
};

export function ManualAddPlantsPanel({ model, actions }: { model: ManualAddModel; actions: ManualAddActions }) {
  return (
    <SectionCard title="Add Plants (Manual)">
      <div className={"grid gap-3"}>
        <label className={"grid gap-2"}>
          <span className={"text-sm text-muted-foreground"}>Plant preset</span>
          <NativeSelect value={model.selectedPresetId} onChange={(event) => actions.onPresetChange(event.target.value)}>
            <option value="custom">Custom (not listed)</option>
            {model.presets.map((preset) => (
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
            value={model.manualSpeciesName}
            onChange={(event) => actions.onSpeciesNameChange(event.target.value)}
            placeholder="Nepenthes ventricosa"
          />
        </label>
        <label className={"grid gap-2"}>
          <span className={"text-sm text-muted-foreground"}>Category</span>
          <Input
            value={model.manualCategory}
            onChange={(event) => actions.onCategoryChange(event.target.value)}
            placeholder="nepenthes"
          />
        </label>
        <label className={"grid gap-2"}>
          <span className={"text-sm text-muted-foreground"}>Cultivar</span>
          <Input value={model.manualCultivar} onChange={(event) => actions.onCultivarChange(event.target.value)} />
        </label>
        <label className={"grid gap-2"}>
          <span className={"text-sm text-muted-foreground"}>Quantity</span>
          <Input type="number" min={1} value={model.manualQuantity} onChange={(event) => actions.onQuantityChange(event.target.value)} />
        </label>
        <label className={"grid gap-2"}>
          <span className={"text-sm text-muted-foreground"}>Plant ID (optional)</span>
          <Input
            value={model.manualPlantId}
            onChange={(event) => actions.onPlantIdChange(event.target.value)}
            placeholder={model.suggestedPlantId}
          />
        </label>
        <label className={"grid gap-2"}>
          <span className={"text-sm text-muted-foreground"}>Baseline notes</span>
          <Textarea value={model.manualBaselineNotes} onChange={(event) => actions.onBaselineNotesChange(event.target.value)} />
        </label>
        <button
          className={buttonVariants({ variant: "secondary" })}
          type="button"
          disabled={model.isSaving || !model.manualSpeciesName.trim()}
          onClick={actions.onAddPlants}
        >
          Add plants
        </button>
      </div>
    </SectionCard>
  );
}

export function CsvImportPanel({ model, actions }: { model: CsvImportModel; actions: CsvImportActions }) {
  return (
    <SectionCard title="Bulk Import CSV">
      <p className={"text-sm text-muted-foreground"}>
        Columns: species_name, category, cultivar, quantity, plant_id, baseline_notes
      </p>
      <div className={"grid gap-3"}>
        <Textarea
          value={model.csvText}
          onChange={(event) => actions.onCsvTextChange(event.target.value)}
          placeholder={
            "species_name,category,cultivar,quantity,plant_id,baseline_notes\\nNepenthes alata,nepenthes,,3,,batch A"
          }
        />
        <Input
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => actions.onCsvFileChange(event.target.files?.[0] ?? null)}
        />
        <button
          className={buttonVariants({ variant: "secondary" })}
          type="button"
          disabled={model.isSaving || (!model.csvFileName && !model.csvText.trim())}
          onClick={actions.onImportCsv}
        >
          Import CSV
        </button>
      </div>
    </SectionCard>
  );
}

export function PlantsToolsPanel({ model, actions }: { model: ToolsModel; actions: ToolsActions }) {
  return (
    <SectionCard title="Tools">
      <div className={"flex flex-wrap items-center gap-2"}>
        <button
          className={buttonVariants({ variant: "secondary" })}
          type="button"
          disabled={model.isSaving}
          onClick={actions.onGenerateIds}
        >
          Generate IDs for pending plants
        </button>
        <button className={buttonVariants({ variant: "secondary" })} type="button" onClick={actions.onDownloadLabels}>
          Download labels PDF
        </button>
      </div>
    </SectionCard>
  );
}

export function PlantInventoryPanel({ model }: { model: InventoryModel }) {
  return (
    <SectionCard title="Plant Inventory">
      {!model.loading ? (
        <ResponsiveList
          items={model.plants}
          getKey={(plant) => plant.id}
          columns={[
            {
              key: "plant_id",
              label: "Plant ID",
              render: (plant) => <Link href={`/p/${plant.id}`}>{plant.plant_id || "(pending)"}</Link>,
            },
            {
              key: "species",
              label: "Species",
              render: (plant) => `${plant.species_name}${plant.species_category ? ` (${plant.species_category})` : ""}`,
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
  );
}
