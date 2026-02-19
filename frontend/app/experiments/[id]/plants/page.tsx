import { ExperimentPlantsPageClient } from "@/src/features/experiments/plants/ExperimentPlantsPageClient";
import { getParamString } from "@/src/lib/routing";

type RouteParams = { id?: string | string[] };
type ExperimentPlantsPageProps = {
  params?: RouteParams | Promise<RouteParams>;
};

export default async function ExperimentPlantsPage({ params }: ExperimentPlantsPageProps) {
  const resolvedParams = params ? await params : {};
  const experimentId = getParamString(resolvedParams.id) ?? "";
  return <ExperimentPlantsPageClient experimentId={experimentId} />;
}
