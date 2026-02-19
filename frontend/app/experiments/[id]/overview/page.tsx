import { ExperimentOverviewPageClient } from "@/src/features/experiments/overview/ExperimentOverviewPageClient";
import { getParamString } from "@/src/lib/routing";

type RouteParams = { id?: string | string[] };
type ExperimentOverviewPageProps = {
  params?: RouteParams | Promise<RouteParams>;
};

export default async function ExperimentOverviewPage({ params }: ExperimentOverviewPageProps) {
  const resolvedParams = params ? await params : {};
  const experimentId = getParamString(resolvedParams.id) ?? "";
  return <ExperimentOverviewPageClient experimentId={experimentId} />;
}
