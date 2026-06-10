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
): string {
  return `${MEDIA_BASE_PATH}/${encodeURIComponent(photoId)}?variant=${variant}&format=${format}`;
}

/** Variants the MVP exposes. Keep narrow — broader variants are deferred. */
export type MediaVariant = 'thumb' | 'wall' | 'modal';

export const MEDIA_VARIANT_VALUES: readonly MediaVariant[] = ['thumb', 'wall', 'modal'];

/** Output formats. webp is the default; jpeg is the universal fallback. */
export type MediaFormat = 'webp' | 'jpeg';

export const MEDIA_FORMAT_VALUES: readonly MediaFormat[] = ['webp', 'jpeg'];

export const DEFAULT_MEDIA_FORMAT: MediaFormat = 'webp';

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
 * Wall tiles render dense in the justified-row layout, so the long-edge
 * target is sized for typical row heights on a 1× to 2× display without
 * paying the bandwidth cost of a near-original asset. The modal variant
 * targets the larger lightbox view; it stays under 2k on the long edge
 * because the modal frame itself caps usable area on common displays.
 */
export const MEDIA_VARIANT_SPECS: Record<MediaVariant, MediaVariantSpec> = {
  thumb: { variant: 'thumb', longEdge: 256, quality: 72 },
  wall: { variant: 'wall', longEdge: 640, quality: 80 },
  modal: { variant: 'modal', longEdge: 1800, quality: 85 },
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
