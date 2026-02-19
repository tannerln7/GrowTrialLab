import { parseStep } from "@/src/features/placement/utils";
import { PlacementWizardPageClient } from "@/src/features/placement/wizard/PlacementWizardPageClient";

type PlacementPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PlacementPage({ searchParams }: PlacementPageProps) {
  const resolved = searchParams ? await searchParams : {};
  const rawStep = resolved.step;
  const stepValue = Array.isArray(rawStep) ? (rawStep[0] ?? null) : (rawStep ?? null);
  const initialStep = parseStep(stepValue);

  return <PlacementWizardPageClient initialStep={initialStep} />;
}
