import { ExperimentRotationPageClient } from "@/src/features/experiments/rotation/ExperimentRotationPageClient";
import { getParamString } from "@/src/lib/routing";

type RouteParams = { id?: string | string[] };
type ExperimentRotationPageProps = {
  params?: RouteParams | Promise<RouteParams>;
};

export default async function ExperimentRotationPage({ params }: ExperimentRotationPageProps) {
  const resolvedParams = params ? await params : {};
  const experimentId = getParamString(resolvedParams.id) ?? "";
  return <ExperimentRotationPageClient experimentId={experimentId} />;
}
