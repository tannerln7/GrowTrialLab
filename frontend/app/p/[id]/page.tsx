"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { backendFetch, normalizeBackendError } from "@/lib/backend";
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import PageShell from "@/src/components/ui/PageShell";
import SectionCard from "@/src/components/ui/SectionCard";
import styles from "../../experiments/experiments.module.css";

type PlantDetail = {
  uuid: string;
  plant_id: string;
  species: {
    id: string;
    name: string;
    category: string;
  };
  cultivar: string | null;
  status: string;
  baseline_notes: string;
  experiment: {
    id: string;
    name: string;
  };
  assigned_recipe: {
    id: string;
    code: string;
    name: string;
  } | null;
  created_at: string;
  updated_at: string;
};

type BaselineStatusSummary = {
  baseline_locked: boolean;
};

export default function PlantQrPage() {
  const params = useParams();
  const plantUuid = useMemo(() => {
    if (typeof params.id === "string") {
      return params.id;
    }
    if (Array.isArray(params.id)) {
      return params.id[0] ?? "";
    }
    return "";
  }, [params]);

  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [notInvited, setNotInvited] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");
  const [plant, setPlant] = useState<PlantDetail | null>(null);
  const [baselineLocked, setBaselineLocked] = useState(false);

  useEffect(() => {
    async function loadPlant() {
      if (!plantUuid) {
        setLoading(false);
        setNotFound(true);
        return;
      }

      setLoading(true);
      setError("");
      setNotInvited(false);
      setNotFound(false);

      try {
        const response = await backendFetch(`/api/v1/plants/${plantUuid}/`);
        if (response.status === 403) {
          setNotInvited(true);
          return;
        }
        if (response.status === 404) {
          setNotFound(true);
          return;
        }
        if (!response.ok) {
          setError("Unable to load plant details.");
          return;
        }
        const data = (await response.json()) as PlantDetail;
        setPlant(data);
        setOffline(false);
      } catch (requestError) {
        const normalizedError = normalizeBackendError(requestError);
        if (normalizedError.kind === "offline") {
          setOffline(true);
        } else {
          setError("Unable to load plant details.");
        }
      } finally {
        setLoading(false);
      }
    }

    void loadPlant();
  }, [plantUuid]);

  useEffect(() => {
    async function loadBaselineStatus() {
      if (!plant) {
        return;
      }
      try {
        const response = await backendFetch(
          `/api/v1/experiments/${plant.experiment.id}/baseline/status`,
        );
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as BaselineStatusSummary;
        setBaselineLocked(Boolean(data.baseline_locked));
      } catch {
        // Keep this non-fatal for QR landing.
      }
    }

    void loadBaselineStatus();
  }, [plant]);

  if (notInvited) {
    return (
      <PageShell title="Plant Details">
        <SectionCard>
          <IllustrationPlaceholder inventoryId="ILL-001" kind="notInvited" />
        </SectionCard>
      </PageShell>
    );
  }

  if (notFound) {
    return (
      <PageShell title="Plant Details">
        <SectionCard>
          <IllustrationPlaceholder
            inventoryId="ILL-203"
            kind="error"
            title="Plant Not Found"
            subtitle="No plant exists for this QR code."
          />
        </SectionCard>
      </PageShell>
    );
  }

  return (
    <PageShell title="Plant Details" subtitle={plantUuid || "Unknown plant"}>
      <SectionCard>
        {loading ? <p className={styles.mutedText}>Loading plant details...</p> : null}
        {error ? <p className={styles.errorText}>{error}</p> : null}
        {offline ? (
          <IllustrationPlaceholder inventoryId="ILL-003" kind="offline" />
        ) : null}

        {plant ? (
          <div className={styles.stack}>
            <div className={styles.cardKeyValue}>
              <span>Plant ID</span>
              <strong>{plant.plant_id || "(pending)"}</strong>
              <span>Species</span>
              <strong>{plant.species.name}</strong>
              <span>Category</span>
              <strong>{plant.species.category || "-"}</strong>
              <span>Cultivar</span>
              <strong>{plant.cultivar || "-"}</strong>
              <span>Status</span>
              <strong>{plant.status}</strong>
              <span>Assigned Group</span>
              <strong>{plant.assigned_recipe?.code || "(unassigned)"}</strong>
            </div>

            <div className={styles.actions}>
              <Link
                className={styles.buttonPrimary}
                href={`/experiments/${plant.experiment.id}/setup`}
              >
                Open Experiment Setup
              </Link>
              <Link
                className={styles.buttonSecondary}
                href={`/experiments/${plant.experiment.id}/baseline?plant=${plant.uuid}`}
              >
                Baseline Capture
              </Link>
              <Link
                className={styles.buttonSecondary}
                href={`/experiments/${plant.experiment.id}/plants`}
              >
                Open Plants List
              </Link>
            </div>
            {baselineLocked ? (
              <p className={styles.mutedText}>
                Baseline is locked for this experiment.
              </p>
            ) : null}
          </div>
        ) : null}
      </SectionCard>
    </PageShell>
  );
}
