import { promises as fs } from 'node:fs';
import sharp from 'sharp';

export interface RawImageMetadata {
  width: number;
  height: number;
  aspectRatio: number;
  fileSize: number;
  mtimeMs: number;
}

/**
 * Read width/height/size/mtime for a file path. Applies EXIF orientation
 * so the reported width/height match how the image will actually display.
 *
 * Throws on unreadable / corrupt files; the caller is responsible for
 * converting that into a scan warning rather than a hard scan failure.
 */
export async function extractImageMetadata(
  absolutePath: string,
): Promise<RawImageMetadata> {
  const stat = await fs.stat(absolutePath);
  const meta = await sharp(absolutePath).metadata();

  if (!meta.width || !meta.height) {
    throw new Error('missing width/height in image metadata');
  }

  const orientationRotates =
    meta.orientation !== undefined &&
    meta.orientation >= 5 &&
    meta.orientation <= 8;

  const width = orientationRotates ? meta.height : meta.width;
  const height = orientationRotates ? meta.width : meta.height;

  if (width <= 0 || height <= 0) {
    throw new Error('non-positive image dimensions');
  }

  return {
    width,
    height,
    aspectRatio: width / height,
    fileSize: stat.size,
    mtimeMs: stat.mtimeMs,
  };
}
