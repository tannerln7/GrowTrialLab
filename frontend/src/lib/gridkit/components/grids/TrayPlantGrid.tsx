"use client";

import { cn } from "@/lib/utils";
import type { PlantOccupantSpec, PositionSpec } from "@/src/lib/gridkit/spec";
import { PlantCell } from "../cells";

type TrayPlantGridProps = {
  plants: PlantOccupantSpec[];
  position?: Pick<PositionSpec, "id" | "tentId" | "shelfId" | "positionIndex">;
  onPlantPress?: (plantId: string, plant: PlantOccupantSpec) => void;
  className?: string;
};

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

  return (
    <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4", className)}>
      {plants.map((plant) => (
        <PlantCell
          key={plant.id}
          plantId={plant.plantId}
          title={plant.title || "(pending)"}
          subtitle={plant.subtitle}
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
              <span className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-[0.62rem] leading-none">
                {plant.grade ? `Grade ${plant.grade}` : "No grade"}
              </span>
              <span className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-[0.62rem] leading-none">
                {plant.recipeCode ? `Recipe ${plant.recipeCode}` : "No recipe"}
              </span>
              {plant.status && plant.status !== "active" ? (
                <span className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-[0.62rem] leading-none">
                  {formatStatusLabel(plant.status)}
                </span>
              ) : null}
            </>
          }
        />
      ))}
    </div>
  );
}
