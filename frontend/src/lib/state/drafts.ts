type StringMap<T> = Partial<Record<string, T>>;

type DraftOptions<T> = {
  fallback: T;
  equals?: (left: T, right: T) => boolean;
};

export type DraftChange<T> = {
  key: string;
  persistedValue: T;
  draftValue: T;
};

function hasOwnKey<T>(map: StringMap<T>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(map, key);
}

export function getDraftOrPersisted<T>(
  draftMap: StringMap<T>,
  persistedMap: StringMap<T>,
  key: string,
  fallback: T,
): T {
  const persistedValue = hasOwnKey(persistedMap, key) ? (persistedMap[key] as T) : fallback;
  if (hasOwnKey(draftMap, key)) {
    return draftMap[key] as T;
  }
  return persistedValue;
}

export function isDirtyValue<T>(
  persistedValue: T,
  draftValue: T,
  equals: (left: T, right: T) => boolean = Object.is,
): boolean {
  return !equals(persistedValue, draftValue);
}

export function buildChangeset<T>(
  keys: Iterable<string>,
  persistedMap: StringMap<T>,
  draftMap: StringMap<T>,
  options: DraftOptions<T>,
): Array<DraftChange<T>> {
  const changes: Array<DraftChange<T>> = [];
  const equals = options.equals ?? Object.is;
  for (const key of keys) {
    const persistedValue = hasOwnKey(persistedMap, key) ? (persistedMap[key] as T) : options.fallback;
    const draftValue = getDraftOrPersisted(draftMap, persistedMap, key, options.fallback);
    if (!equals(persistedValue, draftValue)) {
      changes.push({ key, persistedValue, draftValue });
    }
  }
  return changes;
}
