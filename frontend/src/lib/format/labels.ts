type RecipeLabelInput = {
  code: string;
  name: string;
};

export function formatRecipeLabel(recipe: RecipeLabelInput): string {
  return recipe.name ? `${recipe.code} - ${recipe.name}` : recipe.code;
}

export function formatTrayDisplay(rawValue: string | null | undefined, fallbackValue?: string): string {
  const raw = (rawValue || "").trim() || (fallbackValue || "").trim();
  if (!raw) {
    return "";
  }
  const match = raw.match(/^(?:tray|tr|t)?[\s_-]*0*([0-9]+)$/i);
  if (!match) {
    return raw;
  }
  const trayNumber = Number.parseInt(match[1], 10);
  if (!Number.isFinite(trayNumber)) {
    return raw;
  }
  return `Tray ${trayNumber}`;
}
