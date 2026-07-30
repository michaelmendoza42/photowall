import {
  mediaResourcePath,
  type MediaVariant,
} from '../../../../shared/api/media.js';
import type { PhotoQueryRecord } from '../../../../shared/api/photos.js';

export type WallMediaSourcePhoto = Pick<PhotoQueryRecord, 'id' | 'width' | 'height'> &
  Partial<Pick<PhotoQueryRecord, 'mtimeMs'>>;

export interface WallMediaSourceInput {
  photo: WallMediaSourcePhoto;
  variant: MediaVariant;
}

export type WallMediaSourceResolver = (input: WallMediaSourceInput) => string;

export function resolveWallMediaSource(
  photo: WallMediaSourcePhoto,
  variant: MediaVariant,
  mediaSourceResolver?: WallMediaSourceResolver,
): string {
  return mediaSourceResolver?.({ photo, variant }) ?? mediaResourcePath(photo.id, variant, undefined, photo.mtimeMs);
}
