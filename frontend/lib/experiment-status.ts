import { backendFetch } from "@/lib/backend";

export type ExperimentStatusSummary = {
  setup: {
    is_complete: boolean;
    missing: {
      plants: boolean;
      tents: boolean;
      slots: boolean;
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
      needs_placement: number;
      needs_plant_recipe: number;
      needs_tent_restriction: number;
    };
    meta: {
      reason_counts: Record<string, number>;
      missing_setup: string[];
    };
  };
  schedule: {
    next_scheduled_slot: {
      date: string;
      timeframe: string | null;
      exact_time: string | null;
      actions_count: number;
    } | null;
    due_counts_today: number;
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
