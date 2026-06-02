import path from 'node:path';

/**
 * MVP supported image extensions. Kept narrow on purpose — broader format
 * support (HEIC/HEIF, RAW, TIFF) is explicitly out of MVP scope per the
 * mission requirements.
 */
export const SUPPORTED_IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.avif',
]);

export function isSupportedImageFilename(filename: string): boolean {
  return SUPPORTED_IMAGE_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

export function isHiddenName(name: string): boolean {
  return name.length > 0 && name.startsWith('.');
}
