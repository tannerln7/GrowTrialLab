import { WifiOff } from "lucide-react";

export default function OfflineBanner() {
  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-warning/45 bg-warning/15 px-3 py-2 text-foreground"
      role="status"
      aria-live="polite"
    >
      <WifiOff size={18} />
      <span>Offline mode: backend may be unreachable.</span>
    </div>
  );
}
