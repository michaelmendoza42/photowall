// Media derivative delivery contract.
//
// The wall and modal consumers default to derivative variants — not
// originals — so a tile fetch and a modal fetch never pull the full
// source bytes off disk. Derivatives are keyed by photo identity,
// source file version (mtime + size), variant, and output format, so a
// source change naturally invalidates a stale cache entry without
// requiring a manual purge.

/** URL prefix for the per-photo media endpoint. */
export const MEDIA_BASE_PATH = '/api/media';

/** Resource path: `/api/media/:photoId?variant=...&format=...`. */
export function mediaResourcePath(
  photoId: string,
  variant: MediaVariant,
  format: MediaFormat = DEFAULT_MEDIA_FORMAT,
  sourceVersion?: string | number,
): string {
  const base = `${MEDIA_BASE_PATH}/${encodeURIComponent(photoId)}?variant=${variant}&format=${format}`;
  return sourceVersion === undefined ? base : `${base}&v=${encodeURIComponent(String(sourceVersion))}`;
}

/** Variants, smallest to largest. `detail` serves zoomed-in wall tiles. */
export type MediaVariant = 'thumb' | 'wall' | 'modal' | 'detail';

export const MEDIA_VARIANT_VALUES: readonly MediaVariant[] = ['thumb', 'wall', 'modal', 'detail'];

/** Output formats. webp is the default; jpeg is the universal fallback. */
export type MediaFormat = 'webp' | 'jpeg';

export const MEDIA_FORMAT_VALUES: readonly MediaFormat[] = ['webp', 'jpeg'];

export const DEFAULT_MEDIA_FORMAT: MediaFormat = 'webp';

/** Single tuning point for initial/overview thumbnail sharpness. */
export const THUMBNAIL_LONG_EDGE_PX = 512;

/**
 * Variant specification used by the server pipeline.
 *
 * `longEdge` is the longest-edge target in pixels. `withoutEnlargement`
 * is always on so smaller-than-target sources are passed through at
 * native size rather than being upscaled and visibly blurred.
 */
export interface MediaVariantSpec {
  variant: MediaVariant;
  longEdge: number;
  quality: number;
}

/**
 * Thumbnail and wall variants render dense in the justified-row layout, so
 * their long-edge targets balance typical 1× to 2× display sizes against
 * initial bandwidth. Keep thumbnail resolution changes centralized through
 * `THUMBNAIL_LONG_EDGE_PX`. The modal variant stays under 2k because its frame
 * caps usable area on common displays. The detail variant covers the largest
 * tile at maximum wall zoom on a 2× display.
 */
export const MEDIA_VARIANT_SPECS: Record<MediaVariant, MediaVariantSpec> = {
  thumb: { variant: 'thumb', longEdge: THUMBNAIL_LONG_EDGE_PX, quality: 72 },
  wall: { variant: 'wall', longEdge: 640, quality: 80 },
  modal: { variant: 'modal', longEdge: 1800, quality: 85 },
  detail: { variant: 'detail', longEdge: 3200, quality: 82 },
};

export function mediaContentType(format: MediaFormat): string {
  return format === 'webp' ? 'image/webp' : 'image/jpeg';
}

export function mediaFileExtension(format: MediaFormat): string {
  return format === 'webp' ? 'webp' : 'jpg';
}

/** Stable error contract for the media endpoint. */
export type MediaErrorCode =
  | 'photo_not_found'
  | 'variant_invalid'
  | 'format_invalid'
  | 'snapshot_unavailable'
  | 'source_unreadable'
  | 'source_outside_root'
  | 'render_failed';

export interface MediaErrorResponse {
  error: MediaErrorCode;
  detail?: string;
}
