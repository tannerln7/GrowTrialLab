import { redirect } from "next/navigation";

type ExperimentLandingProps = {
  params: Promise<{ id: string }>;
};

export default async function ExperimentLanding({ params }: ExperimentLandingProps) {
  const resolved = await params;
  redirect(`/experiments/${resolved.id}/overview`);
}
