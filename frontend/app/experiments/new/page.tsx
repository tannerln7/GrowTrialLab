"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { backendFetch } from "@/lib/backend";
import AppMarkPlaceholder from "@/src/components/AppMarkPlaceholder";
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import styles from "../experiments.module.css";

export default function NewExperimentPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notInvited, setNotInvited] = useState(false);

  useEffect(() => {
    async function checkAccess() {
      try {
        const response = await backendFetch("/api/me");
        if (response.status === 403) {
          setNotInvited(true);
        }
      } catch {
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
      router.push(`/experiments/${data.id}/setup`);
    } catch {
      setError("Unable to create experiment.");
    } finally {
      setSaving(false);
    }
  }

  if (notInvited) {
    return (
      <div className={styles.page}>
        <main className={styles.container}>
          <AppMarkPlaceholder />
          <h1>New experiment</h1>
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
          <h1>New experiment</h1>
          <p className={styles.muted}>
            Start an experiment and continue to setup packets.
          </p>
        </header>

        <form className={styles.formGrid} onSubmit={onSubmit}>
          <label className={styles.field}>
            Name
            <input
              className={styles.input}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>

          <label className={styles.field}>
            Description
            <textarea
              className={styles.textarea}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>

          <div className={styles.actions}>
            <button className={styles.button} disabled={saving} type="submit">
              {saving ? "Creating..." : "Create experiment"}
            </button>
            <Link className={styles.secondaryButton} href="/experiments">
              Cancel
            </Link>
          </div>

          {error ? <p className={styles.error}>{error}</p> : null}
        </form>
      </main>
    </div>
  );
}
