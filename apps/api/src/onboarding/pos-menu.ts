export function findMissingPosItemIds(
  existingIds: string[],
  importedIds: string[],
): string[] {
  const imported = new Set(importedIds);
  return existingIds.filter((id) => !imported.has(id));
}
