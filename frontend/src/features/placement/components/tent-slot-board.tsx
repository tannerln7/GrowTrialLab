import { memo, type ReactNode, useMemo } from "react";

import type { TentSummary } from "@/src/features/placement/types";
import { buildTentLayoutSpecFromPlacementStep4 } from "@/src/lib/gridkit/builders";
import { LegacyPlacementTentLayoutAdapter } from "@/src/lib/gridkit/components";

type TentSlotBoardProps = {
  tents: TentSummary[];
  draftSlotToTray: Map<string, string>;
  destinationSlotId: string;
  dirtySlotIds: Set<string>;
  selectedTraysByTentId: Record<string, string[]>;
  onReturnSelectedFromTent: (tentId: string) => void;
  onToggleDestinationSlot: (slotId: string) => void;
  renderTrayCell: (trayId: string, inSlot?: boolean) => ReactNode;
};

function TentSlotBoardImpl({
  tents,
  draftSlotToTray,
  destinationSlotId,
  dirtySlotIds,
  selectedTraysByTentId,
  onReturnSelectedFromTent,
  onToggleDestinationSlot,
  renderTrayCell,
}: TentSlotBoardProps) {
  const spec = useMemo(
    () =>
      buildTentLayoutSpecFromPlacementStep4({
        tents,
        draftSlotToTray,
        destinationSlotId,
        dirtySlotIds,
        selectedTraysByTentId,
      }),
    [destinationSlotId, dirtySlotIds, draftSlotToTray, selectedTraysByTentId, tents],
  );

  return (
    <LegacyPlacementTentLayoutAdapter
      spec={spec}
      onReturnSelectedFromTent={onReturnSelectedFromTent}
      onToggleDestinationSlot={onToggleDestinationSlot}
      renderTrayCell={renderTrayCell}
    />
  );
}

export const TentSlotBoard = memo(TentSlotBoardImpl);
