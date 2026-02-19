import { ExperimentFeedingPageClient } from "@/src/features/experiments/feeding/ExperimentFeedingPageClient";
import { getParamString } from "@/src/lib/routing";

type RouteParams = { id?: string | string[] };
type ExperimentFeedingPageProps = {
  params?: RouteParams | Promise<RouteParams>;
};

export default async function ExperimentFeedingPage({ params }: ExperimentFeedingPageProps) {
  const resolvedParams = params ? await params : {};
  const experimentId = getParamString(resolvedParams.id) ?? "";
  return <ExperimentFeedingPageClient experimentId={experimentId} />;
}
