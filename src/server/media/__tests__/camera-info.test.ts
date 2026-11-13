import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFocal35 } from '../camera-info.js';

let dir: string;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'camera-info-'));
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

async function jpeg(name: string, exif?: Record<string, Record<string, string>>): Promise<string> {
  const file = path.join(dir, name);
  let image = sharp({ create: { width: 8, height: 8, channels: 3, background: '#888' } }).jpeg();
  if (exif) image = image.withExif(exif);
  await image.toFile(file);
  return file;
}

describe('readFocal35', () => {
  it('reads the 35mm-equivalent focal length from EXIF', async () => {
    const file = await jpeg('focal.jpg', { IFD0: { Make: 'SONY' }, IFD2: { FocalLengthIn35mmFilm: '24' } });
    expect(await readFocal35(file)).toBe(24);
  });

  it('is null when the photo does not record it', async () => {
    expect(await readFocal35(await jpeg('none.jpg'))).toBeNull();
    expect(await readFocal35(await jpeg('make-only.jpg', { IFD0: { Make: 'SONY' } }))).toBeNull();
  });
});
