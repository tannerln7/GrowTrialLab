import { ExperimentBaselinePageClient } from "@/src/features/experiments/baseline/ExperimentBaselinePageClient";
import { getParamString } from "@/src/lib/routing";

type RouteParams = { id?: string | string[] };
type ExperimentBaselinePageProps = {
  params?: RouteParams | Promise<RouteParams>;
};

export default async function ExperimentBaselinePage({ params }: ExperimentBaselinePageProps) {
  const resolvedParams = params ? await params : {};
  const experimentId = getParamString(resolvedParams.id) ?? "";
  return <ExperimentBaselinePageClient experimentId={experimentId} />;
}
