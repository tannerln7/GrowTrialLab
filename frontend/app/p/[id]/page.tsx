"use client";

import {
  AlertCircle,
  Camera,
  ChevronDown,
  ClipboardPlus,
  FlaskConical,
  RefreshCcw,
  ShieldAlert,
  Tag,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { backendFetch, backendUrl, normalizeBackendError, unwrapList } from "@/lib/backend";
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import { Badge } from "@/src/components/ui/badge";
import { buttonVariants } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { NativeSelect } from "@/src/components/ui/native-select";
import { Notice } from "@/src/components/ui/notice";
import PageShell from "@/src/components/ui/PageShell";
import { useRouteParamString } from "@/src/lib/useRouteParamString";
import { Popover, PopoverContent, PopoverTrigger } from "@/src/components/ui/popover";
import ResponsiveList from "@/src/components/ui/ResponsiveList";
import SectionCard from "@/src/components/ui/SectionCard";
import StickyActionBar from "@/src/components/ui/StickyActionBar";
import { Textarea } from "@/src/components/ui/textarea";

import { cockpitStyles as styles } from "@/src/components/ui/cockpit-styles";

type PlantPhoto = {
  id: string;
  url: string;
  created_at: string;
  tag: string;
  week_number: number | null;
};

type PlantCockpit = {
  plant: {
    uuid: string;
    plant_id: string;
    cultivar: string | null;
    status: string;
    grade: string | null;
    removed_at: string | null;
    removed_reason: string;
    species: {
      id: string;
      name: string;
      category: string;
    };
    experiment: {
      id: string;
      name: string;
    };
  };
  derived: {
    has_baseline: boolean;
    assigned_recipe: { id: string; code: string; name: string } | null;
    location: {
      status: "placed" | "unplaced";
      tent: { id: string; code: string | null; name: string } | null;
      slot: {
        id: string;
        code: string;
        label: string;
        shelf_index: number;
        slot_index: number;
      } | null;
      tray: {
        id: string;
        code: string;
        name: string;
        capacity: number;
        current_count: number;
      } | null;
    };
    last_fed_at: string | null;
    replaced_by_uuid: string | null;
    replaces_uuid: string | null;
    chain_label: string | null;
    scheduled_upcoming: Array<{
      date: string;
      timeframe: string | null;
      exact_time: string | null;
      title: string;
      action_type: string;
      blocked_reasons: string[];
    }>;
  };
  links: {
    experiment_home: string;
    experiment_overview: string;
    baseline_capture: string;
    placement: string;
    schedule: string;
    feeding: string;
  };
  recent_photos: {
    count: number;
    results: PlantPhoto[];
    meta: Record<string, unknown>;
  };
};

type UploadedPhoto = {
  id: string;
  file: string;
  created_at: string;
  tag: string;
  week_number: number | null;
};

type UploadTag = "identity" | "baseline" | "weekly";

type NowAction = {
  title: string;
  detail: string;
  href?: string;
  buttonLabel?: string;
  icon: typeof FlaskConical;
};

type ReplacementResponse = {
  replacement: {
    uuid: string;
  };
};

type Recipe = {
  id: string;
  code: string;
  name: string;
  notes: string;
};

const TAG_OPTIONS: Array<{ value: UploadTag; label: string }> = [
  { value: "identity", label: "Identity" },
  { value: "baseline", label: "Baseline" },
  { value: "weekly", label: "Weekly" },
];

function normalizeFromParam(rawFrom: string | null): string | null {
  if (!rawFrom) {
    return null;
  }
  let decoded = rawFrom;
  try {
    decoded = decodeURIComponent(rawFrom);
  } catch {
    decoded = rawFrom;
  }
  if (decoded.startsWith("/experiments/")) {
    return decoded;
  }
  return null;
}

function toPhotoUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return backendUrl(normalizedPath);
}

function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatLastFedAge(value: string | null): string {
  if (!value) {
    return "Never";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown";
  }
  const diffMs = Date.now() - parsed.getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  if (diffDays === 0) {
    return "Today";
  }
  if (diffDays === 1) {
    return "1 day ago";
  }
  return `${diffDays} days ago`;
}

function uploadTagToApiTag(tag: UploadTag): string {
  if (tag === "identity") {
    return "other";
  }
  return tag;
}

function formatScheduleSlot(dateValue: string, timeframe: string | null, exactTime: string | null): string {
  const parsed = new Date(`${dateValue}T00:00:00`);
  const day = Number.isNaN(parsed.getTime())
    ? dateValue
    : parsed.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  if (exactTime) {
    return `${day} · ${exactTime.slice(0, 5)}`;
  }
  if (timeframe) {
    return `${day} · ${timeframe.toLowerCase()}`;
  }
  return day;
}

function recipeLabel(recipe: { code: string; name: string }): string {
  return recipe.name ? `${recipe.code} - ${recipe.name}` : recipe.code;
}

function trayOccupancyLabel(cockpit: PlantCockpit): string {
  const tray = cockpit.derived.location.tray;
  if (
    !tray ||
    tray.current_count === null ||
    tray.capacity === null ||
    !Number.isFinite(tray.current_count) ||
    !Number.isFinite(tray.capacity)
  ) {
    return "";
  }
  return ` (${tray.current_count}/${tray.capacity})`;
}

function buildNowAction(cockpit: PlantCockpit | null): NowAction {
  if (!cockpit) {
    return {
      title: "Loading plant state",
      detail: "Checking what this plant needs next.",
      icon: FlaskConical,
    };
  }

  if (cockpit.plant.status !== "active") {
    return {
      title: "Plant removed",
      detail: "This plant is no longer active in the experiment.",
      icon: Tag,
    };
  }

  if (!cockpit.derived.has_baseline || !cockpit.plant.grade) {
    return {
      title: "Baseline needed",
      detail: "Record baseline metrics and assign a grade before recipe assignment.",
      href: cockpit.links.baseline_capture,
      buttonLabel: "Record baseline",
      icon: ClipboardPlus,
    };
  }

  if (!cockpit.derived.assigned_recipe || cockpit.derived.location.status !== "placed") {
    return {
      title: "Placement or recipe assignment needed",
      detail: "This plant needs tray placement and a plant recipe assignment before feeding.",
      href: cockpit.links.placement,
      buttonLabel: "Open placement",
      icon: FlaskConical,
    };
  }

  return {
    title: "Setup complete",
    detail: "Baseline, grade, and recipe assignment are all set for this plant.",
    icon: Tag,
  };
}

export default function PlantQrPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const plantUuid = useRouteParamString("id") || "";

  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [notInvited, setNotInvited] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cockpit, setCockpit] = useState<PlantCockpit | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadTag, setUploadTag] = useState<UploadTag>("identity");
  const [showReplaceModal, setShowReplaceModal] = useState(false);
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [newPlantId, setNewPlantId] = useState("");
  const [removedReason, setRemovedReason] = useState("");
  const [inheritAssignment, setInheritAssignment] = useState(true);
  const [copyIdentity, setCopyIdentity] = useState(true);
  const [inheritGrade, setInheritGrade] = useState(false);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipeSelection, setRecipeSelection] = useState("");
  const [recipeSaving, setRecipeSaving] = useState(false);

  const overviewFromParam = useMemo(
    () => normalizeFromParam(searchParams.get("from")),
    [searchParams],
  );
  const overviewHref =
    overviewFromParam || cockpit?.links.experiment_home || "/experiments";
  const feedingHref = cockpit
    ? `/experiments/${cockpit.plant.experiment.id}/feeding?plant=${cockpit.plant.uuid}&from=${encodeURIComponent(
        overviewHref,
      )}`
    : null;
  const scheduleHref = cockpit
    ? `/experiments/${cockpit.plant.experiment.id}/schedule?plant=${cockpit.plant.uuid}`
    : null;
  const replacementCreated = searchParams.get("replacementCreated") === "1";

  const nowAction = useMemo(() => buildNowAction(cockpit), [cockpit]);

  useEffect(() => {
    async function loadCockpit() {
      if (!plantUuid) {
        setLoading(false);
        setNotFound(true);
        return;
      }

      setLoading(true);
      setError("");
      setNotice("");
      setNotInvited(false);
      setNotFound(false);

      try {
        const response = await backendFetch(`/api/v1/plants/${plantUuid}/cockpit`);
        if (response.status === 403) {
          setNotInvited(true);
          return;
        }
        if (response.status === 404) {
          setNotFound(true);
          return;
        }
        if (!response.ok) {
          setError("Unable to load plant cockpit.");
          return;
        }
        const data = (await response.json()) as PlantCockpit;
        setCockpit(data);
        setUploadTag(data.derived.has_baseline ? "identity" : "baseline");
        setRecipeSelection(data.derived.assigned_recipe?.id || "");
        try {
          const recipesResponse = await backendFetch(
            `/api/v1/experiments/${data.plant.experiment.id}/recipes`,
          );
          if (recipesResponse.ok) {
            const recipesPayload = (await recipesResponse.json()) as unknown;
            setRecipes(unwrapList<Recipe>(recipesPayload));
          } else {
            setRecipes([]);
          }
        } catch {
          setRecipes([]);
        }
        setOffline(false);
      } catch (requestError) {
        const normalizedError = normalizeBackendError(requestError);
        if (normalizedError.kind === "offline") {
          setOffline(true);
          setError("");
        } else {
          setError("Unable to load plant cockpit.");
        }
      } finally {
        setLoading(false);
      }
    }

    void loadCockpit();
  }, [plantUuid]);

  useEffect(() => {
    if (replacementCreated) {
      setNotice("Replacement created - baseline required.");
    }
  }, [replacementCreated]);

  function replacementHref(targetPlantId: string): string {
    const nextParams = new URLSearchParams();
    if (overviewFromParam) {
      nextParams.set("from", overviewFromParam);
    }
    return `/p/${targetPlantId}${nextParams.toString() ? `?${nextParams.toString()}` : ""}`;
  }

  async function handlePhotoUpload() {
    if (!cockpit || !photoFile) {
      return;
    }

    setUploading(true);
    setError("");
    setNotice("");

    try {
      const formData = new FormData();
      formData.append("experiment", cockpit.plant.experiment.id);
      formData.append("plant", cockpit.plant.uuid);
      formData.append("tag", uploadTagToApiTag(uploadTag));
      if (uploadTag === "baseline") {
        formData.append("week_number", "0");
      }
      formData.append("file", photoFile);

      const response = await backendFetch("/api/v1/photos/", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        setError("Photo upload failed.");
        return;
      }

      const payload = (await response.json()) as UploadedPhoto;
      const recentPhoto: PlantPhoto = {
        id: payload.id,
        url: toPhotoUrl(payload.file),
        created_at: payload.created_at,
        tag: uploadTag,
        week_number: payload.week_number,
      };

      setCockpit((current) => {
        if (!current) {
          return current;
        }
        return {
          ...current,
          recent_photos: {
            ...current.recent_photos,
            count: Math.min(current.recent_photos.count + 1, 6),
            results: [recentPhoto, ...current.recent_photos.results].slice(0, 6),
          },
        };
      });
      setPhotoFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setNotice("Photo added.");
      setOffline(false);
    } catch (requestError) {
      const normalizedError = normalizeBackendError(requestError);
      if (normalizedError.kind === "offline") {
        setOffline(true);
        setError("You are offline. Photo upload is unavailable.");
      } else {
        setError("Photo upload failed.");
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleReplacePlant() {
    if (!cockpit) {
      return;
    }
    setReplacing(true);
    setError("");
    setNotice("");

    try {
      const response = await backendFetch(`/api/v1/plants/${cockpit.plant.uuid}/replace`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          new_plant_id: newPlantId.trim() || null,
          copy_identity_fields: copyIdentity,
          inherit_assignment: inheritAssignment,
          inherit_grade: inheritGrade,
          mark_original_removed: true,
          removed_reason: removedReason.trim() || null,
        }),
      });

      const payload = (await response.json()) as ReplacementResponse | { detail?: string };
      if (!response.ok) {
        setError(
          (payload as { detail?: string }).detail || "Unable to replace plant.",
        );
        return;
      }
      const nextParams = new URLSearchParams();
      if (overviewFromParam) {
        nextParams.set("from", overviewFromParam);
      }
      nextParams.set("replacementCreated", "1");
      router.push(`/p/${(payload as ReplacementResponse).replacement.uuid}?${nextParams.toString()}`);
    } catch (requestError) {
      const normalized = normalizeBackendError(requestError);
      if (normalized.kind === "offline") {
        setOffline(true);
        setError("You are offline. Replacement is unavailable.");
      } else {
        setError("Unable to replace plant.");
      }
    } finally {
      setReplacing(false);
      setShowReplaceModal(false);
      setReplaceConfirmed(false);
    }
  }

  async function handleRecipeChange(nextRecipeId: string | null) {
    if (!cockpit) {
      return;
    }

    setRecipeSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await backendFetch(`/api/v1/plants/${cockpit.plant.uuid}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_recipe_id: nextRecipeId }),
      });
      const payload = (await response.json()) as { detail?: string };
      if (!response.ok) {
        setError(payload.detail || "Unable to update recipe.");
        return;
      }

      const selectedRecipe = nextRecipeId
        ? recipes.find((recipe) => recipe.id === nextRecipeId) || null
        : null;
      setCockpit((current) => {
        if (!current) {
          return current;
        }
        return {
          ...current,
          derived: {
            ...current.derived,
            assigned_recipe: selectedRecipe
              ? { id: selectedRecipe.id, code: selectedRecipe.code, name: selectedRecipe.name }
              : null,
          },
        };
      });
      setRecipeSelection(nextRecipeId || "");
      setNotice(nextRecipeId ? "Recipe updated." : "Recipe cleared.");
    } catch (requestError) {
      const normalizedError = normalizeBackendError(requestError);
      if (normalizedError.kind === "offline") {
        setOffline(true);
        setError("You are offline. Recipe updates are unavailable.");
      } else {
        setError("Unable to update recipe.");
      }
    } finally {
      setRecipeSaving(false);
    }
  }

  if (notInvited) {
    return (
      <PageShell
        title="Plant Cockpit"
        actions={
          <Link className={buttonVariants({ variant: "default" })} href={overviewHref}>
            ← Overview
          </Link>
        }
      >
        <SectionCard>
          <IllustrationPlaceholder inventoryId="ILL-001" kind="notInvited" />
        </SectionCard>
      </PageShell>
    );
  }

  if (notFound) {
    return (
      <PageShell
        title="Plant Cockpit"
        actions={
          <Link className={buttonVariants({ variant: "default" })} href={overviewHref}>
            ← Overview
          </Link>
        }
      >
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
    <PageShell
      title="Plant Cockpit"
      subtitle={plantUuid || "Unknown plant"}
      stickyOffset
      actions={
        <Link className={buttonVariants({ variant: "default" })} href={overviewHref}>
          ← Overview
        </Link>
      }
    >
      {loading ? (
        <SectionCard>
          <p className={"text-sm text-muted-foreground"}>Loading plant cockpit...</p>
        </SectionCard>
      ) : null}

      {offline ? (
        <SectionCard>
          <IllustrationPlaceholder inventoryId="ILL-003" kind="offline" />
        </SectionCard>
      ) : null}

      {error ? (
        <SectionCard>
          <IllustrationPlaceholder
            inventoryId="ILL-002"
            kind="error"
            title="Something went wrong"
            subtitle={error}
          />
        </SectionCard>
      ) : null}

      {cockpit ? (
        <>
          <SectionCard className={styles.stickyHeaderCard}>
            <div className={styles.stickyHeader}>
              <div>
                <p className={styles.kicker}>Plant</p>
                <h2 className={styles.plantId}>{cockpit.plant.plant_id || "(pending)"}</h2>
                <p className={styles.speciesText}>
                  {cockpit.plant.species.name}
                  {cockpit.plant.cultivar ? ` · ${cockpit.plant.cultivar}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Status: {cockpit.plant.status}</Badge>
                <Badge variant="secondary">Grade: {cockpit.plant.grade || "Missing"}</Badge>
                <Badge variant="secondary">
                  Tent: {cockpit.derived.location.tent?.code || cockpit.derived.location.tent?.name || "Unplaced"}
                </Badge>
                <Badge variant="secondary">Slot: {cockpit.derived.location.slot?.code || "Unplaced"}</Badge>
                <Badge variant="secondary">
                  Tray:{" "}
                  {cockpit.derived.location.tray?.code ||
                    cockpit.derived.location.tray?.name ||
                    "Unplaced"}
                  {trayOccupancyLabel(cockpit)}
                </Badge>
                {cockpit.derived.assigned_recipe ? (
                  <Badge variant="secondary">
                    Recipe: {recipeLabel(cockpit.derived.assigned_recipe)}
                  </Badge>
                ) : (
                  <Badge variant="secondary">Recipe: Unassigned</Badge>
                )}
                {cockpit.derived.location.status !== "placed" ? <Badge variant="secondary">Unplaced</Badge> : null}
              </div>
            </div>
          </SectionCard>

          {cockpit.plant.status !== "active" ? (
            <SectionCard title="Removed Plant">
              <div className="grid gap-3">
                <p className={"text-sm text-muted-foreground"}>
                  This plant was removed
                  {cockpit.plant.removed_at
                    ? ` on ${formatShortDate(cockpit.plant.removed_at)}`
                    : ""}.
                </p>
                {cockpit.plant.removed_reason ? (
                  <p className={"text-sm text-muted-foreground"}>
                    Reason: {cockpit.plant.removed_reason}
                  </p>
                ) : null}
                {cockpit.derived.replaced_by_uuid ? (
                  <Link
                    className={buttonVariants({ variant: "default" })}
                    href={replacementHref(cockpit.derived.replaced_by_uuid)}
                  >
                    Open Replacement
                  </Link>
                ) : null}
              </div>
            </SectionCard>
          ) : null}

          {cockpit.derived.replaces_uuid ? (
            <SectionCard title="Replacement Chain">
              <p className={"text-sm text-muted-foreground"}>
                {cockpit.derived.chain_label || "This plant is a replacement."}
              </p>
              <div className={"flex flex-wrap items-center gap-2"}>
                <Link
                  className={buttonVariants({ variant: "secondary" })}
                  href={replacementHref(cockpit.derived.replaces_uuid)}
                >
                  Open Previous Plant
                </Link>
                {cockpit.derived.replaced_by_uuid ? (
                  <Link
                    className={buttonVariants({ variant: "secondary" })}
                    href={replacementHref(cockpit.derived.replaced_by_uuid)}
                  >
                    Open Next Replacement
                  </Link>
                ) : null}
              </div>
            </SectionCard>
          ) : null}

          <SectionCard title="Now" subtitle="Next best action for this plant">
            <div className="grid gap-3">
              <div className={styles.nowHeading}>
                <nowAction.icon size={18} />
                <strong>{nowAction.title}</strong>
              </div>
              <p className={"text-sm text-muted-foreground"}>{nowAction.detail}</p>
              {cockpit.plant.status === "active" && !cockpit.derived.assigned_recipe ? (
                <Badge variant="secondary">
                  Needs placement / recipe assignment before feeding
                </Badge>
              ) : null}
              {cockpit.plant.status !== "active" ? (
                <p className={"text-sm text-muted-foreground"}>
                  Removed plants are read-only. Use chain links to review related plants.
                </p>
              ) : nowAction.href && nowAction.buttonLabel ? (
                <div className={"flex flex-wrap items-center gap-2"}>
                  <Link className={buttonVariants({ variant: "default" })} href={nowAction.href}>
                    {nowAction.buttonLabel}
                  </Link>
                  {feedingHref ? (
                    <Link className={buttonVariants({ variant: "secondary" })} href={feedingHref}>
                      Feed
                    </Link>
                  ) : null}
                </div>
              ) : (
                <div className={"grid gap-3"}>
                  {feedingHref ? (
                    <Link className={buttonVariants({ variant: "default" })} href={feedingHref}>
                      Feed
                    </Link>
                  ) : null}
                  <ul className={styles.comingSoonList}>
                    <li>
                      <span>Record weekly metrics</span>
                      <Badge variant="secondary">Coming soon</Badge>
                    </li>
                    <li>
                      <span>Take weekly photo</span>
                      <Badge variant="secondary">Coming soon</Badge>
                    </li>
                  </ul>
                </div>
              )}
            </div>
          </SectionCard>

          {cockpit.plant.status === "active" ? (
            <SectionCard title="Manage">
              <div className={"grid gap-3"}>
                <div className={"flex flex-wrap items-center gap-2"}>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className={buttonVariants({ variant: "secondary" })} type="button" disabled={recipeSaving}>
                        <ChevronDown size={14} />
                        Change recipe
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[min(280px,calc(100vw-2rem))] p-3" sideOffset={8} align="start">
                      <p className={"text-sm text-muted-foreground"}>Set recipe assignment</p>
                      {recipes.length > 0 ? (
                        <label className={"grid gap-2"}>
                          <span className={"text-sm text-muted-foreground"}>Recipe</span>
                          <NativeSelect
                            value={recipeSelection}
                            onChange={(event) => setRecipeSelection(event.target.value)}
                            disabled={recipeSaving}
                          >
                            <option value="">Select recipe</option>
                            {recipes.map((recipe) => (
                              <option key={recipe.id} value={recipe.id}>
                                {recipeLabel(recipe)}
                              </option>
                            ))}
                          </NativeSelect>
                        </label>
                      ) : (
                        <p className={"text-sm text-muted-foreground"}>No recipes available yet.</p>
                      )}
                      <div className={"flex flex-wrap items-center gap-2"}>
                        <button
                          className={buttonVariants({ variant: "default" })}
                          type="button"
                          disabled={
                            recipeSaving ||
                            recipes.length === 0 ||
                            !recipeSelection ||
                            recipeSelection === cockpit.derived.assigned_recipe?.id
                          }
                          onClick={() => void handleRecipeChange(recipeSelection)}
                        >
                          {recipeSaving ? "Saving..." : "Save recipe"}
                        </button>
                        <button
                          className={buttonVariants({ variant: "secondary" })}
                          type="button"
                          disabled={recipeSaving || !cockpit.derived.assigned_recipe}
                          onClick={() => void handleRecipeChange(null)}
                        >
                          Clear recipe
                        </button>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <p className={"text-sm text-muted-foreground"}>
                  Replace this plant if it was removed from trial or needs substitution.
                </p>
                <button
                  className={buttonVariants({ variant: "destructive" })}
                  type="button"
                  onClick={() => setShowReplaceModal(true)}
                >
                  <RefreshCcw size={16} />
                  Replace plant
                </button>
              </div>
            </SectionCard>
          ) : null}

          <SectionCard title="Quick Actions">
            <div className={"grid gap-3"}>
              <div className={"grid gap-2"}>
                <span className={"text-sm text-muted-foreground"}>Photo tag</span>
                <NativeSelect
                  value={uploadTag}
                  onChange={(event) => setUploadTag(event.target.value as UploadTag)}
                  disabled={uploading}
                >
                  {TAG_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>

              <input
                ref={fileInputRef}
                className="sr-only"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(event) => setPhotoFile(event.target.files?.[0] ?? null)}
              />

              <div className={"flex flex-wrap items-center gap-2"}>
                <button
                  className={buttonVariants({ variant: "secondary" })}
                  type="button"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Camera size={16} />
                  Choose photo
                </button>
                <button
                  className={buttonVariants({ variant: "default" })}
                  type="button"
                  disabled={!photoFile || uploading}
                  onClick={handlePhotoUpload}
                >
                  {uploading ? "Uploading..." : "Add photo"}
                </button>
              </div>

              {photoFile ? (
                <p className={"text-sm text-muted-foreground"}>Selected: {photoFile.name}</p>
              ) : null}
              {notice ? <Notice variant="success">{notice}</Notice> : null}

              <div className={"flex flex-wrap items-center gap-2"}>
                <button className={buttonVariants({ variant: "secondary" })} type="button" disabled>
                  <ClipboardPlus size={16} />
                  Add note (Coming soon)
                </button>
                <button className={buttonVariants({ variant: "secondary" })} type="button" disabled>
                  <ShieldAlert size={16} />
                  Report issue (Coming soon)
                </button>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Activity" subtitle="Baseline and recent photos">
            <div className={styles.activityRow}>
              <AlertCircle size={16} />
              <span>Baseline: {cockpit.derived.has_baseline ? "Complete" : "Missing"}</span>
            </div>
            <div className={styles.activityRow}>
              <FlaskConical size={16} />
              <span>Last fed: {formatLastFedAge(cockpit.derived.last_fed_at)}</span>
            </div>
            <ResponsiveList
              items={cockpit.recent_photos.results}
              getKey={(photo) => photo.id}
              columns={[
                {
                  key: "preview",
                  label: "Preview",
                  render: (photo) => (
                    <a href={photo.url} target="_blank" rel="noreferrer" className={styles.photoLink}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.url} alt="Plant activity photo" className={styles.thumbnail} />
                    </a>
                  ),
                },
                {
                  key: "tag",
                  label: "Tag",
                  render: (photo) => photo.tag,
                },
                {
                  key: "captured",
                  label: "Captured",
                  render: (photo) => formatShortDate(photo.created_at),
                },
              ]}
              renderMobileCard={(photo) => (
                <div className={styles.photoCard}>
                  <a href={photo.url} target="_blank" rel="noreferrer" className={styles.photoLink}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.url} alt="Plant activity photo" className={styles.thumbnail} />
                  </a>
                  <div className={styles.photoMeta}>
                    <strong>{photo.tag}</strong>
                    <span>{formatShortDate(photo.created_at)}</span>
                  </div>
                </div>
              )}
              emptyState={
                <IllustrationPlaceholder
                  inventoryId="ILL-202"
                  kind="noPhotos"
                  title="No photos yet"
                  subtitle="Use Add photo to capture identity or baseline reference images."
                />
              }
            />
          </SectionCard>

          <SectionCard title="Scheduled">
            {cockpit.derived.scheduled_upcoming.length === 0 ? (
              <p className={"text-sm text-muted-foreground"}>No upcoming scheduled actions for this plant.</p>
            ) : (
              <div className={"grid gap-3"}>
                {cockpit.derived.scheduled_upcoming.map((item, index) => (
                  <div className={styles.activityRow} key={`${item.title}-${item.date}-${index}`}>
                    <Tag size={16} />
                    <span>
                      {item.title} ({formatScheduleSlot(item.date, item.timeframe, item.exact_time)})
                    </span>
                    {item.blocked_reasons.map((reason) => (
                      <Badge key={reason} variant="secondary">
                        {reason}
                      </Badge>
                    ))}
                  </div>
                ))}
              </div>
            )}
            {scheduleHref ? (
              <div className={"flex flex-wrap items-center gap-2"}>
                <Link className={buttonVariants({ variant: "secondary" })} href={scheduleHref}>
                  Open Schedule
                </Link>
              </div>
            ) : null}
          </SectionCard>

          <StickyActionBar>
            <Link className={buttonVariants({ variant: "secondary" })} href={overviewHref}>
              ← Overview
            </Link>
            {cockpit.plant.status !== "active" && cockpit.derived.replaced_by_uuid ? (
              <Link
                className={buttonVariants({ variant: "default" })}
                href={replacementHref(cockpit.derived.replaced_by_uuid)}
              >
                Open Replacement
              </Link>
            ) : nowAction.href && nowAction.buttonLabel ? (
              <Link className={buttonVariants({ variant: "default" })} href={nowAction.href}>
                {nowAction.buttonLabel}
              </Link>
            ) : (
              <button
                className={buttonVariants({ variant: "default" })}
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera size={16} />
                Add photo
              </button>
            )}
          </StickyActionBar>
        </>
      ) : null}

      {showReplaceModal ? (
        <div className={"fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"} role="presentation">
          <SectionCard title="Replace Plant">
            <div className={"grid gap-3"}>
              <p className={"text-sm text-muted-foreground"}>
                This creates a new plant record and marks the current plant as removed.
                Baseline must be recaptured for the replacement.
              </p>
              <label className={"grid gap-2"}>
                <span className={"text-sm text-muted-foreground"}>Removed reason (optional)</span>
                <Textarea
                  value={removedReason}
                  onChange={(event) => setRemovedReason(event.target.value)}
                />
              </label>
              <label className={"grid gap-2"}>
                <span className={"text-sm text-muted-foreground"}>New Plant ID (optional)</span>
                <Input
                  placeholder="Leave blank for pending ID"
                  value={newPlantId}
                  onChange={(event) => setNewPlantId(event.target.value)}
                />
              </label>
              <label className={"flex flex-wrap items-center gap-2"}>
                <input
                  type="checkbox"
                  checked={inheritAssignment}
                  onChange={(event) => setInheritAssignment(event.target.checked)}
                />
                <span>Inherit recipe assignment (recommended)</span>
              </label>
              <label className={"flex flex-wrap items-center gap-2"}>
                <input
                  type="checkbox"
                  checked={copyIdentity}
                  onChange={(event) => setCopyIdentity(event.target.checked)}
                />
                <span>Copy identity fields (species/cultivar/notes)</span>
              </label>
              <label className={"flex flex-wrap items-center gap-2"}>
                <input
                  type="checkbox"
                  checked={inheritGrade}
                  onChange={(event) => setInheritGrade(event.target.checked)}
                />
                <span>Inherit grade</span>
              </label>
              <label className={"flex flex-wrap items-center gap-2"}>
                <input type="checkbox" checked readOnly />
                <span>Mark original plant as removed</span>
              </label>
              <label className={"flex flex-wrap items-center gap-2"}>
                <input
                  type="checkbox"
                  checked={replaceConfirmed}
                  onChange={(event) => setReplaceConfirmed(event.target.checked)}
                />
                <span>I have read and understand.</span>
              </label>
              <div className={"flex flex-wrap items-center gap-2"}>
                <button
                  className={buttonVariants({ variant: "secondary" })}
                  type="button"
                  disabled={replacing}
                  onClick={() => {
                    setShowReplaceModal(false);
                    setReplaceConfirmed(false);
                  }}
                >
                  Cancel
                </button>
                <button
                  className={buttonVariants({ variant: "destructive" })}
                  type="button"
                  disabled={!replaceConfirmed || replacing}
                  onClick={() => void handleReplacePlant()}
                >
                  {replacing ? "Replacing..." : "Replace plant"}
                </button>
              </div>
            </div>
          </SectionCard>
        </div>
      ) : null}
    </PageShell>
  );
}
