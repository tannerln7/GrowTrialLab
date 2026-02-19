import Link from "next/link";

import { Badge } from "@/src/components/ui/badge";
import { buttonVariants } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { NativeSelect } from "@/src/components/ui/native-select";
import { Notice } from "@/src/components/ui/notice";
import ResponsiveList from "@/src/components/ui/ResponsiveList";
import SectionCard from "@/src/components/ui/SectionCard";
import StickyActionBar from "@/src/components/ui/StickyActionBar";
import { Textarea } from "@/src/components/ui/textarea";

type FeedingQueuePlant = {
  uuid: string;
  plant_id: string;
  species_name: string;
  assigned_recipe: { id: string; code: string; name: string } | null;
  blocked_reason: string | null;
  last_fed_at: string | null;
  needs_feeding: boolean;
};

type QueueStatusModel = {
  remainingCount: number;
  windowDays: number;
  hasSelectedPlant: boolean;
  selectedPlantNeedsFeeding: boolean;
};

type QueueStatusActions = {
  onNextNeedingFeed: () => void;
};

type FeedPlantModel = {
  selectedPlantId: string;
  queuePlants: FeedingQueuePlant[];
  selectedPlant: FeedingQueuePlant | null;
  amountText: string;
  showNote: boolean;
  note: string;
  selectedPlantLastFedLabel: string;
  selectedPlantLocationLabel: string;
};

type FeedPlantActions = {
  onSelectPlant: (plantId: string) => void;
  onAmountChange: (value: string) => void;
  onToggleNote: () => void;
  onNoteChange: (value: string) => void;
};

type BlockedModel = {
  saveBlockedReason: string;
  experimentId: string;
  overviewHref: string;
};

type UpNextModel = {
  upNext: FeedingQueuePlant[];
};

type UpNextActions = {
  onSelectPlant: (plantId: string) => void;
};

type ActionBarModel = {
  selectedPlantId: string;
  saving: boolean;
  canSaveAndNext: boolean;
  saveBlocked: boolean;
};

type ActionBarActions = {
  onSave: () => void;
  onSaveNext: () => void;
};

export function FeedingRequiresRunningPanel({ experimentId }: { experimentId: string }) {
  return (
    <SectionCard title="Feeding Requires Running State">
      <p className={"text-sm text-muted-foreground"}>Feeding is available only while an experiment is running.</p>
      <Link className={buttonVariants({ variant: "default" })} href={`/experiments/${experimentId}/overview`}>
        Start experiment from Overview
      </Link>
    </SectionCard>
  );
}

export function FeedingQueueStatusPanel({ model, actions }: { model: QueueStatusModel; actions: QueueStatusActions }) {
  return (
    <SectionCard title="Queue Status">
      <div className={"grid gap-3"}>
        <Badge variant="secondary">Remaining feedings: {model.remainingCount}</Badge>
        <p className={"text-sm text-muted-foreground"}>Window: feed plants at least once every {model.windowDays} days.</p>
        {model.hasSelectedPlant && !model.selectedPlantNeedsFeeding ? (
          <p className={"text-sm text-muted-foreground"}>This plant is already within the feeding window.</p>
        ) : null}
        {model.remainingCount > 0 ? (
          <button className={buttonVariants({ variant: "secondary" })} type="button" onClick={actions.onNextNeedingFeed}>
            Next needing feeding
          </button>
        ) : (
          <Notice variant="success">All plants are up to date.</Notice>
        )}
      </div>
    </SectionCard>
  );
}

export function FeedingAllCompletePanel({ experimentId }: { experimentId: string }) {
  return (
    <SectionCard title="All Feedings Complete">
      <p className={"text-sm text-muted-foreground"}>No active plants currently need feeding.</p>
      <Link className={buttonVariants({ variant: "default" })} href={`/experiments/${experimentId}/overview`}>
        Back to Overview
      </Link>
    </SectionCard>
  );
}

export function FeedPlantPanel({ model, actions }: { model: FeedPlantModel; actions: FeedPlantActions }) {
  return (
    <SectionCard title="Feed Plant">
      <div className={"grid gap-3"}>
        <label className={"grid gap-2"}>
          <span className={"text-sm text-muted-foreground"}>Plant</span>
          <NativeSelect value={model.selectedPlantId} onChange={(event) => actions.onSelectPlant(event.target.value || "")}> 
            <option value="">Select plant</option>
            {model.queuePlants.map((plant) => (
              <option key={plant.uuid} value={plant.uuid}>
                {plant.plant_id || "(pending)"} - {plant.species_name}
              </option>
            ))}
          </NativeSelect>
        </label>
        {model.selectedPlant ? (
          <div className={"grid gap-3"}>
            <p className={"text-sm text-muted-foreground"}>Last fed: {model.selectedPlantLastFedLabel}</p>
            <p className={"text-sm text-muted-foreground"}>
              Assigned recipe:{" "}
              {model.selectedPlant.assigned_recipe
                ? `${model.selectedPlant.assigned_recipe.code}${model.selectedPlant.assigned_recipe.name ? ` - ${model.selectedPlant.assigned_recipe.name}` : ""}`
                : "Unassigned"}
            </p>
            <p className={"text-sm text-muted-foreground"}>Location: {model.selectedPlantLocationLabel}</p>
            {model.selectedPlant.blocked_reason ? <p className={"text-sm text-destructive"}>Blocked: {model.selectedPlant.blocked_reason}</p> : null}
          </div>
        ) : null}
        <label className={"grid gap-2"}>
          <span className={"text-sm text-muted-foreground"}>Amount (optional)</span>
          <Input value={model.amountText} onChange={(event) => actions.onAmountChange(event.target.value)} placeholder="3 drops" />
        </label>
        <button className={buttonVariants({ variant: "secondary" })} type="button" onClick={actions.onToggleNote}>
          {model.showNote ? "Hide note" : "Add note"}
        </button>
        {model.showNote ? (
          <label className={"grid gap-2"}>
            <span className={"text-sm text-muted-foreground"}>Note (optional)</span>
            <Textarea value={model.note} onChange={(event) => actions.onNoteChange(event.target.value)} />
          </label>
        ) : null}
      </div>
    </SectionCard>
  );
}

export function FeedingBlockedPanel({ model }: { model: BlockedModel }) {
  return (
    <SectionCard title="Feeding Blocked">
      <p className={"text-sm text-muted-foreground"}>
        {model.saveBlockedReason === "Unplaced"
          ? "This plant needs placement in a tray before feeding."
          : "This plant needs a plant recipe before feeding."}
      </p>
      <div className={"flex flex-wrap items-center gap-2"}>
        <Link className={buttonVariants({ variant: "default" })} href={`/experiments/${model.experimentId}/placement`}>
          Fix placement
        </Link>
        <Link className={buttonVariants({ variant: "secondary" })} href={model.overviewHref}>
          Back to Overview
        </Link>
      </div>
    </SectionCard>
  );
}

export function FeedingUpNextPanel({ model, actions, formatLastFed }: { model: UpNextModel; actions: UpNextActions; formatLastFed: (value: string | null) => string }) {
  return (
    <SectionCard title="Up Next">
      <ResponsiveList
        items={model.upNext}
        getKey={(plant) => plant.uuid}
        columns={[
          {
            key: "plant_id",
            label: "Plant",
            render: (plant) => plant.plant_id || "(pending)",
          },
          {
            key: "species",
            label: "Species",
            render: (plant) => plant.species_name,
          },
          {
            key: "last_fed",
            label: "Last fed",
            render: (plant) => formatLastFed(plant.last_fed_at),
          },
        ]}
        renderMobileCard={(plant) => (
          <div className={"grid gap-2"}>
            <span>Plant</span>
            <strong>{plant.plant_id || "(pending)"}</strong>
            <span>Species</span>
            <strong>{plant.species_name}</strong>
            <span>Last fed</span>
            <strong>{formatLastFed(plant.last_fed_at)}</strong>
            <button className={buttonVariants({ variant: "secondary" })} type="button" onClick={() => actions.onSelectPlant(plant.uuid)}>
              Select
            </button>
          </div>
        )}
      />
    </SectionCard>
  );
}

export function FeedingActionBar({ model, actions }: { model: ActionBarModel; actions: ActionBarActions }) {
  return (
    <StickyActionBar>
      <button
        className={buttonVariants({ variant: "default" })}
        type="button"
        disabled={!model.selectedPlantId || model.saving || model.saveBlocked}
        onClick={actions.onSave}
      >
        {model.saving ? "Saving..." : "Save"}
      </button>
      <button
        className={buttonVariants({ variant: "secondary" })}
        type="button"
        disabled={!model.selectedPlantId || model.saving || !model.canSaveAndNext || model.saveBlocked}
        onClick={actions.onSaveNext}
      >
        Save & Next
      </button>
    </StickyActionBar>
  );
}
