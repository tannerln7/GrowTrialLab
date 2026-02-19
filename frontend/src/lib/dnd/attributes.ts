import type { DndSpec } from "@/src/lib/gridkit/spec";

export type DndDataAttributes = Record<string, string>;

export function getDndDataAttributes(dnd?: DndSpec): DndDataAttributes {
  if (!dnd) {
    return {};
  }

  const attributes: DndDataAttributes = {};

  if (dnd.draggableId) {
    attributes["data-draggable-id"] = dnd.draggableId;
  }
  if (dnd.droppableId) {
    attributes["data-droppable-id"] = dnd.droppableId;
  }

  return attributes;
}
