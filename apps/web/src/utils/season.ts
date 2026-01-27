export function prioritizeSeason<T extends { season?: string }>(
  items: T[],
  seasonTag?: string,
): T[] {
  if (!seasonTag) {
    return items.slice();
  }
  return [...items].sort((a, b) => {
    const aHit = a.season === seasonTag ? 0 : 1;
    const bHit = b.season === seasonTag ? 0 : 1;
    if (aHit !== bHit) {
      return aHit - bHit;
    }
    return 0;
  });
}
