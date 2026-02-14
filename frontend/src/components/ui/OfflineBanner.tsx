import { WifiOff } from "lucide-react";

import styles from "./OfflineBanner.module.css";

export default function OfflineBanner() {
  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <WifiOff size={18} />
      <span>Offline mode: backend may be unreachable.</span>
    </div>
  );
}
