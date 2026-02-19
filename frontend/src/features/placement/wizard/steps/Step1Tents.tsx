import { cn } from "@/lib/utils";
import {
  buildStep1ShelfPreviewGroups,
  draftChipLabelForStep,
  getTentDraftMeta,
} from "@/src/features/placement/utils";
import type { Step1Actions, Step1Model } from "@/src/features/placement/wizard/types";
import { CountAdjustToolbar } from "@/src/components/ui/count-adjust-toolbar";
import { DraftChangeChip } from "@/src/components/ui/draft-change-chip";
import { DraftChangeMarker } from "@/src/components/ui/draft-change-marker";
import { Input } from "@/src/components/ui/input";
import SectionCard from "@/src/components/ui/SectionCard";
import { StepAdjustButton } from "@/src/components/ui/step-adjust-button";

import { experimentsStyles as styles } from "@/src/components/ui/experiments-styles";

type Step1TentsProps = {
  model: Step1Model;
  actions: Step1Actions;
};

export function Step1Tents({ model, actions }: Step1TentsProps) {
  return (
    <div className="grid gap-3">
      <SectionCard
        title="Tent Manager"
        actions={
          model.step1DraftChangeCount > 0 ? (
            <DraftChangeChip label={draftChipLabelForStep(1, model.step1DraftChangeCount)} />
          ) : null
        }
      >
        <CountAdjustToolbar
          count={model.tents.length}
          countLabel="Total tents"
          helperText="Shelves and slots are configured per tent below."
          onDecrement={() => void actions.removeTent()}
          onIncrement={() => void actions.createTent()}
          decrementDisabled={model.saving || model.locked || model.tents.length === 0}
          incrementDisabled={model.saving || model.locked}
        />
      </SectionCard>

      {model.tents.map((tent) => {
        const tentDraftMeta =
          model.tentDraftMetaById.get(tent.tent_id) ||
          getTentDraftMeta(
            tent,
            model.shelfCountsByTent,
            model.tentAllowedSpeciesDraftById,
            model.tentDraftById,
          );
        const shelfCounts = tentDraftMeta.draftShelfCounts;
        const selectedSpecies = new Set(tentDraftMeta.draftAllowedSpeciesIds);
        const tentDraft = model.tentDraftById[tent.tent_id] || { name: tent.name, code: tent.code };
        const previewShelfSlotGroups = buildStep1ShelfPreviewGroups(tent, shelfCounts);
        const persistedShelfCounts = tentDraftMeta.persistedShelfCounts;
        const shelvesRemoved = tentDraftMeta.shelvesRemoved;
        const tentNameDirty = tentDraftMeta.tentNameDirty;
        const tentCodeDirty = tentDraftMeta.tentCodeDirty;
        const restrictionsDirty = tentDraftMeta.restrictionsDirty;

        return (
          <SectionCard
            key={tent.tent_id}
            title={`${tent.name}${tent.code ? ` (${tent.code})` : ""}`}
            className={shelvesRemoved ? styles.draftChangedSurface : ""}
            actions={model.dirtyTentIds.has(tent.tent_id) ? <DraftChangeChip label="Draft changes" /> : null}
          >
            {shelvesRemoved ? <DraftChangeMarker /> : null}
            <div className="grid gap-3">
              <div className={styles.trayControlRow}>
                <label
                  className={cn(
                    "grid gap-1 sm:w-auto sm:min-w-[11rem] sm:flex-1",
                    tentNameDirty && `${styles.draftChangedSurface} relative rounded-md p-1`,
                  )}
                >
                  {tentNameDirty ? <DraftChangeMarker /> : null}
                  <span className="text-xs text-muted-foreground">Tent Name</span>
                  <Input
                    value={tentDraft.name}
                    onChange={(event) =>
                      actions.setTentName(tent.tent_id, event.target.value, {
                        name: tent.name,
                        code: tent.code,
                      })
                    }
                    aria-label="Tent name"
                  />
                </label>
                <label
                  className={cn(
                    "grid gap-1 sm:w-auto sm:min-w-[11rem] sm:flex-1",
                    tentCodeDirty && `${styles.draftChangedSurface} relative rounded-md p-1`,
                  )}
                >
                  {tentCodeDirty ? <DraftChangeMarker /> : null}
                  <span className="text-xs text-muted-foreground">Tent ID</span>
                  <Input
                    value={tentDraft.code}
                    onChange={(event) =>
                      actions.setTentCode(tent.tent_id, event.target.value, {
                        name: tent.name,
                        code: tent.code,
                      })
                    }
                    aria-label="Tent code"
                  />
                </label>
              </div>

              <div className="grid gap-2">
                <details
                  className={cn(
                    "rounded-lg border border-border",
                    styles.cellSurfaceLevel1,
                    restrictionsDirty && `${styles.draftChangedSurface} relative`,
                  )}
                >
                  {restrictionsDirty ? <DraftChangeMarker /> : null}
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm text-foreground">
                    <span>Allowed species restrictions</span>
                    <span className={styles.recipeLegendItem}>
                      {selectedSpecies.size === 0 ? "All species" : `${selectedSpecies.size} selected`}
                    </span>
                  </summary>
                  <div className="grid gap-2 border-t border-border p-2">
                    {model.species.map((item) => {
                      const checked = selectedSpecies.has(item.id);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={cn(
                            "flex min-h-10 w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm",
                            checked
                              ? "border-ring bg-[color:var(--gt-cell-selected)] text-foreground"
                              : "border-border bg-[color:var(--gt-cell-surface-1)] text-foreground",
                          )}
                          onClick={() => actions.toggleTentAllowedSpecies(tent.tent_id, item.id)}
                          aria-pressed={checked}
                        >
                          <span>{item.name}</span>
                          <span className={styles.recipeLegendItem}>{checked ? "Selected" : "Tap to add"}</span>
                        </button>
                      );
                    })}
                  </div>
                </details>
              </div>

              <div className="grid gap-2">
                <span className="text-sm text-muted-foreground">Shelves layout</span>
                <CountAdjustToolbar
                  count={shelfCounts.length}
                  countLabel="Total shelves"
                  onDecrement={() => actions.removeShelf(tent.tent_id)}
                  onIncrement={() => actions.addShelf(tent.tent_id)}
                  decrementDisabled={model.saving || model.locked || shelfCounts.length <= 1}
                  incrementDisabled={model.saving || model.locked}
                />
              </div>

              <div className="grid gap-2">
                <span className="text-sm text-muted-foreground">Current slots</span>
                <div className={styles.step1ShelfPreviewLane}>
                  {previewShelfSlotGroups.map((group) => {
                    const persistedCount = persistedShelfCounts[group.shelfIndex - 1] || 0;
                    const shelfDirty = group.isNewShelf || group.removedSlotsInShelf;
                    return (
                      <article
                        key={`${tent.tent_id}-shelf-${group.shelfIndex}`}
                        className={cn(
                          styles.trayEditorCell,
                          styles.step1ShelfPreviewCard,
                          styles.cellSurfaceLevel2,
                          shelfDirty && styles.draftChangedSurface,
                        )}
                      >
                        {shelfDirty ? <DraftChangeMarker /> : null}
                        <div className={styles.trayHeaderRow}>
                          <div className={styles.trayHeaderMeta}>
                            <strong>{`Shelf ${group.shelfIndex}`}</strong>
                          </div>
                          <div className={styles.trayHeaderActions}>
                            <span className={styles.recipeLegendItem}>
                              {group.slots.length} {group.slots.length === 1 ? "slot" : "slots"}
                            </span>
                            <StepAdjustButton
                              direction="decrement"
                              onClick={() => actions.adjustShelfSlotCount(tent.tent_id, group.shelfIndex - 1, -1)}
                              disabled={(shelfCounts[group.shelfIndex - 1] || 0) <= 0}
                            />
                            <StepAdjustButton
                              direction="increment"
                              onClick={() => actions.adjustShelfSlotCount(tent.tent_id, group.shelfIndex - 1, 1)}
                            />
                          </div>
                        </div>

                        <div className={styles.step1ShelfPreviewSlotGrid}>
                          {group.slots.map((slot) => {
                            const isAddedSlot = !group.isNewShelf && slot.isDraft && slot.slot_index > persistedCount;
                            return (
                              <article
                                key={slot.slot_id}
                                className={cn(
                                  styles.trayGridCell,
                                  styles.cellFrame,
                                  styles.cellSurfaceLevel1,
                                  "justify-items-center text-center",
                                  isAddedSlot && styles.draftChangedSurface,
                                  slot.isDraft && "[grid-template-rows:auto_1fr]",
                                )}
                              >
                                {isAddedSlot ? <DraftChangeMarker /> : null}
                                <strong className={styles.trayGridCellId}>{`Slot ${slot.slot_index}`}</strong>
                                {!slot.isDraft && slot.code !== `Slot ${slot.slot_index}` ? (
                                  <span className="text-sm text-muted-foreground">{slot.code}</span>
                                ) : null}
                                {slot.isDraft ? (
                                  <span className={cn(styles.slotPlacedChip, "self-end")}>New</span>
                                ) : null}
                              </article>
                            );
                          })}
                          {group.slots.length === 0 ? <span className="text-sm text-muted-foreground">No slots.</span> : null}
                        </div>
                      </article>
                    );
                  })}
                  {previewShelfSlotGroups.length === 0 ? (
                    <span className="text-sm text-muted-foreground">No shelves configured yet.</span>
                  ) : null}
                </div>
              </div>
            </div>
          </SectionCard>
        );
      })}
    </div>
  );
}
