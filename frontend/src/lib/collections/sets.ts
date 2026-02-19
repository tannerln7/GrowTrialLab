export function toggleSet<T>(source: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(source);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

export function addToSet<T>(source: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(source);
  next.add(value);
  return next;
}

export function addManyToSet<T>(source: ReadonlySet<T>, values: Iterable<T>): Set<T> {
  const next = new Set(source);
  for (const value of values) {
    next.add(value);
  }
  return next;
}

export function removeFromSet<T>(source: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(source);
  next.delete(value);
  return next;
}

export function removeManyFromSet<T>(source: ReadonlySet<T>, values: Iterable<T>): Set<T> {
  const next = new Set(source);
  for (const value of values) {
    next.delete(value);
  }
  return next;
}

export function setHasAll<T>(source: ReadonlySet<T>, values: Iterable<T>): boolean {
  for (const value of values) {
    if (!source.has(value)) {
      return false;
    }
  }
  return true;
}

export function setWithAll<T>(values: Iterable<T>): Set<T> {
  return new Set(values);
}

export function setDifference<T>(left: ReadonlySet<T>, right: ReadonlySet<T>): Set<T> {
  const next = new Set<T>();
  for (const value of left) {
    if (!right.has(value)) {
      next.add(value);
    }
  }
  return next;
}
