"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { backendFetch, normalizeBackendError, unwrapList } from "@/lib/backend";
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import PageShell from "@/src/components/ui/PageShell";
import SectionCard from "@/src/components/ui/SectionCard";

import styles from "../../experiments.module.css";

type Block = {
  id: string;
  name: string;
  description: string;
};

export default function ExperimentSlotsPage() {
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
  const [saving, setSaving] = useState(false);
  const [offline, setOffline] = useState(false);
  const [notInvited, setNotInvited] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [blocks, setBlocks] = useState<Block[]>([]);

  const loadBlocks = useCallback(async () => {
    const response = await backendFetch(`/api/v1/experiments/${experimentId}/blocks/`);
    if (!response.ok) {
      throw new Error("Unable to load blocks.");
    }
    const payload = (await response.json()) as unknown;
    setBlocks(unwrapList<Block>(payload));
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
        await loadBlocks();
      } catch (requestError) {
        const normalized = normalizeBackendError(requestError);
        if (normalized.kind === "offline") {
          setOffline(true);
        }
        setError("Unable to load slots.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [experimentId, loadBlocks]);

  async function createDefaults() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await backendFetch(
        `/api/v1/experiments/${experimentId}/blocks/defaults`,
        { method: "POST" },
      );
      if (!response.ok) {
        setError("Unable to create default blocks.");
        return;
      }
      const payload = (await response.json()) as { blocks?: Block[] };
      if (Array.isArray(payload.blocks)) {
        setBlocks(payload.blocks);
      } else {
        await loadBlocks();
      }
      setNotice("Default blocks created.");
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to create default blocks.");
    } finally {
      setSaving(false);
    }
  }

  async function saveBlock(block: Block) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await backendFetch(`/api/v1/blocks/${block.id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: block.description }),
      });
      if (!response.ok) {
        setError("Unable to save block.");
        return;
      }
      setNotice(`${block.name} saved.`);
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to save block.");
    } finally {
      setSaving(false);
    }
  }

  if (notInvited) {
    return (
      <PageShell title="Slots">
        <SectionCard>
          <IllustrationPlaceholder inventoryId="ILL-001" kind="notInvited" />
        </SectionCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Slots"
      subtitle="Manage assignment slots (blocks)."
      actions={
        <Link className={styles.buttonPrimary} href={`/experiments/${experimentId}/overview`}>
          ← Overview
        </Link>
      }
    >
      {loading ? <p className={styles.mutedText}>Loading slots...</p> : null}
      {error ? <p className={styles.errorText}>{error}</p> : null}
      {notice ? <p className={styles.successText}>{notice}</p> : null}
      {offline ? <IllustrationPlaceholder inventoryId="ILL-003" kind="offline" /> : null}

      <SectionCard title="Blocks / Slots">
        {blocks.length === 0 ? (
          <div className={styles.stack}>
            <p className={styles.mutedText}>No slots found yet.</p>
            <button
              className={styles.buttonPrimary}
              type="button"
              disabled={saving}
              onClick={() => void createDefaults()}
            >
              {saving ? "Creating..." : "Create default blocks (B1-B4)"}
            </button>
          </div>
        ) : (
          <div className={styles.blocksList}>
            {blocks.map((block) => (
              <article className={styles.blockRow} key={block.id}>
                <strong>{block.name}</strong>
                <textarea
                  className={styles.textarea}
                  value={block.description}
                  onChange={(event) =>
                    setBlocks((prev) =>
                      prev.map((item) =>
                        item.id === block.id
                          ? { ...item, description: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
                <button
                  className={styles.buttonSecondary}
                  type="button"
                  disabled={saving}
                  onClick={() => void saveBlock(block)}
                >
                  Save slot
                </button>
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </PageShell>
  );
}
