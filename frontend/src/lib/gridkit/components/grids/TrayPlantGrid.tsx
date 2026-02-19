"use client";

import { cn } from "@/lib/utils";
import type { PlantOccupantSpec, PositionSpec } from "@/src/lib/gridkit/spec";
import { VirtualGrid } from "../virtual";
import { PlantCell } from "../cells";

type TrayPlantGridProps = {
  plants: PlantOccupantSpec[];
  position?: Pick<PositionSpec, "id" | "tentId" | "shelfId" | "positionIndex">;
  onPlantPress?: (plantId: string, plant: PlantOccupantSpec) => void;
  className?: string;
};

const STATIC_GRID_THRESHOLD = 24;

function formatStatusLabel(status: string | undefined): string {
  if (!status) {
    return "";
  }
  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

export function TrayPlantGrid({
  plants,
  position,
  onPlantPress,
  className,
}: TrayPlantGridProps) {
  if (plants.length === 0) {
    return <p className="text-sm text-muted-foreground">No plants.</p>;
  }

  const gridClassName = cn("max-h-[min(65vh,28rem)] overflow-y-auto pr-1", className);

  const renderPlantCell = (plant: PlantOccupantSpec) => (
    <PlantCell
      plantId={plant.plantId}
      title={plant.title || "(pending)"}
      subtitle={plant.subtitle}
      grade={plant.grade}
      recipeCode={plant.recipeCode}
      position={position}
      state={plant.state}
      chips={plant.chips}
      dnd={plant.dnd}
      interactive={Boolean(onPlantPress)}
      onPress={onPlantPress ? () => onPlantPress(plant.plantId, plant) : undefined}
      linkHref={plant.linkHref}
      className="min-h-[104px]"
      titleClassName="text-[0.8rem]"
      subtitleClassName="text-[0.72rem]"
      metaClassName="flex flex-wrap items-center gap-1"
      meta={
        <>
          {plant.status && plant.status !== "active" ? (
            <span className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-[0.62rem] leading-none">
              {formatStatusLabel(plant.status)}
            </span>
          ) : null}
        </>
      }
    />
  );

  if (plants.length <= STATIC_GRID_THRESHOLD) {
    return (
      <div className={gridClassName}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {plants.map((plant) => (
            <div key={plant.id}>
              {renderPlantCell(plant)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <VirtualGrid
      items={plants}
      getKey={(plant) => plant.id}
      estimateRowHeight={172}
      columnsByBreakpoint={{ base: 2, sm: 3, md: 4 }}
      gapPx={8}
      overscan={8}
      className={gridClassName}
      ariaLabel="Tray plants"
      renderCell={(plant) => renderPlantCell(plant)}
    />
  );
}
