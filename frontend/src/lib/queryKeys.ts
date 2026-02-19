export type ExperimentOverviewPlantsParams = {
  filter?: string;
  q?: string;
};

type QueryKeyPart =
  | string
  | number
  | boolean
  | null
  | undefined
  | Record<string, unknown>;

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

export function experimentRoot(experimentId: string) {
  return ["experiment", experimentId] as const;
}

export function systemRoot() {
  return ["system"] as const;
}

export function systemHealth() {
  return [...systemRoot(), "health"] as const;
}

export function systemMe() {
  return [...systemRoot(), "me"] as const;
}

export function experimentsRoot() {
  return ["experiments"] as const;
}

export function experimentsList() {
  return [...experimentsRoot(), "list"] as const;
}

export function experimentDetail(experimentId: string) {
  return [...experimentsRoot(), "detail", experimentId] as const;
}

export function experimentStatus(experimentId: string) {
  return [...experimentRoot(experimentId), "status", "summary"] as const;
}

export function experimentFeature(
  experimentId: string,
  featureName: string,
  ...parts: QueryKeyPart[]
) {
  return [...experimentRoot(experimentId), "feature", featureName, ...parts] as const;
}

export function plantRoot(plantUuid: string) {
  return ["plant", plantUuid] as const;
}

export function plantCockpit(plantUuid: string) {
  return [...plantRoot(plantUuid), "cockpit"] as const;
}

export function experimentOverviewPlants(
  experimentId: string,
  params?: ExperimentOverviewPlantsParams,
) {
  const normalized = normalizeOverviewPlantsParams(params);
  if (normalized) {
    return [...experimentFeature(experimentId, "overviewPlants"), normalized] as const;
  }
  return experimentFeature(experimentId, "overviewPlants");
}

export const queryKeys = {
  system: {
    root: systemRoot,
    health: systemHealth,
    me: systemMe,
  },
  experiments: {
    root: experimentsRoot,
    list: experimentsList,
    detail: experimentDetail,
  },
  experiment: {
    root: experimentRoot,
    status: experimentStatus,
    feature: experimentFeature,
  },
  plant: {
    root: plantRoot,
    cockpit: plantCockpit,
  },
  systemRoot,
  systemHealth,
  systemMe,
  experimentsRoot,
  experimentsList,
  experimentDetail,
  experimentRoot,
  experimentStatus,
  experimentFeature,
  experimentOverviewPlants,
  plantRoot,
  plantCockpit,
};
