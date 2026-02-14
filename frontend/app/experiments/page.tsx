"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { backendFetch } from "@/lib/backend";
import styles from "./experiments.module.css";

type Experiment = {
  id: string;
  name: string;
  description: string;
  status: string;
};

export default function ExperimentsPage() {
  const [items, setItems] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [notInvited, setNotInvited] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const meResponse = await backendFetch("/api/me");
        if (meResponse.status === 403) {
          setNotInvited(true);
          return;
        }

        const response = await backendFetch("/api/v1/experiments/");
        if (!response.ok) {
          setError("Unable to load experiments.");
          return;
        }
        const data = (await response.json()) as
          | { results?: Experiment[] }
          | Experiment[];
        const experiments = Array.isArray(data) ? data : data.results ?? [];
        setItems(experiments);
      } catch {
        setError("Unable to load experiments.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  if (notInvited) {
    return (
      <div className={styles.page}>
        <main className={styles.container}>
          <h1>Experiments</h1>
          <p className={styles.error}>Not invited.</p>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <main className={styles.container}>
        <header className={styles.header}>
          <h1>Experiments</h1>
          <p className={styles.muted}>
            Create and configure experiments with setup packets.
          </p>
          <div className={styles.actions}>
            <Link className={styles.button} href="/experiments/new">
              New experiment
            </Link>
            <Link className={styles.secondaryButton} href="/">
              Back home
            </Link>
          </div>
        </header>

        {loading ? <p>Loading...</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}

        {!loading && !error ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Setup</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={3} className={styles.muted}>
                    No experiments yet.
                  </td>
                </tr>
              ) : (
                items.map((experiment) => (
                  <tr key={experiment.id}>
                    <td>{experiment.name}</td>
                    <td>{experiment.status}</td>
                    <td>
                      <Link href={`/experiments/${experiment.id}/setup`}>
                        Open setup
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : null}
      </main>
    </div>
  );
}
