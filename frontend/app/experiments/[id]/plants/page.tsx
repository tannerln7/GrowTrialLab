"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { backendFetch, backendUrl } from "@/lib/backend";
import AppMarkPlaceholder from "@/src/components/AppMarkPlaceholder";
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
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
      <div className={styles.page}>
        <main className={styles.container}>
          <AppMarkPlaceholder />
          <h1>Plants</h1>
          <IllustrationPlaceholder inventoryId="ILL-001" kind="notInvited" />
        </main>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <main className={styles.container}>
        <header className={styles.header}>
          <AppMarkPlaceholder />
          <h1>Plants</h1>
          <p className={styles.muted}>Experiment: {experimentId}</p>
          <div className={styles.actions}>
            <button className={styles.button} type="button" onClick={downloadLabels}>
              Download labels PDF
            </button>
            <Link
              className={styles.secondaryButton}
              href={`/experiments/${experimentId}/setup`}
            >
              Back to setup
            </Link>
          </div>
        </header>

        {loading ? <p>Loading...</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}

        {!loading && !error && plants.length === 0 ? (
          <IllustrationPlaceholder inventoryId="ILL-201" kind="noPlants" />
        ) : null}

        {!loading && !error && plants.length > 0 ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Plant ID</th>
                <th>Species</th>
                <th>Cultivar</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {plants.map((plant) => (
                <tr key={plant.id}>
                  <td>{plant.plant_id || "(pending)"}</td>
                  <td>{plant.species_name}</td>
                  <td>{plant.cultivar || "-"}</td>
                  <td>{plant.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </main>
    </div>
  );
}
