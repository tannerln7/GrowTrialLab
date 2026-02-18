import { Badge } from "./badge";

type DraftChangeChipProps = {
  label: string;
};

function DraftChangeChip({ label }: DraftChangeChipProps) {
  return (
    <Badge variant="secondary" className="whitespace-nowrap">
      {label}
    </Badge>
  );
}

export { DraftChangeChip };
