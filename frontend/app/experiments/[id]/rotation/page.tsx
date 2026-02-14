"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { backendFetch, normalizeBackendError } from "@/lib/backend";
import {
  fetchExperimentStatusSummary,
  type ExperimentStatusSummary,
} from "@/lib/experiment-status";
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import PageShell from "@/src/components/ui/PageShell";
import ResponsiveList from "@/src/components/ui/ResponsiveList";
import SectionCard from "@/src/components/ui/SectionCard";

import styles from "../../experiments.module.css";

type RotationTray = {
  tray_id: string;
  tray_name: string;
  current_block_id: string | null;
  current_block_name: string | null;
  plant_count: number;
};

type RotationLog = {
  id: string;
  tray_name: string;
  from_block_name: string | null;
  to_block_name: string | null;
  occurred_at: string;
  note: string;
};

type RotationSummary = {
  trays: RotationTray[];
  recent_logs: RotationLog[];
  unplaced_trays_count: number;
};

type BlockOption = {
  id: string;
  name: string;
};

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export default function RotationPage() {
  const params = useParams();
  const router = useRouter();
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
  const [saving, setSaving] = useState(false);
  const [notInvited, setNotInvited] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [statusSummary, setStatusSummary] = useState<ExperimentStatusSummary | null>(null);
  const [summary, setSummary] = useState<RotationSummary | null>(null);
  const [blocks, setBlocks] = useState<BlockOption[]>([]);
  const [selectedTrayId, setSelectedTrayId] = useState("");
  const [selectedToBlockId, setSelectedToBlockId] = useState("");
  const [note, setNote] = useState("");

  const running = statusSummary?.lifecycle.state === "running";

  const loadSummary = useCallback(async () => {
    const [statusResponse, rotationResponse, blocksResponse] = await Promise.all([
      fetchExperimentStatusSummary(experimentId),
      backendFetch(`/api/v1/experiments/${experimentId}/rotation/summary`),
      backendFetch(`/api/v1/experiments/${experimentId}/blocks/`),
    ]);
    if (!statusResponse) {
      throw new Error("Unable to load experiment status.");
    }
    if (!rotationResponse.ok) {
      throw new Error("Unable to load rotation summary.");
    }
    if (!blocksResponse.ok) {
      throw new Error("Unable to load blocks.");
    }
    setStatusSummary(statusResponse);
    setSummary((await rotationResponse.json()) as RotationSummary);
    setBlocks((await blocksResponse.json()) as BlockOption[]);
  }, [experimentId]);

  useEffect(() => {
    async function load() {
      if (!experimentId) {
        return;
      }
      setLoading(true);
      setError("");
      setOffline(false);
      try {
        const meResponse = await backendFetch("/api/me");
        if (meResponse.status === 403) {
          setNotInvited(true);
          return;
        }

        const status = await fetchExperimentStatusSummary(experimentId);
        if (!status) {
          setError("Unable to load experiment status.");
          return;
        }
        if (!status.setup.is_complete) {
          router.replace(`/experiments/${experimentId}/setup`);
          return;
        }

        await loadSummary();
      } catch (requestError) {
        const normalized = normalizeBackendError(requestError);
        if (normalized.kind === "offline") {
          setOffline(true);
        }
        setError("Unable to load rotation page.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [experimentId, loadSummary, router]);

  async function submitLogMove() {
    if (!selectedTrayId) {
      setError("Select a tray first.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await backendFetch(`/api/v1/experiments/${experimentId}/rotation/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tray_id: selectedTrayId,
          to_block_id: selectedToBlockId || null,
          note: note.trim() || undefined,
        }),
      });
      const payload = (await response.json()) as { detail?: string };
      if (!response.ok) {
        setError(payload.detail || "Unable to log move.");
        return;
      }

      setNotice("Move logged.");
      setNote("");
      await loadSummary();
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to log move.");
    } finally {
      setSaving(false);
    }
  }

  if (notInvited) {
    return (
      <PageShell title="Rotation">
        <SectionCard>
          <IllustrationPlaceholder inventoryId="ILL-001" kind="notInvited" />
        </SectionCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Rotation"
      subtitle="Log tray moves and review recent rotation history."
      actions={
        <Link className={styles.buttonPrimary} href={`/experiments/${experimentId}/overview`}>
          ← Overview
        </Link>
      }
    >
      {loading ? <p className={styles.mutedText}>Loading rotation...</p> : null}
      {error ? <p className={styles.errorText}>{error}</p> : null}
      {notice ? <p className={styles.successText}>{notice}</p> : null}
      {offline ? <IllustrationPlaceholder inventoryId="ILL-003" kind="offline" /> : null}

      {statusSummary ? (
        <SectionCard title="Experiment State">
          <span className={styles.badgeWarn}>
            {statusSummary.lifecycle.state.toUpperCase()}
          </span>
        </SectionCard>
      ) : null}

      {!running ? (
        <SectionCard title="Rotation Requires Running State">
          <p className={styles.mutedText}>
            Rotation logs are intended for running experiments. Start the experiment first.
          </p>
          <Link className={styles.buttonPrimary} href={`/experiments/${experimentId}/overview`}>
            Start experiment from Overview
          </Link>
        </SectionCard>
      ) : null}

      {running && summary ? (
        <>
          <SectionCard title="Log a Move">
            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Tray</span>
                <select
                  className={styles.select}
                  value={selectedTrayId}
                  onChange={(event) => setSelectedTrayId(event.target.value)}
                >
                  <option value="">Select tray</option>
                  {summary.trays.map((tray) => (
                    <option key={tray.tray_id} value={tray.tray_id}>
                      {tray.tray_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Destination block</span>
                <select
                  className={styles.select}
                  value={selectedToBlockId}
                  onChange={(event) => setSelectedToBlockId(event.target.value)}
                >
                  <option value="">None / Unassigned</option>
                  {blocks.map((block) => (
                    <option key={block.id} value={block.id}>
                      {block.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Note (optional)</span>
                <textarea
                  className={styles.textarea}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
              <button
                className={styles.buttonPrimary}
                type="button"
                disabled={saving || !selectedTrayId}
                onClick={() => void submitLogMove()}
              >
                {saving ? "Logging..." : "Log move"}
              </button>
            </div>
          </SectionCard>

          <SectionCard title="Current Tray Locations">
            <p className={styles.mutedText}>
              Unplaced trays: {summary.unplaced_trays_count}
            </p>
            <ResponsiveList
              items={summary.trays}
              getKey={(tray) => tray.tray_id}
              columns={[
                { key: "tray", label: "Tray", render: (tray) => tray.tray_name },
                {
                  key: "block",
                  label: "Current Block",
                  render: (tray) => tray.current_block_name || "Unassigned",
                },
                { key: "count", label: "Plants", render: (tray) => tray.plant_count },
                {
                  key: "move",
                  label: "Action",
                  render: (tray) => (
                    <button
                      className={styles.buttonSecondary}
                      type="button"
                      onClick={() => {
                        setSelectedTrayId(tray.tray_id);
                        setSelectedToBlockId(tray.current_block_id || "");
                      }}
                    >
                      Move
                    </button>
                  ),
                },
              ]}
              renderMobileCard={(tray) => (
                <div className={styles.cardKeyValue}>
                  <span>Tray</span>
                  <strong>{tray.tray_name}</strong>
                  <span>Current block</span>
                  <strong>{tray.current_block_name || "Unassigned"}</strong>
                  <span>Plants</span>
                  <strong>{tray.plant_count}</strong>
                  <button
                    className={styles.buttonSecondary}
                    type="button"
                    onClick={() => {
                      setSelectedTrayId(tray.tray_id);
                      setSelectedToBlockId(tray.current_block_id || "");
                    }}
                  >
                    Move
                  </button>
                </div>
              )}
            />
          </SectionCard>

          <SectionCard title="Recent Moves">
            <ResponsiveList
              items={summary.recent_logs}
              getKey={(log) => log.id}
              columns={[
                { key: "tray", label: "Tray", render: (log) => log.tray_name },
                {
                  key: "from_to",
                  label: "Move",
                  render: (log) =>
                    `${log.from_block_name || "Unassigned"} -> ${log.to_block_name || "Unassigned"}`,
                },
                { key: "time", label: "Time", render: (log) => formatDateTime(log.occurred_at) },
                { key: "note", label: "Note", render: (log) => log.note || "-" },
              ]}
              renderMobileCard={(log) => (
                <div className={styles.cardKeyValue}>
                  <span>Tray</span>
                  <strong>{log.tray_name}</strong>
                  <span>Move</span>
                  <strong>
                    {log.from_block_name || "Unassigned"}{" -> "}{
                      log.to_block_name || "Unassigned"
                    }
                  </strong>
                  <span>Time</span>
                  <strong>{formatDateTime(log.occurred_at)}</strong>
                  <span>Note</span>
                  <strong>{log.note || "-"}</strong>
                </div>
              )}
              emptyState={<p className={styles.mutedText}>No moves logged yet.</p>}
            />
          </SectionCard>
        </>
      ) : null}
    </PageShell>
  );
}
