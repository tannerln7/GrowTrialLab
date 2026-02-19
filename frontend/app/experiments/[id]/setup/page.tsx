import { ExperimentSetupPageClient } from "@/src/features/experiments/setup/ExperimentSetupPageClient";
import { getParamString } from "@/src/lib/routing";

type RouteParams = { id?: string | string[] };
type ExperimentSetupPageProps = {
  params?: RouteParams | Promise<RouteParams>;
};

export default async function ExperimentSetupPage({ params }: ExperimentSetupPageProps) {
  const resolvedParams = params ? await params : {};
  const experimentId = getParamString(resolvedParams.id) ?? "";
  return <ExperimentSetupPageClient experimentId={experimentId} />;
}
