import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import PageShell from "@/src/components/ui/PageShell";
import SectionCard from "@/src/components/ui/SectionCard";

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
        <p className="m-0 text-[0.95rem] text-muted-foreground">
          This fallback page is cached for PWA mode and appears when navigation
          fails without a network connection.
        </p>
      </SectionCard>
    </PageShell>
  );
}
