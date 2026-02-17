"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { backendFetch, normalizeBackendError, unwrapList } from "@/lib/backend";
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import PageShell from "@/src/components/ui/PageShell";
import SectionCard from "@/src/components/ui/SectionCard";

import styles from "../../experiments.module.css";

type Recipe = {
  id: string;
  code: string;
  name: string;
  notes: string;
};

export default function RecipesPage() {
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
  const [notInvited, setNotInvited] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [code, setCode] = useState("R0");
  const [name, setName] = useState("Control");
  const [notes, setNotes] = useState("");

  const loadRecipes = useCallback(async () => {
    const response = await backendFetch(`/api/v1/experiments/${experimentId}/recipes`);
    if (!response.ok) {
      throw new Error("Unable to load recipes.");
    }
    const payload = (await response.json()) as unknown;
    setRecipes(unwrapList<Recipe>(payload));
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
        await loadRecipes();
      } catch (requestError) {
        const normalized = normalizeBackendError(requestError);
        if (normalized.kind === "offline") {
          setOffline(true);
        }
        setError("Unable to load recipes.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [experimentId, loadRecipes]);

  async function createRecipe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await backendFetch(`/api/v1/experiments/${experimentId}/recipes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          name: name.trim(),
          notes: notes.trim(),
        }),
      });
      const payload = (await response.json()) as { detail?: string };
      if (!response.ok) {
        setError(payload.detail || "Unable to create recipe.");
        return;
      }

      setNotice("Recipe created.");
      setCode(`R${recipes.length}`);
      setName(`Treatment ${Math.max(1, recipes.length)}`);
      setNotes("");
      await loadRecipes();
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to create recipe.");
    } finally {
      setSaving(false);
    }
  }

  async function updateRecipe(recipe: Recipe, updates: Partial<Recipe>) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await backendFetch(`/api/v1/recipes/${recipe.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const payload = (await response.json()) as { detail?: string };
      if (!response.ok) {
        setError(payload.detail || "Unable to update recipe.");
        return;
      }
      setNotice("Recipe updated.");
      await loadRecipes();
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to update recipe.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRecipe(recipe: Recipe) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await backendFetch(`/api/v1/recipes/${recipe.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = (await response.json()) as { detail?: string };
        setError(payload.detail || "Unable to delete recipe.");
        return;
      }
      setNotice("Recipe deleted.");
      await loadRecipes();
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to delete recipe.");
    } finally {
      setSaving(false);
    }
  }

  if (notInvited) {
    return (
      <PageShell title="Recipes">
        <SectionCard>
          <IllustrationPlaceholder inventoryId="ILL-001" kind="notInvited" />
        </SectionCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Recipes"
      subtitle="Manage experiment recipes used for per-plant assignment and feeding."
      actions={
        <Link className={styles.buttonPrimary} href={`/experiments/${experimentId}/overview`}>
          ← Overview
        </Link>
      }
    >
      {loading ? <p className={styles.mutedText}>Loading recipes...</p> : null}
      {error ? <p className={styles.errorText}>{error}</p> : null}
      {notice ? <p className={styles.successText}>{notice}</p> : null}
      {offline ? <IllustrationPlaceholder inventoryId="ILL-003" kind="offline" /> : null}

      <SectionCard title="Create Recipe">
        <form className={styles.formGrid} onSubmit={(event) => void createRecipe(event)}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Code</span>
            <input className={styles.input} value={code} onChange={(event) => setCode(event.target.value)} />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Name</span>
            <input className={styles.input} value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Notes</span>
            <textarea
              className={styles.textarea}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          <button className={styles.buttonPrimary} type="submit" disabled={saving}>
            {saving ? "Saving..." : "Add recipe"}
          </button>
        </form>
      </SectionCard>

      <SectionCard title="Existing Recipes">
        <div className={styles.blocksList}>
          {recipes.map((recipe) => (
            <article key={recipe.id} className={styles.blockRow}>
              <strong>{recipe.code}</strong>
              <input
                className={styles.input}
                value={recipe.name}
                onChange={(event) => {
                  const next = event.target.value;
                  setRecipes((current) =>
                    current.map((item) => (item.id === recipe.id ? { ...item, name: next } : item)),
                  );
                }}
                onBlur={() => void updateRecipe(recipe, { name: recipe.name })}
              />
              <textarea
                className={styles.textarea}
                value={recipe.notes}
                onChange={(event) => {
                  const next = event.target.value;
                  setRecipes((current) =>
                    current.map((item) => (item.id === recipe.id ? { ...item, notes: next } : item)),
                  );
                }}
                onBlur={() => void updateRecipe(recipe, { notes: recipe.notes })}
              />
              <button className={styles.buttonDanger} type="button" onClick={() => void deleteRecipe(recipe)}>
                Delete
              </button>
            </article>
          ))}
          {recipes.length === 0 ? <p className={styles.mutedText}>No recipes yet.</p> : null}
        </div>
      </SectionCard>
    </PageShell>
  );
}
