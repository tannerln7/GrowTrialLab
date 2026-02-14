"use client";

import Link from "next/link";
import { useState } from "react";

import { backendFetch } from "@/lib/backend";
import styles from "./page.module.css";

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");
  const [meLoading, setMeLoading] = useState(false);
  const [meResult, setMeResult] = useState<string>("No profile loaded.");

  async function checkBackendHealth() {
    setLoading(true);
    setResult("");
    try {
      const response = await backendFetch("/healthz");
      if (!response.ok) {
        throw new Error("Backend returned a non-OK response.");
      }
      const data = await response.json();
      setResult(JSON.stringify(data, null, 2));
    } catch {
      setResult("Unable to reach backend.");
    } finally {
      setLoading(false);
    }
  }

  async function loadMe() {
    setMeLoading(true);
    try {
      const response = await backendFetch("/api/me");
      if (response.status === 403) {
        setMeResult("Not invited.");
        return;
      }
      if (!response.ok) {
        setMeResult("Unable to load profile.");
        return;
      }
      const data = await response.json();
      setMeResult(`${data.email} (${data.role}, ${data.status})`);
    } catch {
      setMeResult("Unable to load profile.");
    } finally {
      setMeLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1>GrowTrialLab</h1>
        <p>Django API + Next.js frontend local dev scaffold.</p>
        <div className={styles.buttons}>
          <button
            className={styles.button}
            onClick={checkBackendHealth}
            disabled={loading}
            type="button"
          >
            {loading ? "Checking..." : "Check backend health"}
          </button>
          <button
            className={styles.button}
            onClick={loadMe}
            disabled={meLoading}
            type="button"
          >
            {meLoading ? "Loading..." : "Load my profile"}
          </button>
          <Link className={styles.button} href="/experiments">
            Experiments
          </Link>
        </div>
        <p className={styles.me}>{meResult}</p>
        <pre className={styles.output}>{result || "No result yet."}</pre>
      </main>
    </div>
  );
}
