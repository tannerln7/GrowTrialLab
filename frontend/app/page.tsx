"use client";

import { useState } from "react";
import styles from "./page.module.css";

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");

  async function checkBackendHealth() {
    setLoading(true);
    setResult("");
    try {
      let response = await fetch("http://localhost:8000/healthz");
      if (!response.ok) {
        throw new Error("Primary backend URL returned a non-OK response.");
      }
      let data = await response.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (_error) {
      try {
        const response = await fetch("http://host.docker.internal:8000/healthz");
        if (!response.ok) {
          throw new Error("Fallback backend URL returned a non-OK response.");
        }
        const data = await response.json();
        setResult(JSON.stringify(data, null, 2));
      } catch (_fallbackError) {
        setResult("Unable to reach backend.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1>GrowTrialLab</h1>
        <p>Django API + Next.js frontend local dev scaffold.</p>
        <button
          className={styles.button}
          onClick={checkBackendHealth}
          disabled={loading}
          type="button"
        >
          {loading ? "Checking..." : "Check backend health"}
        </button>
        <pre className={styles.output}>{result || "No result yet."}</pre>
      </main>
    </div>
  );
}
