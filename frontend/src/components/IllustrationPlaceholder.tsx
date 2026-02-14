import {
  FlaskConical,
  ImageOff,
  Inbox,
  Sprout,
  TriangleAlert,
  UserX,
  WifiOff,
  type LucideIcon,
} from "lucide-react";

import styles from "./IllustrationPlaceholder.module.css";

type PlaceholderKind =
  | "notInvited"
  | "noExperiments"
  | "noPlants"
  | "noPhotos"
  | "error"
  | "offline"
  | "generic";

const KIND_CONFIG: Record<
  PlaceholderKind,
  { icon: LucideIcon; title: string; subtitle: string }
> = {
  notInvited: {
    icon: UserX,
    title: "Not invited",
    subtitle: "Ask an admin to grant access to this workspace.",
  },
  noExperiments: {
    icon: FlaskConical,
    title: "No experiments yet",
    subtitle: "Create your first experiment to begin bootstrap setup.",
  },
  noPlants: {
    icon: Sprout,
    title: "No plants yet",
    subtitle: "Add plants to continue experiment setup.",
  },
  noPhotos: {
    icon: ImageOff,
    title: "No photos yet",
    subtitle: "Upload photos once tracking begins.",
  },
  error: {
    icon: TriangleAlert,
    title: "Something went wrong",
    subtitle: "Please retry or check logs for details.",
  },
  offline: {
    icon: WifiOff,
    title: "Offline",
    subtitle: "Backend is not reachable right now.",
  },
  generic: {
    icon: Inbox,
    title: "Nothing to show",
    subtitle: "Content will appear here as data is added.",
  },
};

type IllustrationPlaceholderProps = {
  inventoryId: string;
  kind: PlaceholderKind;
  title?: string;
  subtitle?: string;
};

export default function IllustrationPlaceholder({
  inventoryId,
  kind,
  title,
  subtitle,
}: IllustrationPlaceholderProps) {
  const config = KIND_CONFIG[kind];
  const Icon = config.icon;

  return (
    <section className={styles.card} aria-label={inventoryId}>
      <div className={styles.iconWrap}>
        <Icon size={30} strokeWidth={1.8} />
      </div>
      <div className={styles.text}>
        <strong>{title ?? config.title}</strong>
        <p>{subtitle ?? config.subtitle}</p>
        <small>{inventoryId}</small>
      </div>
    </section>
  );
}
