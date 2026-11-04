import sharp from 'sharp';
import {
  applyColorMatrixToRgb,
  blurSigma,
  editColorMatrix,
  editVersion,
  grainNoise,
  hasGeometry,
  straightenCover,
  turnedSize,
  type PhotoEdit,
} from '../../shared/api/edits.js';

interface RawImage {
  data: Buffer;
  info: { width: number; height: number; channels: number };
}

const RAW = { depth: 'uchar' } as const;

/**
 * Render a light edit of `sourcePath` as a sharp pipeline, ready to
 * encode, no larger than `longEdge` on its long side.
 *
 * Geometry matches the browser editor: the photo turns in quarter steps,
 * mirrors in its turned axes, then straightens about its center, zoomed
 * just enough to cover its frame. The crop is a fraction of that frame.
 * Colors use the shared matrix the editor's ColorMatrixFilter uses.
 */
export async function renderEdit(
  sourcePath: string,
  edit: PhotoEdit,
  longEdge: number,
): Promise<sharp.Sharp> {
  const meta = await sharp(sourcePath).metadata();
  if (!meta.width || !meta.height) throw new Error('missing width/height in image metadata');
  const swapsAxes = meta.orientation !== undefined && meta.orientation >= 5 && meta.orientation <= 8;
  const sourceWidth = swapsAxes ? meta.height : meta.width;
  const sourceHeight = swapsAxes ? meta.width : meta.height;

  // Decode once, shrunk to the detail the output needs (with headroom).
  const turnedSource = turnedSize(sourceWidth, sourceHeight, edit.rotation);
  const cover = straightenCover(turnedSource.width, turnedSource.height, edit.straighten);
  const cropLong = Math.max(
    (edit.crop.w * turnedSource.width) / cover,
    (edit.crop.h * turnedSource.height) / cover,
  );
  const scale = Math.min(1, (1.5 * longEdge) / cropLong);
  let image = await toRaw(
    sharp(sourcePath)
      .rotate()
      .removeAlpha()
      .toColourspace('srgb')
      .resize({
        width: Math.max(1, Math.round(sourceWidth * scale)),
        height: Math.max(1, Math.round(sourceHeight * scale)),
        fit: 'fill',
      }),
  );

  let extract: { left: number; top: number; width: number; height: number } | null = null;
  if (hasGeometry(edit)) {
    const odd = edit.rotation === 90 || edit.rotation === 270;
    // sharp mirrors before it rotates, so a mirror seen after a quarter
    // turn is the other axis before it.
    const mirrorX = odd ? edit.flipY : edit.flipX;
    const mirrorY = odd ? edit.flipX : edit.flipY;
    if (edit.rotation !== 0 || mirrorX || mirrorY) {
      let turned = fromRaw(image);
      if (mirrorY) turned = turned.flip();
      if (mirrorX) turned = turned.flop();
      if (edit.rotation !== 0) turned = turned.rotate(edit.rotation);
      image = await toRaw(turned);
    }
    const frameWidth = image.info.width;
    const frameHeight = image.info.height;
    if (edit.straighten !== 0) {
      // The editor mirrors outside the tilt, so one mirror reverses it.
      const angle = edit.flipX !== edit.flipY ? -edit.straighten : edit.straighten;
      image = await toRaw(
        fromRaw(image).rotate(angle, { background: { r: 0, g: 0, b: 0 } }),
      );
    }
    // The frame sits centered in the (possibly larger) straightened image,
    // shrunk by the cover zoom.
    const frameCover = straightenCover(frameWidth, frameHeight, edit.straighten);
    const visibleWidth = frameWidth / frameCover;
    const visibleHeight = frameHeight / frameCover;
    const originX = (image.info.width - visibleWidth) / 2;
    const originY = (image.info.height - visibleHeight) / 2;
    const left = Math.round(originX + edit.crop.x * visibleWidth);
    const top = Math.round(originY + edit.crop.y * visibleHeight);
    const width = Math.round(edit.crop.w * visibleWidth);
    const height = Math.round(edit.crop.h * visibleHeight);
    extract = {
      left: clamp(left, 0, image.info.width - 1),
      top: clamp(top, 0, image.info.height - 1),
      width: 0,
      height: 0,
    };
    extract.width = clamp(width, 1, image.info.width - extract.left);
    extract.height = clamp(height, 1, image.info.height - extract.top);
  }

  let sized = fromRaw(image);
  if (extract) sized = sized.extract(extract);
  sized = sized.resize({ width: longEdge, height: longEdge, fit: 'inside', withoutEnlargement: true });
  const sigma = edit.blur > 0 ? blurSigma(edit.blur, outputLongEdge(image, extract, longEdge)) : 0;
  if (sigma >= 0.3) sized = sized.blur(sigma);

  const matrix = editColorMatrix(edit);
  if (!matrix && edit.grain === 0) return sized;

  const out = await toRaw(sized);
  if (matrix) applyColorMatrixToRgb(out.data, out.info.channels, matrix);
  if (edit.grain > 0) addGrain(out, grainNoise(edit.grain), seedOf(edit));
  return fromRaw(out);
}

function outputLongEdge(
  image: RawImage,
  extract: { width: number; height: number } | null,
  longEdge: number,
): number {
  const long = Math.max(extract?.width ?? image.info.width, extract?.height ?? image.info.height);
  return Math.min(long, longEdge);
}

/** Monochrome grain like Pixi's NoiseFilter, seeded so renders are repeatable. */
function addGrain(image: RawImage, noise: number, seed: number): void {
  const random = mulberry32(seed);
  const { data, info } = image;
  const amplitude = noise * 255;
  for (let i = 0; i + 2 < data.length; i += info.channels) {
    const diff = (random() - 0.5) * amplitude;
    data[i] = clampByte(data[i]! + diff);
    data[i + 1] = clampByte(data[i + 1]! + diff);
    data[i + 2] = clampByte(data[i + 2]! + diff);
  }
}

function seedOf(edit: PhotoEdit): number {
  return parseInt(editVersion(edit), 36) >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function toRaw(pipeline: sharp.Sharp): Promise<RawImage> {
  const { data, info } = await pipeline.raw(RAW).toBuffer({ resolveWithObject: true });
  return { data, info: { width: info.width, height: info.height, channels: info.channels } };
}

function fromRaw(image: RawImage): sharp.Sharp {
  return sharp(image.data, {
    raw: {
      width: image.info.width,
      height: image.info.height,
      channels: image.info.channels as 1 | 2 | 3 | 4,
    },
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampByte(value: number): number {
  return value <= 0 ? 0 : value >= 255 ? 255 : Math.round(value);
}
