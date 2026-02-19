import { ExperimentRecipesPageClient } from "@/src/features/experiments/recipes/ExperimentRecipesPageClient";
import { getParamString } from "@/src/lib/routing";

type RouteParams = { id?: string | string[] };
type ExperimentRecipesPageProps = {
  params?: RouteParams | Promise<RouteParams>;
};

export default async function ExperimentRecipesPage({ params }: ExperimentRecipesPageProps) {
  const resolvedParams = params ? await params : {};
  const experimentId = getParamString(resolvedParams.id) ?? "";
  return <ExperimentRecipesPageClient experimentId={experimentId} />;
}
