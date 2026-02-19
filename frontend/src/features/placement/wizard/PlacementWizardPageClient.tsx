"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";
import { STEPS, RUNNING_LOCK_MESSAGE } from "@/src/features/placement/types";
import { isStepComplete } from "@/src/features/placement/utils";
import { usePlacementWizard } from "@/src/features/placement/wizard/usePlacementWizard";
import { Step1Tents } from "@/src/features/placement/wizard/steps/Step1Tents";
import { Step2Trays } from "@/src/features/placement/wizard/steps/Step2Trays";
import { Step3PlantsToTrays } from "@/src/features/placement/wizard/steps/Step3PlantsToTrays";
import { Step4TraysToSlots } from "@/src/features/placement/wizard/steps/Step4TraysToSlots";
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import { Button } from "@/src/components/ui/button";
import { DraftChangeChip } from "@/src/components/ui/draft-change-chip";
import { Notice } from "@/src/components/ui/notice";
import PageShell from "@/src/components/ui/PageShell";
import SectionCard from "@/src/components/ui/SectionCard";
import { StepNavBar } from "@/src/components/ui/step-nav-bar";

import { experimentsStyles as styles } from "@/src/components/ui/experiments-styles";
import { draftChipLabelForStep } from "@/src/features/placement/utils";

type PlacementWizardPageClientProps = {
  initialStep: number;
};

export function PlacementWizardPageClient({ initialStep }: PlacementWizardPageClientProps) {
  const { ui, wizard, locked, stepModels, stepActions, experimentId } = usePlacementWizard(initialStep);

  if (ui.notInvited) {
    return (
      <PageShell title="Placement">
        <SectionCard>
          <IllustrationPlaceholder inventoryId="ILL-001" kind="notInvited" />
        </SectionCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Placement"
      subtitle="Step through tent/slot setup, tray setup, then staged placement applies."
      actions={
        <Button asChild>
          <Link href={`/experiments/${experimentId}/overview`}>← Overview</Link>
        </Button>
      }
    >
      {ui.loading ? <p className="text-sm text-muted-foreground">Loading placement...</p> : null}
      {ui.error ? <p className="text-sm text-destructive">{ui.error}</p> : null}
      {ui.notice ? <Notice variant="success">{ui.notice}</Notice> : null}
      {ui.offline ? <IllustrationPlaceholder inventoryId="ILL-003" kind="offline" /> : null}

      {locked ? (
        <SectionCard title="Placement Locked">
          <p className="text-sm text-muted-foreground">{RUNNING_LOCK_MESSAGE}</p>
        </SectionCard>
      ) : null}

      <SectionCard title="Placement Workflow">
        <div className={styles.stepperRow}>
          {STEPS.map((step) => {
            const complete = isStepComplete(step.id, wizard.stepCompletionState);
            const active = step.id === wizard.currentStep;
            const disabled = step.id > wizard.maxUnlockedStep;
            return (
              <button
                key={step.id}
                type="button"
                className={cn(
                  styles.stepperItem,
                  active && styles.stepperItemActive,
                  complete && styles.stepperItemDone,
                )}
                disabled={disabled}
                onClick={() => wizard.goToStep(step.id)}
              >
                <span className={styles.stepperIndex}>{step.id}</span>
                <span>{step.title}</span>
              </button>
            );
          })}
        </div>

        <div key={wizard.currentStep} className={styles.stepPanel}>
          {wizard.currentStep === 1 ? <Step1Tents model={stepModels.step1} actions={stepActions.step1} /> : null}
          {wizard.currentStep === 2 ? <Step2Trays model={stepModels.step2} actions={stepActions.step2} /> : null}
          {wizard.currentStep === 3 ? <Step3PlantsToTrays model={stepModels.step3} actions={stepActions.step3} /> : null}
          {wizard.currentStep === 4 ? <Step4TraysToSlots model={stepModels.step4} actions={stepActions.step4} /> : null}
        </div>

        <StepNavBar
          className="mt-3"
          showBack={wizard.currentStep > 1}
          onBack={wizard.goPreviousStep}
          showReset={wizard.currentStepDraftChangeCount > 0}
          onReset={wizard.resetCurrentStepDrafts}
          resetDisabled={ui.saving}
          onNext={() => void wizard.goNextStep()}
          nextDisabled={ui.saving || wizard.blockerHint.length > 0}
          nextLabel={wizard.nextLabel}
          blockerHint={wizard.blockerHint}
          draftIndicator={
            wizard.currentStepDraftChangeCount > 0 ? (
              <DraftChangeChip
                label={draftChipLabelForStep(wizard.currentStep, wizard.currentStepDraftChangeCount)}
              />
            ) : null
          }
        />
      </SectionCard>
    </PageShell>
  );
}
