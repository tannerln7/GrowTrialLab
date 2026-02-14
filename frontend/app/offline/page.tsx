import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import PageShell from "@/src/components/ui/PageShell";
import SectionCard from "@/src/components/ui/SectionCard";

import styles from "./page.module.css";

export default function OfflinePage() {
  return (
    <PageShell title="Offline" subtitle="GrowTrialLab is currently offline.">
      <SectionCard>
        <IllustrationPlaceholder
          inventoryId="ILL-003"
          kind="offline"
          title="You are offline"
          subtitle="Reconnect to continue working in GrowTrialLab."
        />
        <p className={styles.note}>
          This fallback page is cached for PWA mode and appears when navigation
          fails without a network connection.
        </p>
      </SectionCard>
    </PageShell>
  );
}
