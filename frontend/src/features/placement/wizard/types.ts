import type { Dispatch, SetStateAction } from "react";

import type { ExperimentStatusSummary } from "@/lib/experiment-status";
import type {
  Diagnostics,
  PersistedTrayPlantRow,
  PlacementSummary,
  PlantCell,
  Species,
  TentDraft,
  TentSummary,
  TrayCell,
} from "@/src/features/placement/types";
import type { SortedSlot, StepCompletionState, TentDraftMeta } from "@/src/features/placement/utils";

export type PlacementWizardUiState = {
  loading: boolean;
  saving: boolean;
  notInvited: boolean;
  offline: boolean;
  error: string;
  notice: string;
  diagnostics: Diagnostics | null;
};

export type PlacementWizardNavState = {
  currentStep: number;
  maxUnlockedStep: number;
  currentStepDraftChangeCount: number;
  blockerHint: string;
  nextLabel: string;
  stepCompletionState: StepCompletionState;
  goToStep: (step: number) => void;
  goNextStep: () => Promise<void>;
  goPreviousStep: () => void;
  resetCurrentStepDrafts: () => void;
};

export type Step1Model = {
  step1DraftChangeCount: number;
  tents: TentSummary[];
  species: Species[];
  saving: boolean;
  locked: boolean;
  shelfCountsByTent: Record<string, number[]>;
  tentDraftById: Record<string, TentDraft>;
  tentAllowedSpeciesDraftById: Record<string, string[]>;
  tentDraftMetaById: Map<string, TentDraftMeta>;
  dirtyTentIds: Set<string>;
};

export type Step1Actions = {
  createTent: () => Promise<void>;
  removeTent: () => Promise<void>;
  addShelf: (tentId: string) => void;
  removeShelf: (tentId: string) => void;
  adjustShelfSlotCount: (tentId: string, shelfIndex: number, delta: number) => void;
  setTentName: (tentId: string, name: string, defaults: { name: string; code: string }) => void;
  setTentCode: (tentId: string, code: string, defaults: { name: string; code: string }) => void;
  toggleTentAllowedSpecies: (tentId: string, speciesId: string) => void;
};

export type Step2Model = {
  step2DraftChangeCount: number;
  saving: boolean;
  locked: boolean;
  draftTrayCount: number;
  sortedTrayIds: string[];
  trayById: Map<string, TrayCell>;
  trayCapacityDraftById: Record<string, number>;
  dirtyTrayCapacityIds: Set<string>;
  draftRemovedTrayIds: Set<string>;
  defaultTrayCapacity: number;
  newTrayCapacities: number[];
};

export type Step2Actions = {
  incrementDraftTrayCount: () => void;
  decrementDraftTrayCount: () => void;
  adjustTrayCapacity: (trayId: string, delta: number) => void;
  adjustPendingTrayCapacity: (index: number, delta: number) => void;
};

export type Step3Model = {
  placementDraftChangeCount: number;
  saving: boolean;
  locked: boolean;
  diagnostics: Diagnostics | null;
  destinationTrayId: string;
  sortedTrayIds: string[];
  trayById: Map<string, TrayCell>;
  draftPlantCountByTray: Record<string, number>;
  mainGridPlantIds: string[];
  selectedInMainGrid: string[];
  selectedPlantIds: Set<string>;
  sameSpeciesDisabled: boolean;
  trayPlantIdsByTray: Record<string, string[]>;
  selectedInTrayByTrayId: Record<string, string[]>;
  dirtyPlantContainerTrayIds: Set<string>;
  plantById: Map<string, PlantCell>;
  persistedPlantToTray: Record<string, string | null>;
  draftPlantToTray: Record<string, string | null>;
};

export type Step3Actions = {
  setDestinationTrayId: Dispatch<SetStateAction<string>>;
  togglePlantSelection: (plantId: string) => void;
  selectAllPlantsInMainGrid: () => void;
  selectSameSpeciesInMainGrid: () => void;
  clearPlantSelection: () => void;
  stageMovePlantsToTray: () => void;
  stageRemovePlantsFromTray: (trayId: string) => void;
};

export type Step4Model = {
  traySlotDraftChangeCount: number;
  saving: boolean;
  locked: boolean;
  destinationSlotId: string;
  sortedSlots: SortedSlot[];
  draftSlotToTray: Map<string, string>;
  trayById: Map<string, TrayCell>;
  mainGridTrayIds: string[];
  selectedTrayIds: Set<string>;
  tents: TentSummary[];
  dirtySlotIds: Set<string>;
  selectedTraysByTentId: Record<string, string[]>;
  persistedTrayToSlot: Record<string, string | null>;
  draftTrayToSlot: Record<string, string | null>;
};

export type Step4Actions = {
  setDestinationSlotId: Dispatch<SetStateAction<string>>;
  toggleTraySelection: (trayId: string) => void;
  clearTraySelection: () => void;
  selectAllTraysInMainGrid: () => void;
  toggleDestinationSlot: (slotId: string) => void;
  stageMoveTraysToSlots: () => void;
  stageRemoveTraysFromTent: (tentId: string) => void;
};

export type PlacementWizardStepModels = {
  step1: Step1Model;
  step2: Step2Model;
  step3: Step3Model;
  step4: Step4Model;
};

export type PlacementWizardStepActions = {
  step1: Step1Actions;
  step2: Step2Actions;
  step3: Step3Actions;
  step4: Step4Actions;
};

export type PlacementWizardController = {
  ui: PlacementWizardUiState;
  wizard: PlacementWizardNavState;
  locked: boolean;
  stepModels: PlacementWizardStepModels;
  stepActions: PlacementWizardStepActions;
  summary: PlacementSummary | null;
  statusSummary: ExperimentStatusSummary | null;
  persistedTrayPlantRowByPlantId: Record<string, PersistedTrayPlantRow>;
  experimentId: string;
};
