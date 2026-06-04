// First-appearance tracking for wall tiles.
//
// Photos should softly fade the first time they become visible during a
// session, but repeated wrap copies or later revisits must not restart
// the effect.

/**
 * Return the photo ids that are appearing for the first time in the
 * current render pass, deduped against both prior session state and
 * duplicates within the same pass.
 */
export function collectFirstAppearancePhotoIds(
  photoIds: readonly string[],
  seenPhotoIds: ReadonlySet<string>,
): string[] {
  const firstAppearance: string[] = [];
  const staged = new Set<string>();

  for (const photoId of photoIds) {
    if (seenPhotoIds.has(photoId) || staged.has(photoId)) continue;
    staged.add(photoId);
    firstAppearance.push(photoId);
  }

  return firstAppearance;
}

/** Remember newly seen ids in-place. Returns true when the set changed. */
export function rememberSeenPhotoIds(
  seenPhotoIds: Set<string>,
  photoIds: readonly string[],
): boolean {
  let changed = false;
  for (const photoId of photoIds) {
    if (seenPhotoIds.has(photoId)) continue;
    seenPhotoIds.add(photoId);
    changed = true;
  }
  return changed;
}
