import { ArrowRight, CheckSquare, Layers, Save, Trash2, X, type LucideIcon } from "lucide-react";
import type { FormEvent, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { NativeSelect } from "@/src/components/ui/native-select";
import SectionCard from "@/src/components/ui/SectionCard";
import StickyActionBar from "@/src/components/ui/StickyActionBar";
import { TooltipIconButton } from "@/src/components/ui/tooltip-icon-button";
import { CellChrome, CellSubtitle, CellTitle, TrayCell } from "@/src/lib/gridkit/components";
import type { ChipSpec } from "@/src/lib/gridkit/spec";

import { experimentsStyles as styles } from "@/src/components/ui/experiments-styles";

type Recipe = {
  id: string;
  code: string;
  name: string;
};

type TrayViewModel = {
  trayId: string;
  trayName: string;
  trayCode: string;
  capacity: number;
  plantIds: string[];
  selectedCount: number;
  allSelected: boolean;
};

type UnplacedViewModel = {
  plantIds: string[];
  selectedCount: number;
  allSelected: boolean;
};

type Diagnostics = {
  reason_counts?: Record<string, number>;
  invalid_updates?: Array<{ plant_id: string; reason: string }>;
} | null;

type RecipeToolsModel = {
  code: string;
  name: string;
  notes: string;
  saving: boolean;
  recipes: Recipe[];
  selectedRecipeIds: Set<string>;
};

type RecipeToolsActions = {
  onCodeChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onCreateRecipe: (event: FormEvent<HTMLFormElement>) => void;
  onToggleRecipeSelection: (recipeId: string) => void;
  onClearRecipeSelection: () => void;
  onDeleteSelectedRecipes: () => void;
};

type PlantDraftModel = {
  selectedBulkRecipeId: string;
  recipes: Recipe[];
  allPlantCount: number;
  selectedPlantCount: number;
  draftChangeCount: number;
  sameSpeciesDisabled: boolean;
  diagnostics: Diagnostics;
  trays: TrayViewModel[];
  unplaced: UnplacedViewModel | null;
};

type PlantDraftActions = {
  onBulkRecipeChange: (recipeId: string) => void;
  onSelectAllPlants: () => void;
  onSelectSameSpecies: () => void;
  onClearPlantSelection: () => void;
  onApplyRecipeToSelection: () => void;
  onRemoveRecipeFromSelection: () => void;
  onToggleContainer: (plantIds: string[]) => void;
};

type ActionBarModel = {
  draftChangeCount: number;
  saving: boolean;
};

type ActionBarActions = {
  onSaveDrafts: () => void;
  onDiscardDrafts: () => void;
};

function TrayHeaderToggle({
  onClick,
  allSelected,
  label,
  icon: Icon,
}: {
  onClick: () => void;
  allSelected: boolean;
  label: string;
  icon: LucideIcon;
}) {
  return (
    <button className={styles.trayHeaderSelect} type="button" onClick={onClick}>
      <Icon size={14} />
      {allSelected ? "Deselect" : "Select"} {label}
    </button>
  );
}

export function RecipeToolsPanel({ model, actions }: { model: RecipeToolsModel; actions: RecipeToolsActions }) {
  return (
    <SectionCard title="Recipe Tools">
      <form className={styles.recipeCreateCompact} onSubmit={actions.onCreateRecipe}>
        <Input
          value={model.code}
          onChange={(event) => actions.onCodeChange(event.target.value)}
          placeholder="Code (R0)"
          aria-label="Recipe code"
        />
        <Input
          value={model.name}
          onChange={(event) => actions.onNameChange(event.target.value)}
          placeholder="Name"
          aria-label="Recipe name"
        />
        <Input
          value={model.notes}
          onChange={(event) => actions.onNotesChange(event.target.value)}
          placeholder="Notes (optional)"
          aria-label="Recipe notes"
        />
        <button className={buttonVariants({ variant: "default" })} type="submit" disabled={model.saving}>
          {model.saving ? "Saving..." : "Create recipe"}
        </button>
      </form>

      <div className={cn(styles.toolbarSummaryRow, "flex flex-wrap items-center gap-2")}>
        <span className="text-sm text-muted-foreground">Recipes: {model.recipes.length}</span>
        <span className="text-sm text-muted-foreground">Selected: {model.selectedRecipeIds.size}</span>
        <div className={cn(styles.toolbarActionsCompact, "flex flex-wrap items-center gap-2")}>
          <TooltipIconButton
            label="Clear recipe selection"
            icon={<X size={16} />}
            onClick={actions.onClearRecipeSelection}
            disabled={model.selectedRecipeIds.size === 0}
            size="sm"
          />
          {model.selectedRecipeIds.size > 0 ? (
            <TooltipIconButton
              label="Delete selected recipes"
              icon={<Trash2 size={16} />}
              onClick={actions.onDeleteSelectedRecipes}
              variant="destructive"
              disabled={model.saving}
              size="sm"
            />
          ) : null}
        </div>
      </div>

      <div className={cn(styles.trayMainGrid, styles.cellGridResponsive)} data-cell-size="md">
        {model.recipes.map((recipe) => {
          const selected = model.selectedRecipeIds.has(recipe.id);
          const chips: ChipSpec[] = selected
            ? [
                {
                  id: `${recipe.id}-selected`,
                  label: "✓",
                  tone: "info",
                  placement: "tr",
                },
              ]
            : [];

          return (
            <CellChrome
              key={recipe.id}
              state={{ selected }}
              interactive
              onPress={() => actions.onToggleRecipeSelection(recipe.id)}
              ariaLabel={recipe.code}
              chips={chips}
              className={cn(styles.trayGridCell, styles.recipeCell)}
            >
              <CellTitle className={styles.recipeCellCode}>{recipe.code}</CellTitle>
              <CellSubtitle className={styles.recipeCellName}>{recipe.name}</CellSubtitle>
            </CellChrome>
          );
        })}
        {model.recipes.length === 0 ? <p className="text-sm text-muted-foreground">No recipes yet.</p> : null}
      </div>
    </SectionCard>
  );
}

export function RecipePlantDraftPanel({
  model,
  actions,
  recipeLabel,
  formatTrayDisplay,
  renderPlantCell,
}: {
  model: PlantDraftModel;
  actions: PlantDraftActions;
  recipeLabel: (recipe: Recipe) => string;
  formatTrayDisplay: (rawValue: string | null | undefined, fallbackValue?: string) => string;
  renderPlantCell: (plantId: string) => ReactNode;
}) {
  return (
    <SectionCard title="Plants by Tray (Draft)">
      <div className={styles.placementToolbar}>
        <NativeSelect
          className={styles.toolbarInlineSelect}
          value={model.selectedBulkRecipeId}
          onChange={(event) => actions.onBulkRecipeChange(event.target.value)}
          aria-label="Recipe for selected plants"
        >
          <option value="">Select recipe</option>
          {model.recipes.map((recipe) => (
            <option key={recipe.id} value={recipe.id}>
              {recipeLabel(recipe)}
            </option>
          ))}
        </NativeSelect>
        <div className={cn(styles.toolbarActionsCompact, "flex flex-wrap items-center gap-2")}>
          <TooltipIconButton
            label="Select all plants"
            icon={<CheckSquare size={16} />}
            onClick={actions.onSelectAllPlants}
            disabled={model.allPlantCount === 0}
            size="sm"
          />
          <TooltipIconButton
            label="Select same species"
            icon={<Layers size={16} />}
            onClick={actions.onSelectSameSpecies}
            disabled={model.sameSpeciesDisabled}
            size="sm"
          />
          <TooltipIconButton
            label="Clear plant selection"
            icon={<X size={16} />}
            onClick={actions.onClearPlantSelection}
            disabled={model.selectedPlantCount === 0}
            size="sm"
          />
          <button
            className={buttonVariants({ variant: "default" })}
            type="button"
            disabled={model.selectedPlantCount === 0 || !model.selectedBulkRecipeId}
            onClick={actions.onApplyRecipeToSelection}
          >
            <ArrowRight size={16} />
            Apply to selected
          </button>
          <button
            className={buttonVariants({ variant: "secondary" })}
            type="button"
            disabled={model.selectedPlantCount === 0}
            onClick={actions.onRemoveRecipeFromSelection}
          >
            <X size={16} />
            Remove recipe
          </button>
        </div>
      </div>

      <div className={cn(styles.toolbarSummaryRow, "flex flex-wrap items-center gap-2")}>
        <span className="text-sm text-muted-foreground">Plants in view: {model.allPlantCount}</span>
        <span className="text-sm text-muted-foreground">Selected plants: {model.selectedPlantCount}</span>
        <span className="text-sm text-muted-foreground">Draft changes: {model.draftChangeCount}</span>
      </div>

      {model.diagnostics?.reason_counts ? (
        <div className={"grid gap-2"}>
          <span>Diagnostics</span>
          <strong>
            {Object.entries(model.diagnostics.reason_counts)
              .map(([key, value]) => `${key}: ${value}`)
              .join(" · ")}
          </strong>
          {model.diagnostics.invalid_updates?.slice(0, 8).map((item) => (
            <span key={`${item.plant_id}-${item.reason}`}>{`${item.plant_id} · ${item.reason}`}</span>
          ))}
        </div>
      ) : null}

      <div className={cn(styles.trayManagerGrid, styles.cellGridResponsive)} data-cell-size="lg">
        {model.trays.map((tray) => (
          <TrayCell
            key={tray.trayId}
            trayId={tray.trayId}
            title={formatTrayDisplay(tray.trayName, tray.trayCode)}
            subtitle={`Occupancy: ${tray.plantIds.length}/${tray.capacity}`}
            className={styles.trayEditorCell}
            metaClassName={styles.trayHeaderActions}
            meta={
              <>
                <span className="text-sm text-muted-foreground">Selected: {tray.selectedCount}</span>
                <TrayHeaderToggle
                  onClick={() => actions.onToggleContainer(tray.plantIds)}
                  allSelected={tray.allSelected}
                  label={formatTrayDisplay(tray.trayName, tray.trayCode)}
                  icon={CheckSquare}
                />
              </>
            }
          >
            <div className={cn(styles.plantCellGridTray, styles.cellGridResponsive)} data-cell-size="sm">
              {tray.plantIds.map((plantId) => renderPlantCell(plantId))}
            </div>
          </TrayCell>
        ))}

        {model.unplaced ? (
          <TrayCell
            trayId="unplaced"
            title="Unplaced"
            subtitle={`Plants: ${model.unplaced.plantIds.length}`}
            className={styles.trayEditorCell}
            metaClassName={styles.trayHeaderActions}
            meta={
              <>
                <span className="text-sm text-muted-foreground">Selected: {model.unplaced.selectedCount}</span>
                <TrayHeaderToggle
                  onClick={() => actions.onToggleContainer(model.unplaced?.plantIds ?? [])}
                  allSelected={model.unplaced.allSelected}
                  label="Unplaced"
                  icon={CheckSquare}
                />
              </>
            }
          >
            <div className={cn(styles.plantCellGridTray, styles.cellGridResponsive)} data-cell-size="sm">
              {model.unplaced.plantIds.map((plantId) => renderPlantCell(plantId))}
            </div>
          </TrayCell>
        ) : null}
      </div>
    </SectionCard>
  );
}

export function RecipeDraftActionBar({ model, actions }: { model: ActionBarModel; actions: ActionBarActions }) {
  return (
    <StickyActionBar>
      <span className={styles.recipeLegendItem}>{model.draftChangeCount} recipe mapping change(s)</span>
      <button
        className={buttonVariants({ variant: "default" })}
        type="button"
        disabled={model.saving || model.draftChangeCount === 0}
        onClick={actions.onSaveDrafts}
      >
        <Save size={16} />
        {model.saving ? "Saving..." : "Save Recipe Mapping"}
      </button>
      <button
        className={buttonVariants({ variant: "secondary" })}
        type="button"
        disabled={model.saving || model.draftChangeCount === 0}
        onClick={actions.onDiscardDrafts}
      >
        Discard drafts
      </button>
    </StickyActionBar>
  );
}
