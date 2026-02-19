import { PlantCockpitPageClient } from "@/src/features/plants/cockpit/PlantCockpitPageClient";
import { getParamString } from "@/src/lib/routing";

type RouteParams = { id?: string | string[] };
type PlantCockpitPageProps = {
  params?: RouteParams | Promise<RouteParams>;
};

export default async function PlantCockpitPage({ params }: PlantCockpitPageProps) {
  const resolvedParams = params ? await params : {};
  const plantUuid = getParamString(resolvedParams.id) ?? "";
  return <PlantCockpitPageClient plantUuid={plantUuid} />;
}
