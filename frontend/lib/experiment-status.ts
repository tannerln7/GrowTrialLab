import { backendFetch } from "@/lib/backend";

export type ExperimentStatusSummary = {
  setup: {
    is_complete: boolean;
    missing: {
      plants: boolean;
      blocks: boolean;
      recipes: boolean;
    };
  };
  lifecycle: {
    state: "draft" | "running" | "stopped";
    started_at: string | null;
    stopped_at: string | null;
  };
  readiness: {
    is_ready: boolean;
    ready_to_start: boolean;
    counts: {
      active_plants: number;
      needs_baseline: number;
      needs_assignment: number;
    };
  };
};

export async function fetchExperimentStatusSummary(
  experimentId: string,
): Promise<ExperimentStatusSummary | null> {
  const response = await backendFetch(
    `/api/v1/experiments/${experimentId}/status/summary`,
  );
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as ExperimentStatusSummary;
}
