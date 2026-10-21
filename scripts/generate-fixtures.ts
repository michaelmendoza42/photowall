/**
 * Regenerate the committed fixture libraries used by scanner tests and
 * the browser specs (`library-wall`).
 *
 * The output images are tiny synthetic JPEGs whose width/height are
 * what the scanner tests assert against. Run with:
 *
 *   npx tsx scripts/generate-fixtures.ts
 *
 * The script is idempotent — it deletes any prior generated image files
 * under the two fixture libraries (preserving the manifest itself) and
 * recreates them from scratch.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const fixturesRoot = path.join(repoRoot, 'fixtures');
const smokeRoot = path.join(fixturesRoot, 'library-smoke');
const edgeRoot = path.join(fixturesRoot, 'library-edge');
const wallRoot = path.join(fixturesRoot, 'library-wall');

interface ImageSpec {
  width: number;
  height: number;
  color: { r: number; g: number; b: number };
}

async function writeJpeg(target: string, spec: ImageSpec): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await sharp({
    create: {
      width: spec.width,
      height: spec.height,
      channels: 3,
      background: spec.color,
    },
  })
    .jpeg({ quality: 60, mozjpeg: false })
    .toFile(target);
}

async function clearGenerated(root: string): Promise<void> {
  // Remove everything under the fixture root except the .gitkeep marker.
  let entries: string[] = [];
  try {
    entries = await fs.readdir(root);
  } catch (err) {
    if ((err as { code?: string }).code === 'ENOENT') return;
    throw err;
  }
  for (const name of entries) {
    if (name === '.gitkeep') continue;
    await fs.rm(path.join(root, name), { recursive: true, force: true });
  }
}

async function buildSmoke(): Promise<void> {
  await clearGenerated(smokeRoot);

  // 2024 top-level year, with two event folders.
  await writeJpeg(path.join(smokeRoot, '2024', 'wedding-anna', 'img_001.jpg'), {
    width: 160,
    height: 90,
    color: { r: 220, g: 80, b: 80 },
  });
  await writeJpeg(path.join(smokeRoot, '2024', 'wedding-anna', 'img_002.jpg'), {
    width: 90,
    height: 160,
    color: { r: 80, g: 220, b: 120 },
  });
  await writeJpeg(path.join(smokeRoot, '2024', 'wedding-anna', 'img_003.jpg'), {
    width: 100,
    height: 100,
    color: { r: 90, g: 90, b: 220 },
  });
  await writeJpeg(path.join(smokeRoot, '2024', 'travel-iceland', 'img_010.jpg'), {
    width: 120,
    height: 80,
    color: { r: 200, g: 200, b: 80 },
  });

  // 2023 top-level year, one event folder.
  await writeJpeg(path.join(smokeRoot, '2023', 'birthday-leo', 'img_020.jpg'), {
    width: 80,
    height: 120,
    color: { r: 80, g: 200, b: 200 },
  });

  // README at the root should be silently ignored, not warned about.
  await fs.writeFile(
    path.join(smokeRoot, 'NOTES.txt'),
    'fixture library — non-image files should be skipped silently\n',
  );
}

async function buildEdge(): Promise<void> {
  await clearGenerated(edgeRoot);

  // top-level year, normal photo.
  await writeJpeg(path.join(edgeRoot, '2022', 'events', 'photo.jpg'), {
    width: 100,
    height: 100,
    color: { r: 200, g: 100, b: 50 },
  });

  // nested -> 2021 -> deep: rootward year fallback.
  await writeJpeg(
    path.join(edgeRoot, 'nested', '2021', 'deep', 'photo.jpg'),
    { width: 120, height: 90, color: { r: 50, g: 150, b: 200 } },
  );

  // no-year-folder branch: year should be null.
  await writeJpeg(
    path.join(edgeRoot, 'no-year-folder', 'loose', 'photo.jpg'),
    { width: 90, height: 120, color: { r: 150, g: 50, b: 200 } },
  );

  // Hidden directory — entire contents must be skipped.
  await writeJpeg(path.join(edgeRoot, '.hidden-folder', 'photo.jpg'), {
    width: 32,
    height: 32,
    color: { r: 0, g: 0, b: 0 },
  });

  // Hidden image at the root — must be skipped.
  await writeJpeg(path.join(edgeRoot, '.hidden-image.jpg'), {
    width: 32,
    height: 32,
    color: { r: 0, g: 0, b: 0 },
  });

  // Unsupported file extension — silently skipped.
  await fs.writeFile(
    path.join(edgeRoot, 'notes.txt'),
    'not an image file\n',
  );

  // Corrupt file with a .jpg extension. sharp.metadata() will reject it
  // and the scanner should emit a metadata-failed warning.
  await fs.mkdir(path.join(edgeRoot, 'corrupt'), { recursive: true });
  await fs.writeFile(
    path.join(edgeRoot, 'corrupt', 'broken.jpg'),
    Buffer.from('not a real jpeg — used to test corrupt handling'),
  );
}

/**
 * The browser specs' library: the smoke library's albums with enough
 * photos that the wall is several screens across, in a mix of shapes.
 */
async function buildWall(): Promise<void> {
  await clearGenerated(wallRoot);
  const albums: Array<[string, number]> = [
    [path.join('2024', 'wedding-anna'), 70],
    [path.join('2024', 'travel-iceland'), 50],
    [path.join('2023', 'birthday-leo'), 40],
  ];
  const shapes: Array<[number, number]> = [
    [180, 120],
    [120, 180],
    [160, 90],
    [150, 150],
    [180, 120],
    [120, 180],
    [200, 100],
  ];
  let index = 0;
  for (const [album, count] of albums) {
    for (let photo = 0; photo < count; photo += 1) {
      const [width, height] = shapes[index % shapes.length]!;
      const hue = (index * 47) % 360;
      await writeJpeg(path.join(wallRoot, album, `img_${String(photo).padStart(3, '0')}.jpg`), {
        width,
        height,
        color: hslToRgb(hue, 0.55, 0.5),
      });
      index += 1;
    }
  }
}

function hslToRgb(hue: number, saturation: number, lightness: number): ImageSpec['color'] {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - chroma / 2;
  const [r, g, b] =
    hue < 60 ? [chroma, x, 0]
      : hue < 120 ? [x, chroma, 0]
        : hue < 180 ? [0, chroma, x]
          : hue < 240 ? [0, x, chroma]
            : hue < 300 ? [x, 0, chroma]
              : [chroma, 0, x];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

async function main(): Promise<void> {
  await buildSmoke();
  await buildEdge();
  await buildWall();
  // eslint-disable-next-line no-console
  console.log('fixtures regenerated:', { smokeRoot, edgeRoot, wallRoot });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('fixture generation failed:', err);
  process.exit(1);
});
