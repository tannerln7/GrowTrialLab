import Link from "next/link";

import { Badge } from "@/src/components/ui/badge";
import { buttonVariants } from "@/src/components/ui/button";
import { NativeSelect } from "@/src/components/ui/native-select";
import ResponsiveList from "@/src/components/ui/ResponsiveList";
import SectionCard from "@/src/components/ui/SectionCard";
import { Textarea } from "@/src/components/ui/textarea";

type RotationTray = {
  tray_id: string;
  tray_name: string;
  location: {
    status: "placed" | "unplaced";
    tent: { id: string; code: string | null; name: string } | null;
    slot: {
      id: string;
      code: string;
      label: string;
      shelf_index: number;
      slot_index: number;
    } | null;
  };
  plant_count: number;
};

type RotationLog = {
  id: string;
  tray_name: string;
  from_slot: { id: string; code: string; label: string; tent_name: string } | null;
  to_slot: { id: string; code: string; label: string; tent_name: string } | null;
  occurred_at: string;
  note: string;
};

type SlotOption = {
  id: string;
  label: string;
};

type LogMoveModel = {
  trays: RotationTray[];
  selectedTrayId: string;
  selectedToSlotId: string;
  compatibleSlotsForSelectedTray: SlotOption[];
  selectedTrayBlocked: boolean;
  note: string;
  isSaving: boolean;
  experimentId: string;
};

type LogMoveActions = {
  onSelectTray: (trayId: string) => void;
  onSelectToSlot: (slotId: string) => void;
  onNoteChange: (value: string) => void;
  onSubmit: () => void;
};

export function RotationStatePanel({ lifecycleState }: { lifecycleState: string }) {
  return (
    <SectionCard title="Experiment State">
      <Badge variant="secondary">{lifecycleState.toUpperCase()}</Badge>
    </SectionCard>
  );
}

export function RotationRequiresRunningPanel({ experimentId }: { experimentId: string }) {
  return (
    <SectionCard title="Rotation Requires Running State">
      <p className={"text-sm text-muted-foreground"}>
        Rotation logs are intended for running experiments. Start the experiment first.
      </p>
      <Link className={buttonVariants({ variant: "default" })} href={`/experiments/${experimentId}/overview`}>
        Start experiment from Overview
      </Link>
    </SectionCard>
  );
}

export function LogMovePanel({ model, actions }: { model: LogMoveModel; actions: LogMoveActions }) {
  return (
    <SectionCard title="Log a Move">
      <div className={"grid gap-3"}>
        <label className={"grid gap-2"}>
          <span className={"text-sm text-muted-foreground"}>Tray</span>
          <NativeSelect value={model.selectedTrayId} onChange={(event) => actions.onSelectTray(event.target.value)}>
            <option value="">Select tray</option>
            {model.trays.map((tray) => (
              <option key={tray.tray_id} value={tray.tray_id}>
                {tray.tray_name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className={"grid gap-2"}>
          <span className={"text-sm text-muted-foreground"}>Destination slot</span>
          <NativeSelect value={model.selectedToSlotId} onChange={(event) => actions.onSelectToSlot(event.target.value)}>
            <option value="">None / Unassigned</option>
            {model.compatibleSlotsForSelectedTray.map((slot) => (
              <option key={slot.id} value={slot.id}>
                {slot.label}
              </option>
            ))}
          </NativeSelect>
          {model.selectedTrayBlocked ? (
            <p className={"text-sm text-muted-foreground"}>
              No compatible destination slots for this tray. This tray contains plants not allowed in restricted tents.
              <Link href={`/experiments/${model.experimentId}/placement?step=1`}> Adjust tent restrictions</Link>.
            </p>
          ) : null}
        </label>
        <label className={"grid gap-2"}>
          <span className={"text-sm text-muted-foreground"}>Note (optional)</span>
          <Textarea value={model.note} onChange={(event) => actions.onNoteChange(event.target.value)} />
        </label>
        <button
          className={buttonVariants({ variant: "default" })}
          type="button"
          disabled={model.isSaving || model.selectedTrayBlocked}
          onClick={actions.onSubmit}
        >
          {model.isSaving ? "Saving..." : "Log move"}
        </button>
      </div>
    </SectionCard>
  );
}

type BasicRotationTray = {
  tray_id: string;
  tray_name: string;
  plant_count: number;
};

export function RotationTraysPanel<TTray extends BasicRotationTray>({
  trays,
  locationLabel,
}: {
  trays: TTray[];
  locationLabel: (tray: TTray) => string;
}) {
  return (
    <SectionCard title="Trays">
      <ResponsiveList
        items={trays}
        getKey={(tray) => tray.tray_id}
        columns={[
          {
            key: "tray",
            label: "Tray",
            render: (tray) => tray.tray_name,
          },
          {
            key: "location",
            label: "Location",
            render: (tray) => locationLabel(tray),
          },
          {
            key: "plants",
            label: "Plants",
            render: (tray) => tray.plant_count,
          },
        ]}
        renderMobileCard={(tray) => (
          <div className={"grid gap-2"}>
            <span>Tray</span>
            <strong>{tray.tray_name}</strong>
            <span>Location</span>
            <strong>{locationLabel(tray)}</strong>
            <span>Plants</span>
            <strong>{tray.plant_count}</strong>
          </div>
        )}
      />
    </SectionCard>
  );
}

export function RotationLogsPanel({ logs, formatDateTime }: { logs: RotationLog[]; formatDateTime: (value: string) => string }) {
  return (
    <SectionCard title="Recent Logs">
      <ResponsiveList
        items={logs}
        getKey={(item) => item.id}
        columns={[
          {
            key: "tray",
            label: "Tray",
            render: (item) => item.tray_name,
          },
          {
            key: "from",
            label: "From",
            render: (item) => (item.from_slot ? `${item.from_slot.tent_name} / ${item.from_slot.code}` : "Unplaced"),
          },
          {
            key: "to",
            label: "To",
            render: (item) => (item.to_slot ? `${item.to_slot.tent_name} / ${item.to_slot.code}` : "Unplaced"),
          },
          {
            key: "when",
            label: "When",
            render: (item) => formatDateTime(item.occurred_at),
          },
        ]}
        renderMobileCard={(item) => (
          <div className={"grid gap-2"}>
            <span>Tray</span>
            <strong>{item.tray_name}</strong>
            <span>From</span>
            <strong>{item.from_slot ? `${item.from_slot.tent_name} / ${item.from_slot.code}` : "Unplaced"}</strong>
            <span>To</span>
            <strong>{item.to_slot ? `${item.to_slot.tent_name} / ${item.to_slot.code}` : "Unplaced"}</strong>
            <span>When</span>
            <strong>{formatDateTime(item.occurred_at)}</strong>
            {item.note ? (
              <>
                <span>Note</span>
                <strong>{item.note}</strong>
              </>
            ) : null}
          </div>
        )}
      />
    </SectionCard>
  );
}
