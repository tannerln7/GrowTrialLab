const PREFIX_BY_CATEGORY: Record<string, string> = {
  nepenthes: "NP",
  flytrap: "VF",
  drosera: "DR",
  sarracenia: "SA",
  pinguicula: "PG",
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nextNumber(values: string[], pattern: RegExp): number {
  let highest = 0;
  for (const rawValue of values) {
    const value = rawValue.trim();
    const match = pattern.exec(value);
    if (!match) {
      continue;
    }
    const parsed = Number.parseInt(match[1] ?? "", 10);
    if (Number.isNaN(parsed)) {
      continue;
    }
    highest = Math.max(highest, parsed);
  }
  return highest + 1;
}

export function suggestTentCode(existingCodes: string[]): string {
  const next = nextNumber(existingCodes, /^TN(\d+)$/i);
  return `TN${next}`;
}

export function suggestTentName(existingNames: string[]): string {
  const next = nextNumber(existingNames, /^Tent\s+(\d+)$/i);
  return `Tent ${next}`;
}

export function suggestSlotName(existingNames: string[]): string {
  const next = nextNumber(existingNames, /^S(\d+)-(\d+)$/i);
  return `S1-${next}`;
}

export function suggestTrayName(existingNames: string[]): string {
  const next = nextNumber(existingNames, /^TR(\d+)$/i);
  return `TR${next}`;
}

export function plantIdPrefixForCategory(category: string | null | undefined): string {
  const normalized = (category || "").trim().toLowerCase();
  return PREFIX_BY_CATEGORY[normalized] || "PL";
}

export function suggestPlantId(existingIds: string[], category: string | null | undefined): string {
  const prefix = plantIdPrefixForCategory(category);
  const pattern = new RegExp(`^${escapeRegExp(prefix)}-(\\d+)$`, "i");
  const next = nextNumber(existingIds, pattern);
  return `${prefix}-${String(next).padStart(3, "0")}`;
}
