export function chunkArray<T>(input: readonly T[], chunkSize: number): T[][] {
  const safeSize = Math.max(1, Math.trunc(chunkSize));
  const chunks: T[][] = [];

  for (let index = 0; index < input.length; index += safeSize) {
    chunks.push(input.slice(index, index + safeSize));
  }

  return chunks;
}
