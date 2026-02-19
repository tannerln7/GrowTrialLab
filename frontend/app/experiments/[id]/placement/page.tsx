import { parseStep } from "@/src/features/placement/utils";
import { getParamString } from "@/src/lib/routing";
import { PlacementWizardPageClient } from "@/src/features/placement/wizard/PlacementWizardPageClient";

type PlacementPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PlacementPage({ searchParams }: PlacementPageProps) {
  const resolved = searchParams ? await searchParams : {};
  const stepValue = getParamString(resolved.step);
  const initialStep = parseStep(stepValue);

  return <PlacementWizardPageClient initialStep={initialStep} />;
}
