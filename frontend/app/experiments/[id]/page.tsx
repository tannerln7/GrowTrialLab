import { ExperimentLandingPageClient } from "@/src/features/experiments/landing/ExperimentLandingPageClient";
import { getParamString } from "@/src/lib/routing";

type RouteParams = { id?: string | string[] };
type ExperimentLandingPageProps = {
  params?: RouteParams | Promise<RouteParams>;
};

export default async function ExperimentLandingPage({ params }: ExperimentLandingPageProps) {
  const resolvedParams = params ? await params : {};
  const experimentId = getParamString(resolvedParams.id) ?? "";
  return <ExperimentLandingPageClient experimentId={experimentId} />;
}
