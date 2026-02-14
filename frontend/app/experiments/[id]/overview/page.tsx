"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { backendFetch, normalizeBackendError } from "@/lib/backend";
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import PageShell from "@/src/components/ui/PageShell";
import ResponsiveList from "@/src/components/ui/ResponsiveList";
import SectionCard from "@/src/components/ui/SectionCard";
import styles from "../../experiments.module.css";

type FilterId =
  | "all"
  | "needs_baseline"
  | "needs_bin"
  | "needs_assignment"
  | "active"
  | "removed";

type OverviewPlant = {
  uuid: string;
  plant_id: string;
  species_name: string;
  species_category: string;
  cultivar: string | null;
  status: string;
  bin: string | null;
  assigned_recipe_code: string | null;
  has_baseline: boolean;
};

type OverviewCounts = {
  total: number;
  active: number;
  removed: number;
  needs_baseline: number;
  needs_bin: number;
  needs_assignment: number;
};

type OverviewResponse = {
  counts: OverviewCounts;
  plants: OverviewPlant[];
};

const FILTERS: Array<{ id: FilterId; label: string }> = [
  { id: "all", label: "All" },
  { id: "needs_baseline", label: "Needs Baseline" },
  { id: "needs_bin", label: "Needs Bin" },
  { id: "needs_assignment", label: "Needs Assignment" },
  { id: "active", label: "Active" },
  { id: "removed", label: "Removed" },
];

export default function ExperimentOverviewPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const experimentId = useMemo(() => {
    if (typeof params.id === "string") {
      return params.id;
    }
    if (Array.isArray(params.id)) {
      return params.id[0] ?? "";
    }
    return "";
  }, [params]);

  const activeFilter = useMemo<FilterId>(() => {
    const value = searchParams.get("filter");
    if (
      value === "needs_baseline" ||
      value === "needs_bin" ||
      value === "needs_assignment" ||
      value === "active" ||
      value === "removed"
    ) {
      return value;
    }
    return "all";
  }, [searchParams]);
  const queryValue = searchParams.get("q") ?? "";

  const [loading, setLoading] = useState(true);
  const [notInvited, setNotInvited] = useState(false);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  const [experimentName, setExperimentName] = useState("");
  const [data, setData] = useState<OverviewResponse>({
    counts: {
      total: 0,
      active: 0,
      removed: 0,
      needs_baseline: 0,
      needs_bin: 0,
      needs_assignment: 0,
    },
    plants: [],
  });

  useEffect(() => {
    async function load() {
      if (!experimentId) {
        return;
      }
      setLoading(true);
      setError("");
      setNotInvited(false);
      try {
        const meResponse = await backendFetch("/api/me");
        if (meResponse.status === 403) {
          setNotInvited(true);
          return;
        }

        const [overviewResponse, experimentResponse] = await Promise.all([
          backendFetch(`/api/v1/experiments/${experimentId}/overview/plants`),
          backendFetch(`/api/v1/experiments/${experimentId}/`),
        ]);

        if (!overviewResponse.ok) {
          setError("Unable to load overview.");
          return;
        }

        const overviewPayload = (await overviewResponse.json()) as OverviewResponse;
        setData(overviewPayload);
        if (experimentResponse.ok) {
          const experimentPayload = (await experimentResponse.json()) as { name?: string };
          setExperimentName(experimentPayload.name ?? "");
        }
        setOffline(false);
      } catch (requestError) {
        const normalizedError = normalizeBackendError(requestError);
        if (normalizedError.kind === "offline") {
          setOffline(true);
        }
        setError("Unable to load overview.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [experimentId]);

  function updateQuery(nextFilter: FilterId, nextQ: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (nextFilter === "all") {
      next.delete("filter");
    } else {
      next.set("filter", nextFilter);
    }
    if (nextQ.trim()) {
      next.set("q", nextQ);
    } else {
      next.delete("q");
    }
    const query = next.toString();
    router.replace(`/experiments/${experimentId}/overview${query ? `?${query}` : ""}`);
  }

  const filteredPlants = useMemo(() => {
    const normalizedQuery = queryValue.trim().toLowerCase();
    return data.plants.filter((plant) => {
      const needsBaseline = plant.status === "active" && !plant.has_baseline;
      const needsBin = plant.status === "active" && !plant.bin;
      const needsAssignment = plant.status === "active" && !plant.assigned_recipe_code;

      let matchesFilter = true;
      if (activeFilter === "needs_baseline") {
        matchesFilter = needsBaseline;
      } else if (activeFilter === "needs_bin") {
        matchesFilter = needsBin;
      } else if (activeFilter === "needs_assignment") {
        matchesFilter = needsAssignment;
      } else if (activeFilter === "active") {
        matchesFilter = plant.status === "active";
      } else if (activeFilter === "removed") {
        matchesFilter = plant.status !== "active";
      }

      if (!matchesFilter) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      return (
        plant.plant_id.toLowerCase().includes(normalizedQuery) ||
        plant.species_name.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [data.plants, activeFilter, queryValue]);

  const overviewPathWithFilters = useMemo(() => {
    const query = searchParams.toString();
    return `/experiments/${experimentId}/overview${query ? `?${query}` : ""}`;
  }, [searchParams, experimentId]);

  function plantNeedsLabels(plant: OverviewPlant): string[] {
    const needs: string[] = [];
    if (plant.status === "active" && !plant.has_baseline) {
      needs.push("Needs Baseline");
    }
    if (plant.status === "active" && !plant.bin) {
      needs.push("Needs Bin");
    }
    if (plant.status === "active" && !plant.assigned_recipe_code) {
      needs.push("Needs Assignment");
    }
    return needs;
  }

  if (notInvited) {
    return (
      <PageShell title="Overview">
        <SectionCard>
          <IllustrationPlaceholder inventoryId="ILL-001" kind="notInvited" />
        </SectionCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Overview"
      subtitle={experimentName ? `${experimentName}` : `Experiment: ${experimentId}`}
      actions={
        <div className={styles.actions}>
          <Link className={styles.buttonSecondary} href={`/experiments/${experimentId}/setup`}>
            Open setup
          </Link>
          <Link className={styles.buttonSecondary} href={`/experiments/${experimentId}/plants`}>
            Plants list
          </Link>
        </div>
      }
    >
      <SectionCard>
        <p className={styles.inlineNote}>
          Tap a plant to open its action page. Scan QR codes to jump directly to a plant.
        </p>
      </SectionCard>

      <SectionCard title="Status Filters">
        <div className={styles.tileGrid}>
          {FILTERS.map((filter) => {
            const count =
              filter.id === "all"
                ? data.counts.total
                : filter.id === "active"
                  ? data.counts.active
                  : filter.id === "removed"
                    ? data.counts.removed
                    : filter.id === "needs_baseline"
                      ? data.counts.needs_baseline
                      : filter.id === "needs_bin"
                        ? data.counts.needs_bin
                        : data.counts.needs_assignment;
            return (
              <button
                key={filter.id}
                type="button"
                className={`${styles.tileButton} ${
                  activeFilter === filter.id ? styles.tileButtonActive : ""
                }`}
                onClick={() => updateQuery(filter.id, queryValue)}
              >
                <span>{filter.label}</span>
                <strong>{count}</strong>
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Plant Queue">
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Search by plant ID or species</span>
          <input
            className={styles.input}
            value={queryValue}
            onChange={(event) => updateQuery(activeFilter, event.target.value)}
            placeholder="NP- or Nepenthes"
          />
        </label>

        {loading ? <p className={styles.mutedText}>Loading overview...</p> : null}
        {error ? <p className={styles.errorText}>{error}</p> : null}

        {!loading && !error ? (
          <ResponsiveList
            items={filteredPlants}
            getKey={(plant) => plant.uuid}
            columns={[
              {
                key: "plant_id",
                label: "Plant ID",
                render: (plant) => (
                  <Link
                    href={`/p/${plant.uuid}?from=${encodeURIComponent(overviewPathWithFilters)}`}
                  >
                    {plant.plant_id || "(pending)"}
                  </Link>
                ),
              },
              {
                key: "species",
                label: "Species",
                render: (plant) =>
                  `${plant.species_name}${plant.species_category ? ` (${plant.species_category})` : ""}`,
              },
              {
                key: "status",
                label: "Status",
                render: (plant) => plant.status,
              },
              {
                key: "bin",
                label: "Bin",
                render: (plant) => plant.bin || "Missing",
              },
              {
                key: "group",
                label: "Group",
                render: (plant) => plant.assigned_recipe_code || "Missing",
              },
            ]}
            renderMobileCard={(plant) => {
              const needs = plantNeedsLabels(plant);
              return (
                <div className={styles.cardKeyValue}>
                  <span>Plant ID</span>
                  <strong>
                    <Link
                      href={`/p/${plant.uuid}?from=${encodeURIComponent(overviewPathWithFilters)}`}
                    >
                      {plant.plant_id || "(pending)"}
                    </Link>
                  </strong>
                  <span>Species</span>
                  <strong>
                    {plant.species_name}
                    {plant.species_category ? ` (${plant.species_category})` : ""}
                  </strong>
                  <span>Status</span>
                  <strong>{plant.status}</strong>
                  <span>Bin</span>
                  <strong>{plant.bin || "Missing"}</strong>
                  <span>Group</span>
                  <strong>{plant.assigned_recipe_code || "Missing"}</strong>
                  <div className={styles.badgeRow}>
                    {needs.map((label) => (
                      <span className={styles.badgeWarn} key={label}>
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              );
            }}
            emptyState={
              data.plants.length === 0 ? (
                <div className={styles.stack}>
                  <IllustrationPlaceholder inventoryId="ILL-201" kind="noPlants" />
                  <Link className={styles.buttonPrimary} href={`/experiments/${experimentId}/setup`}>
                    Go to Plants step
                  </Link>
                </div>
              ) : (
                <p className={styles.mutedText}>No plants match the current filter.</p>
              )
            }
          />
        ) : null}
        {offline ? (
          <IllustrationPlaceholder inventoryId="ILL-003" kind="offline" />
        ) : null}
      </SectionCard>
    </PageShell>
  );
}
