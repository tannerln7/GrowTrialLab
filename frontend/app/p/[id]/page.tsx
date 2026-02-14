"use client";

import {
  AlertCircle,
  Camera,
  ClipboardPlus,
  FlaskConical,
  RefreshCcw,
  ShieldAlert,
  Tag,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { backendFetch, backendUrl, normalizeBackendError } from "@/lib/backend";
import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import PageShell from "@/src/components/ui/PageShell";
import ResponsiveList from "@/src/components/ui/ResponsiveList";
import SectionCard from "@/src/components/ui/SectionCard";
import StickyActionBar from "@/src/components/ui/StickyActionBar";

import sharedStyles from "../../experiments/experiments.module.css";
import styles from "./page.module.css";

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
    bin: string | null;
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
    assigned_recipe_id: string | null;
    assigned_recipe_code: string | null;
    assigned_recipe_name: string | null;
    placed_tray_id: string | null;
    placed_tray_name: string | null;
    tray_id: string | null;
    tray_name: string | null;
    tray_code: string | null;
    tray_capacity: number | null;
    tray_current_count: number | null;
    placed_block_id: string | null;
    placed_block_name: string | null;
    block_id: string | null;
    block_name: string | null;
    tent_id: string | null;
    tent_code: string | null;
    tent_name: string | null;
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
    setup_assignment: string;
    baseline_capture: string;
    placement: string;
  };
  recent_photos: PlantPhoto[];
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

function trayOccupancyLabel(cockpit: PlantCockpit): string {
  if (
    cockpit.derived.tray_current_count === null ||
    cockpit.derived.tray_capacity === null ||
    !Number.isFinite(cockpit.derived.tray_current_count) ||
    !Number.isFinite(cockpit.derived.tray_capacity)
  ) {
    return "";
  }
  return ` (${cockpit.derived.tray_current_count}/${cockpit.derived.tray_capacity})`;
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

  if (!cockpit.derived.has_baseline || !cockpit.plant.bin) {
    return {
      title: "Baseline needed",
      detail: "Record baseline metrics and assign a grade before assignment.",
      href: cockpit.links.baseline_capture,
      buttonLabel: "Record baseline",
      icon: ClipboardPlus,
    };
  }

  if (!cockpit.derived.assigned_recipe_code) {
    return {
      title: "Placement or tray recipe needed",
      detail: "This plant needs tray placement and tray recipe before feeding.",
      href: cockpit.links.placement,
      buttonLabel: "Open placement",
      icon: FlaskConical,
    };
  }

  return {
    title: "Setup complete",
    detail: "Baseline, grade, and assignment are all set for this plant.",
    icon: Tag,
  };
}

export default function PlantQrPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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
  const [inheritBin, setInheritBin] = useState(false);

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
          recent_photos: [recentPhoto, ...current.recent_photos].slice(0, 6),
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
          inherit_bin: inheritBin,
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

  if (notInvited) {
    return (
      <PageShell
        title="Plant Cockpit"
        actions={
          <Link className={sharedStyles.buttonPrimary} href={overviewHref}>
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
          <Link className={sharedStyles.buttonPrimary} href={overviewHref}>
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
        <Link className={sharedStyles.buttonPrimary} href={overviewHref}>
          ← Overview
        </Link>
      }
    >
      {loading ? (
        <SectionCard>
          <p className={sharedStyles.mutedText}>Loading plant cockpit...</p>
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
              <div className={styles.badges}>
                <span className={styles.badge}>Status: {cockpit.plant.status}</span>
                <span className={styles.badge}>Grade: {cockpit.plant.bin || "Missing"}</span>
                <span className={styles.badge}>
                  Tent: {cockpit.derived.tent_code || cockpit.derived.tent_name || "Unplaced"}
                </span>
                <span className={styles.badge}>Block: {cockpit.derived.block_name || "Unplaced"}</span>
                <span className={styles.badge}>
                  Tray:{" "}
                  {cockpit.derived.tray_code ||
                    cockpit.derived.tray_name ||
                    cockpit.derived.placed_tray_name ||
                    "Unplaced"}
                  {trayOccupancyLabel(cockpit)}
                </span>
                <span className={styles.badge}>
                  Recipe: {cockpit.derived.assigned_recipe_code || "Missing"}
                </span>
                {!cockpit.derived.tray_id ? <span className={styles.badge}>Unplaced</span> : null}
              </div>
            </div>
          </SectionCard>

          {cockpit.plant.status !== "active" ? (
            <SectionCard title="Removed Plant">
              <div className={styles.alertBox}>
                <p className={sharedStyles.mutedText}>
                  This plant was removed
                  {cockpit.plant.removed_at
                    ? ` on ${formatShortDate(cockpit.plant.removed_at)}`
                    : ""}.
                </p>
                {cockpit.plant.removed_reason ? (
                  <p className={sharedStyles.mutedText}>
                    Reason: {cockpit.plant.removed_reason}
                  </p>
                ) : null}
                {cockpit.derived.replaced_by_uuid ? (
                  <Link
                    className={sharedStyles.buttonPrimary}
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
              <p className={sharedStyles.mutedText}>
                {cockpit.derived.chain_label || "This plant is a replacement."}
              </p>
              <div className={sharedStyles.actions}>
                <Link
                  className={sharedStyles.buttonSecondary}
                  href={replacementHref(cockpit.derived.replaces_uuid)}
                >
                  Open Previous Plant
                </Link>
                {cockpit.derived.replaced_by_uuid ? (
                  <Link
                    className={sharedStyles.buttonSecondary}
                    href={replacementHref(cockpit.derived.replaced_by_uuid)}
                  >
                    Open Next Replacement
                  </Link>
                ) : null}
              </div>
            </SectionCard>
          ) : null}

          <SectionCard title="Now" subtitle="Next best action for this plant">
            <div className={styles.nowCard}>
              <div className={styles.nowHeading}>
                <nowAction.icon size={18} />
                <strong>{nowAction.title}</strong>
              </div>
              <p className={sharedStyles.mutedText}>{nowAction.detail}</p>
              {cockpit.plant.status === "active" && !cockpit.derived.assigned_recipe_code ? (
                <span className={sharedStyles.badgeWarn}>
                  Needs placement / tray recipe before feeding
                </span>
              ) : null}
              {cockpit.plant.status !== "active" ? (
                <p className={sharedStyles.mutedText}>
                  Removed plants are read-only. Use chain links to review related plants.
                </p>
              ) : nowAction.href && nowAction.buttonLabel ? (
                <div className={sharedStyles.actions}>
                  <Link className={sharedStyles.buttonPrimary} href={nowAction.href}>
                    {nowAction.buttonLabel}
                  </Link>
                  {feedingHref ? (
                    <Link className={sharedStyles.buttonSecondary} href={feedingHref}>
                      Feed
                    </Link>
                  ) : null}
                </div>
              ) : (
                <div className={sharedStyles.stack}>
                  {feedingHref ? (
                    <Link className={sharedStyles.buttonPrimary} href={feedingHref}>
                      Feed
                    </Link>
                  ) : null}
                  <ul className={styles.comingSoonList}>
                    <li>
                      <span>Record weekly metrics</span>
                      <span className={styles.comingSoonTag}>Coming soon</span>
                    </li>
                    <li>
                      <span>Take weekly photo</span>
                      <span className={styles.comingSoonTag}>Coming soon</span>
                    </li>
                  </ul>
                </div>
              )}
            </div>
          </SectionCard>

          {cockpit.plant.status === "active" ? (
            <SectionCard title="Manage">
              <div className={sharedStyles.stack}>
                <p className={sharedStyles.mutedText}>
                  Replace this plant if it was removed from trial or needs substitution.
                </p>
                <button
                  className={sharedStyles.buttonDanger}
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
            <div className={sharedStyles.formGrid}>
              <div className={sharedStyles.field}>
                <span className={sharedStyles.fieldLabel}>Photo tag</span>
                <select
                  className={sharedStyles.select}
                  value={uploadTag}
                  onChange={(event) => setUploadTag(event.target.value as UploadTag)}
                  disabled={uploading}
                >
                  {TAG_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <input
                ref={fileInputRef}
                className={styles.hiddenInput}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(event) => setPhotoFile(event.target.files?.[0] ?? null)}
              />

              <div className={sharedStyles.actions}>
                <button
                  className={sharedStyles.buttonSecondary}
                  type="button"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Camera size={16} />
                  Choose photo
                </button>
                <button
                  className={sharedStyles.buttonPrimary}
                  type="button"
                  disabled={!photoFile || uploading}
                  onClick={handlePhotoUpload}
                >
                  {uploading ? "Uploading..." : "Add photo"}
                </button>
              </div>

              {photoFile ? (
                <p className={sharedStyles.mutedText}>Selected: {photoFile.name}</p>
              ) : null}
              {notice ? <p className={sharedStyles.successText}>{notice}</p> : null}

              <div className={sharedStyles.actions}>
                <button className={sharedStyles.buttonSecondary} type="button" disabled>
                  <ClipboardPlus size={16} />
                  Add note (Coming soon)
                </button>
                <button className={sharedStyles.buttonSecondary} type="button" disabled>
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
              items={cockpit.recent_photos}
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
              <p className={sharedStyles.mutedText}>No upcoming scheduled actions for this plant.</p>
            ) : (
              <div className={sharedStyles.stack}>
                {cockpit.derived.scheduled_upcoming.map((item, index) => (
                  <div className={styles.activityRow} key={`${item.title}-${item.date}-${index}`}>
                    <Tag size={16} />
                    <span>
                      {item.title} ({formatScheduleSlot(item.date, item.timeframe, item.exact_time)})
                    </span>
                    {item.blocked_reasons.map((reason) => (
                      <span className={sharedStyles.badgeWarn} key={reason}>
                        {reason}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            )}
            {scheduleHref ? (
              <div className={sharedStyles.actions}>
                <Link className={sharedStyles.buttonSecondary} href={scheduleHref}>
                  Open Schedule
                </Link>
              </div>
            ) : null}
          </SectionCard>

          <StickyActionBar>
            <Link className={sharedStyles.buttonSecondary} href={overviewHref}>
              ← Overview
            </Link>
            {cockpit.plant.status !== "active" && cockpit.derived.replaced_by_uuid ? (
              <Link
                className={sharedStyles.buttonPrimary}
                href={replacementHref(cockpit.derived.replaced_by_uuid)}
              >
                Open Replacement
              </Link>
            ) : nowAction.href && nowAction.buttonLabel ? (
              <Link className={sharedStyles.buttonPrimary} href={nowAction.href}>
                {nowAction.buttonLabel}
              </Link>
            ) : (
              <button
                className={sharedStyles.buttonPrimary}
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
        <div className={sharedStyles.modalBackdrop} role="presentation">
          <SectionCard title="Replace Plant">
            <div className={sharedStyles.stack}>
              <p className={sharedStyles.mutedText}>
                This creates a new plant record and marks the current plant as removed.
                Baseline must be recaptured for the replacement.
              </p>
              <label className={sharedStyles.field}>
                <span className={sharedStyles.fieldLabel}>Removed reason (optional)</span>
                <textarea
                  className={sharedStyles.textarea}
                  value={removedReason}
                  onChange={(event) => setRemovedReason(event.target.value)}
                />
              </label>
              <label className={sharedStyles.field}>
                <span className={sharedStyles.fieldLabel}>New Plant ID (optional)</span>
                <input
                  className={sharedStyles.input}
                  placeholder="Leave blank for pending ID"
                  value={newPlantId}
                  onChange={(event) => setNewPlantId(event.target.value)}
                />
              </label>
              <label className={sharedStyles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={inheritAssignment}
                  onChange={(event) => setInheritAssignment(event.target.checked)}
                />
                <span>Inherit assignment (recommended)</span>
              </label>
              <label className={sharedStyles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={copyIdentity}
                  onChange={(event) => setCopyIdentity(event.target.checked)}
                />
                <span>Copy identity fields (species/cultivar/notes)</span>
              </label>
              <label className={sharedStyles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={inheritBin}
                  onChange={(event) => setInheritBin(event.target.checked)}
                />
                <span>Inherit grade assignment</span>
              </label>
              <label className={sharedStyles.checkboxRow}>
                <input type="checkbox" checked readOnly />
                <span>Mark original plant as removed</span>
              </label>
              <label className={sharedStyles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={replaceConfirmed}
                  onChange={(event) => setReplaceConfirmed(event.target.checked)}
                />
                <span>I have read and understand.</span>
              </label>
              <div className={sharedStyles.actions}>
                <button
                  className={sharedStyles.buttonSecondary}
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
                  className={sharedStyles.buttonDanger}
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
