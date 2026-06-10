import type { PhotoQueryRecord } from '../../../../shared/api/photos.js';
import { hashStringToUint32 } from './seeded.js';

export function stableShufflePhotos(
  photos: readonly PhotoQueryRecord[],
  seedKey: string,
): PhotoQueryRecord[] {
  return photos
    .slice()
    .sort((a, b) => {
      const aKey = hashStringToUint32(`${a.id}|shuffle|${seedKey}`);
      const bKey = hashStringToUint32(`${b.id}|shuffle|${seedKey}`);
      if (aKey !== bKey) return aKey - bKey;
      return a.id.localeCompare(b.id);
    });
}
