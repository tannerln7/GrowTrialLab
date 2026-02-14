"use client";

import {
  AlertCircle,
  Camera,
  ClipboardPlus,
  FlaskConical,
  ShieldAlert,
  Tag,
} from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
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
    assigned_recipe_code: string | null;
  };
  links: {
    experiment_overview: string;
    setup_assignment: string;
    baseline_capture: string;
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

function uploadTagToApiTag(tag: UploadTag): string {
  if (tag === "identity") {
    return "other";
  }
  return tag;
}

function buildNowAction(cockpit: PlantCockpit | null): NowAction {
  if (!cockpit) {
    return {
      title: "Loading plant state",
      detail: "Checking what this plant needs next.",
      icon: FlaskConical,
    };
  }

  if (!cockpit.derived.has_baseline || !cockpit.plant.bin) {
    return {
      title: "Baseline needed",
      detail: "Record baseline metrics and assign a bin before assignment.",
      href: cockpit.links.baseline_capture,
      buttonLabel: "Record baseline",
      icon: ClipboardPlus,
    };
  }

  if (!cockpit.derived.assigned_recipe_code) {
    return {
      title: "Assignment needed",
      detail: "This plant is ready for group assignment.",
      href: cockpit.links.setup_assignment,
      buttonLabel: "Go to assignment",
      icon: FlaskConical,
    };
  }

  return {
    title: "Setup complete",
    detail: "Baseline, bin, and assignment are all set for this plant.",
    icon: Tag,
  };
}

export default function PlantQrPage() {
  const params = useParams();
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

  const overviewFromParam = useMemo(
    () => normalizeFromParam(searchParams.get("from")),
    [searchParams],
  );
  const overviewHref =
    overviewFromParam || cockpit?.links.experiment_overview || "/experiments";

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
                <span className={styles.badge}>Bin: {cockpit.plant.bin || "No bin"}</span>
                <span className={styles.badge}>
                  Group: {cockpit.derived.assigned_recipe_code || "Unassigned"}
                </span>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Now" subtitle="Next best action for this plant">
            <div className={styles.nowCard}>
              <div className={styles.nowHeading}>
                <nowAction.icon size={18} />
                <strong>{nowAction.title}</strong>
              </div>
              <p className={sharedStyles.mutedText}>{nowAction.detail}</p>
              {nowAction.href && nowAction.buttonLabel ? (
                <Link className={sharedStyles.buttonPrimary} href={nowAction.href}>
                  {nowAction.buttonLabel}
                </Link>
              ) : (
                <ul className={styles.comingSoonList}>
                  <li>
                    <span>Feed plant</span>
                    <span className={styles.comingSoonTag}>Coming soon</span>
                  </li>
                  <li>
                    <span>Record weekly metrics</span>
                    <span className={styles.comingSoonTag}>Coming soon</span>
                  </li>
                  <li>
                    <span>Take weekly photo</span>
                    <span className={styles.comingSoonTag}>Coming soon</span>
                  </li>
                </ul>
              )}
            </div>
          </SectionCard>

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

          <StickyActionBar>
            <Link className={sharedStyles.buttonSecondary} href={overviewHref}>
              ← Overview
            </Link>
            {nowAction.href && nowAction.buttonLabel ? (
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
    </PageShell>
  );
}
