export type ExperimentOverviewPlantsParams = {
  filter?: string;
  q?: string;
};

function normalizeOverviewPlantsParams(
  params?: ExperimentOverviewPlantsParams,
): ExperimentOverviewPlantsParams | undefined {
  if (!params) {
    return undefined;
  }

  const next: ExperimentOverviewPlantsParams = {};
  const filter = params.filter?.trim();
  const q = params.q?.trim();

  if (filter) {
    next.filter = filter;
  }
  if (q) {
    next.q = q;
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

export function experimentStatus(experimentId: string) {
  return ["experiment", experimentId, "status", "summary"] as const;
}

export function experimentOverviewPlants(
  experimentId: string,
  params?: ExperimentOverviewPlantsParams,
) {
  const normalized = normalizeOverviewPlantsParams(params);
  if (normalized) {
    return [
      "experiment",
      experimentId,
      "overview",
      "plants",
      normalized,
    ] as const;
  }
  return ["experiment", experimentId, "overview", "plants"] as const;
}

export const queryKeys = {
  experimentStatus,
  experimentOverviewPlants,
};
