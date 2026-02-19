import { ExperimentSchedulePageClient } from "@/src/features/experiments/schedule/ExperimentSchedulePageClient";
import { getParamString } from "@/src/lib/routing";

type RouteParams = { id?: string | string[] };
type ExperimentSchedulePageProps = {
  params?: RouteParams | Promise<RouteParams>;
};

export default async function ExperimentSchedulePage({ params }: ExperimentSchedulePageProps) {
  const resolvedParams = params ? await params : {};
  const experimentId = getParamString(resolvedParams.id) ?? "";
  return <ExperimentSchedulePageClient experimentId={experimentId} />;
}
