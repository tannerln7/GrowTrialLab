import IllustrationPlaceholder from "@/src/components/IllustrationPlaceholder";
import { Notice } from "@/src/components/ui/notice";

type PageAlertsProps = {
  loading?: boolean;
  loadingText?: string;
  error?: string | null;
  notice?: string | null;
  offline?: boolean;
  notInvited?: boolean;
};

export default function PageAlerts({
  loading = false,
  loadingText,
  error,
  notice,
  offline = false,
  notInvited = false,
}: PageAlertsProps) {
  return (
    <>
      {loading && loadingText ? <p className="text-sm text-muted-foreground">{loadingText}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? <Notice variant="success">{notice}</Notice> : null}
      {offline ? <IllustrationPlaceholder inventoryId="ILL-003" kind="offline" /> : null}
      {notInvited ? <IllustrationPlaceholder inventoryId="ILL-001" kind="notInvited" /> : null}
    </>
  );
}
