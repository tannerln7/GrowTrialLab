import { cn } from "@/lib/utils";
import {
  draftChipLabelForStep,
  getTentDraftMeta,
} from "@/src/features/placement/utils";
import type { Step1Actions, Step1Model } from "@/src/features/placement/wizard/types";
import { CountAdjustToolbar } from "@/src/components/ui/count-adjust-toolbar";
import { DraftChangeChip } from "@/src/components/ui/draft-change-chip";
import { DraftChangeMarker } from "@/src/components/ui/draft-change-marker";
import { Input } from "@/src/components/ui/input";
import SectionCard from "@/src/components/ui/SectionCard";
import { buildTentLayoutSpecFromPlacementStep1 } from "@/src/lib/gridkit/builders";
import { PlacementShelfPreview, TentCard, TentGrid } from "@/src/lib/gridkit/components";

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

      <TentGrid>
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
          const tentSpec = buildTentLayoutSpecFromPlacementStep1({
            tents: [{ tent, draftShelfCounts: shelfCounts }],
          }).tents[0];
          const shelvesRemoved = tentDraftMeta.shelvesRemoved;
          const tentNameDirty = tentDraftMeta.tentNameDirty;
          const tentCodeDirty = tentDraftMeta.tentCodeDirty;
          const restrictionsDirty = tentDraftMeta.restrictionsDirty;

          return (
            <TentCard
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
                  {tentSpec ? (
                    <PlacementShelfPreview
                      tentSpec={tentSpec}
                      onAdjustShelfSlotCount={actions.adjustShelfSlotCount}
                    />
                  ) : null}
                </div>
              </div>
            </TentCard>
          );
        })}
      </TentGrid>
    </div>
  );
}
