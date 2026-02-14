"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { backendFetch, backendUrl } from "@/lib/backend";
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import PageShell from "@/src/components/ui/PageShell";
import ResponsiveList from "@/src/components/ui/ResponsiveList";
import SectionCard from "@/src/components/ui/SectionCard";
import styles from "../../experiments.module.css";

type PlantRow = {
  id: string;
  species_name: string;
  plant_id: string;
  cultivar: string | null;
  status: string;
};

export default function ExperimentPlantsPage() {
  const params = useParams();
  const experimentId = useMemo(() => {
    if (typeof params.id === "string") {
      return params.id;
    }
    if (Array.isArray(params.id)) {
      return params.id[0] ?? "";
    }
    return "";
  }, [params]);

  const [loading, setLoading] = useState(true);
  const [notInvited, setNotInvited] = useState(false);
  const [error, setError] = useState("");
  const [plants, setPlants] = useState<PlantRow[]>([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const me = await backendFetch("/api/me");
        if (me.status === 403) {
          setNotInvited(true);
          return;
        }
        const response = await backendFetch(
          `/api/v1/experiments/${experimentId}/plants/`,
        );
        if (!response.ok) {
          setError("Unable to load plants.");
          return;
        }
        const data = (await response.json()) as PlantRow[];
        setPlants(data);
      } catch {
        setError("Unable to load plants.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [experimentId]);

  function downloadLabels() {
    window.open(
      backendUrl(`/api/v1/experiments/${experimentId}/plants/labels.pdf?mode=all`),
      "_blank",
      "noopener,noreferrer",
    );
  }

  if (notInvited) {
    return (
      <PageShell title="Plants">
        <SectionCard>
          <IllustrationPlaceholder inventoryId="ILL-001" kind="notInvited" />
        </SectionCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Plants"
      subtitle={`Experiment: ${experimentId}`}
      actions={
        <div className={styles.actions}>
          <button
            className={styles.buttonPrimary}
            type="button"
            onClick={downloadLabels}
          >
            Download labels PDF
          </button>
          <Link
            className={styles.buttonSecondary}
            href={`/experiments/${experimentId}/setup`}
          >
            Back to setup
          </Link>
        </div>
      }
    >
      <SectionCard title="Plant Inventory">
        {loading ? <p className={styles.mutedText}>Loading...</p> : null}
        {error ? <p className={styles.errorText}>{error}</p> : null}
        {!loading && !error ? (
          <ResponsiveList
            items={plants}
            getKey={(plant) => plant.id}
            columns={[
              {
                key: "plant_id",
                label: "Plant ID",
                render: (plant) => plant.plant_id || "(pending)",
              },
              {
                key: "species",
                label: "Species",
                render: (plant) => plant.species_name,
              },
              {
                key: "cultivar",
                label: "Cultivar",
                render: (plant) => plant.cultivar || "-",
              },
              {
                key: "status",
                label: "Status",
                render: (plant) => plant.status,
              },
            ]}
            renderMobileCard={(plant) => (
              <div className={styles.cardKeyValue}>
                <span>Plant ID</span>
                <strong>{plant.plant_id || "(pending)"}</strong>
                <span>Species</span>
                <strong>{plant.species_name}</strong>
                <span>Cultivar</span>
                <strong>{plant.cultivar || "-"}</strong>
                <span>Status</span>
                <strong>{plant.status}</strong>
              </div>
            )}
            emptyState={
              <IllustrationPlaceholder inventoryId="ILL-201" kind="noPlants" />
            }
          />
        ) : null}
      </SectionCard>
    </PageShell>
  );
}
