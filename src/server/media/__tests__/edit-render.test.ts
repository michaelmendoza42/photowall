import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NEUTRAL_EDIT, turnedSize, type PhotoEdit } from '../../../shared/api/edits.js';
import { frameToTurned, frameWarp, turnPoint } from '../../../shared/api/editWarp.js';
import { renderEdit } from '../edit-render.js';

// A photo whose pixels encode their own position: red = x, green = y.
const SRC_W = 600;
const SRC_H = 400;
let dir: string;
let source: string;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'edit-render-'));
  source = path.join(dir, 'coords.png');
  const data = Buffer.alloc(SRC_W * SRC_H * 3);
  for (let y = 0; y < SRC_H; y++)
    for (let x = 0; x < SRC_W; x++) {
      const i = (y * SRC_W + x) * 3;
      data[i] = Math.round((x * 255) / (SRC_W - 1));
      data[i + 1] = Math.round((y * 255) / (SRC_H - 1));
    }
  await sharp(data, { raw: { width: SRC_W, height: SRC_H, channels: 3 } }).png().toFile(source);
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

/** Maps an output pixel to the original-photo position it came from, per the shared warp math. */
function expectedSource(edit: PhotoEdit, outW: number, outH: number) {
  const { width: W, height: H } = turnedSize(SRC_W, SRC_H, edit.rotation);
  const warp = frameWarp(W, H, edit);
  // Undo the quarter turn: the inverse turn, applied in the turned photo.
  const inverse = ({ 0: 0, 90: 270, 180: 180, 270: 90 } as const)[edit.rotation];
  return (ox: number, oy: number) => {
    const fx = edit.crop.x * W + ((ox + 0.5) * edit.crop.w * W) / outW;
    const fy = edit.crop.y * H + ((oy + 0.5) * edit.crop.h * H) / outH;
    return turnPoint(W, H, inverse, frameToTurned(warp, W, H, edit, [fx, fy]));
  };
}

describe('renderEdit with perspective and lens correction', () => {
  it.each<[string, Partial<PhotoEdit>]>([
    ['perspective', { perspectiveVertical: 10, perspectiveHorizontal: -8, straighten: 3, focal35: 24 }],
    ['lens + crop', { lensDistortion: 80, crop: { x: 0.1, y: 0.2, w: 0.7, h: 0.6 } }],
    ['quarter turn + mirror', { rotation: 90, flipX: true, perspectiveVertical: -7, focal35: 30 }],
  ])('%s: every output pixel comes from where the shared warp says', async (_name, patch) => {
    const edit: PhotoEdit = { ...NEUTRAL_EDIT, ...patch };
    const { data, info } = await (await renderEdit(source, edit, 2000))
      .raw()
      .toBuffer({ resolveWithObject: true });
    const turned = turnedSize(SRC_W, SRC_H, edit.rotation);
    expect(info.width).toBe(Math.round(edit.crop.w * turned.width));
    expect(info.height).toBe(Math.round(edit.crop.h * turned.height));
    const sourceOf = expectedSource(edit, info.width, info.height);
    let worst = 0;
    for (let oy = 3; oy < info.height - 3; oy += 7)
      for (let ox = 3; ox < info.width - 3; ox += 7) {
        const i = (oy * info.width + ox) * info.channels;
        const gotX = (data[i]! * (SRC_W - 1)) / 255;
        const gotY = (data[i + 1]! * (SRC_H - 1)) / 255;
        const [ex, ey] = sourceOf(ox, oy);
        // Pixel centers: position x sits at index x − 0.5.
        worst = Math.max(worst, Math.hypot(gotX - (ex - 0.5), gotY - (ey - 0.5)));
      }
    // 8-bit encoding: one level is ~2.4 px of x and ~1.6 px of y.
    expect(worst).toBeLessThan(2.5);
  });
});
