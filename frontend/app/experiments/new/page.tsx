"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { backendFetch, normalizeBackendError } from "@/lib/backend";
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import PageShell from "@/src/components/ui/PageShell";
import SectionCard from "@/src/components/ui/SectionCard";
import styles from "../experiments.module.css";

export default function NewExperimentPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notInvited, setNotInvited] = useState(false);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    async function checkAccess() {
      try {
        const response = await backendFetch("/api/me");
        if (response.status === 403) {
          setNotInvited(true);
        }
      } catch (requestError) {
        const normalizedError = normalizeBackendError(requestError);
        if (normalizedError.kind === "offline") {
          setOffline(true);
        }
        setError("Unable to confirm access.");
      }
    }

    void checkAccess();
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);

    try {
      const response = await backendFetch("/api/v1/experiments/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
        }),
      });

      if (!response.ok) {
        setError("Unable to create experiment.");
        return;
      }

      const data = (await response.json()) as { id: string };
      router.push(`/experiments/${data.id}/overview`);
    } catch (requestError) {
      const normalizedError = normalizeBackendError(requestError);
      if (normalizedError.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to create experiment.");
    } finally {
      setSaving(false);
    }
  }

  if (notInvited) {
    return (
      <PageShell title="New Experiment">
        <SectionCard>
          <IllustrationPlaceholder inventoryId="ILL-001" kind="notInvited" />
        </SectionCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="New Experiment"
      subtitle="Start an experiment and continue through guided setup steps."
      actions={
        <Link className={styles.buttonSecondary} href="/experiments">
          Cancel
        </Link>
      }
    >
      <SectionCard title="Experiment Details">
        <form className={styles.formGrid} onSubmit={onSubmit}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Name</span>
            <input
              className={styles.input}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Description</span>
            <textarea
              className={styles.textarea}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>

          <div className={styles.actions}>
            <button
              className={styles.buttonPrimary}
              disabled={saving}
              type="submit"
            >
              {saving ? "Creating..." : "Create experiment"}
            </button>
            <Link className={styles.buttonSecondary} href="/experiments">
              Cancel
            </Link>
          </div>

          {error ? <p className={styles.errorText}>{error}</p> : null}
          {offline ? (
            <IllustrationPlaceholder inventoryId="ILL-003" kind="offline" />
          ) : null}
        </form>
      </SectionCard>
    </PageShell>
  );
}
