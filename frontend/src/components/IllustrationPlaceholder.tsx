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
  const config = KIND_CONFIG[kind] ?? KIND_CONFIG.generic;
  const Icon = config.icon;

  return (
    <section
      className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-card p-4"
      aria-label={inventoryId}
    >
      <div className="grid h-14 w-14 shrink-0 place-items-center rounded-md bg-muted text-foreground">
        <Icon size={30} strokeWidth={1.8} />
      </div>
      <div className="grid gap-1">
        <strong>{title ?? config.title}</strong>
        <p className="m-0 text-muted-foreground">{subtitle ?? config.subtitle}</p>
        <small className="text-xs text-muted-foreground">{inventoryId}</small>
      </div>
    </section>
  );
}
