/**
 * Draw the wall layout as pictures, from the real layout code.
 *
 *   npm run layout:viz                 # sample albums
 *   npm run layout:viz -- --server http://192.168.68.134:5176   # + the live library
 *
 * Each picture tiles 2×2 copies of the wall, the way the loop places them,
 * so the seams where copies meet are visible. Albums get their own hue;
 * within an album, earlier photos are darker (they should sit at the
 * center); repeats on the ragged edge are hatched. Dashed lines mark each
 * copy's loop edges. Output: artifacts/layout/*.png, index.html, and SVGs for
 * the smaller scenes.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import type { PhotoQueryRecord } from '../src/shared/api/photos.js';
import {
  buildRadialWallLayout,
  groupPhotosByDirectory,
  type RadialWallGroup,
} from '../src/client/src/features/wall/radialWall.js';
import { DEFAULT_MOSAIC_COLUMN_FACTORS } from '../src/client/src/features/wall/worldWidth.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '..', 'artifacts', 'layout');
/** Reference width at a typical desktop viewport (see computeWorldWidth). */
const REFERENCE_WIDTH = 3600;
const PICTURE_WIDTH = 1100;
const MAX_KEPT_SVG_BYTES = 1_000_000;

interface Scene {
  name: string;
  title: string;
  groups: RadialWallGroup[];
}

function samplePhoto(group: number, index: number): PhotoQueryRecord {
  // Mostly 3:2 landscape, about a third portrait, a few squares and panoramas.
  const r = (index * 7919 + group * 31) % 100;
  const [width, height] =
    r < 62 ? [6000, 4000] : r < 92 ? [4000, 6000] : r < 97 ? [3000, 3000] : [6000, 2000];
  return {
    id: `g${group}-${index}`,
    relativePath: `sample/album-${group}/${index}.jpg`,
    directoryPath: `sample/album-${group}`,
    filename: `${index}.jpg`,
    width,
    height,
    aspectRatio: width / height,
    fileSize: 1,
    mtimeMs: 0,
    year: 2024,
    yearSource: 'top-level',
  };
}

function sampleGroups(sizes: readonly number[]): RadialWallGroup[] {
  return sizes.map((size, group) => ({
    key: `album-${group}`,
    photos: Array.from({ length: size }, (_, index) => samplePhoto(group, index)),
  }));
}

async function liveGroups(server: string): Promise<RadialWallGroup[]> {
  const photos: PhotoQueryRecord[] = [];
  let cursor: string | null = null;
  do {
    const url = new URL('/api/photos', server);
    url.searchParams.set('limit', '5000');
    if (cursor) url.searchParams.set('cursor', cursor);
    const response = await fetch(url);
    const page = (await response.json()) as { photos: PhotoQueryRecord[]; nextCursor: string | null };
    photos.push(...page.photos);
    cursor = page.nextCursor;
  } while (cursor);
  return groupPhotosByDirectory(photos);
}

function renderSvg(scene: Scene): { svg: string; summary: string } {
  const started = performance.now();
  const layout = buildRadialWallLayout({
    groups: scene.groups,
    referenceWidth: REFERENCE_WIDTH,
    maxRowHeight: 460,
    columnWidthFactors: DEFAULT_MOSAIC_COLUMN_FACTORS,
  });
  const elapsed = Math.round(performance.now() - started);
  const W = layout.worldWidth;
  const H = layout.contentHeight;
  const tiles = layout.rows.flatMap((row) => row.tiles);

  const info = new Map<string, { group: number; rank: number; size: number }>();
  scene.groups.forEach((group, groupIndex) => {
    group.photos.forEach((photo, rank) => {
      info.set(photo.id, { group: groupIndex, rank, size: group.photos.length });
    });
  });

  // Draw like the renderer: every copy's base layer, then each edge layer.
  const ordered = tiles
    .map((tile, index) => ({ tile, index }))
    .sort((a, b) => (a.tile.layer ?? 0) - (b.tile.layer ?? 0) || a.index - b.index);
  const stroke = W / 900;
  const rects: string[] = [];
  for (const layer of [0, 1, 2]) {
    for (const cy of [0, 1]) {
      for (const cx of [0, 1]) {
        for (const { tile } of ordered) {
          if ((tile.layer ?? 0) !== layer) continue;
          const meta = info.get(tile.photoId)!;
          const hue = (meta.group * 137.508) % 360;
          const light = 28 + 42 * (meta.rank / Math.max(1, meta.size - 1));
          const fill = `hsl(${hue.toFixed(1)},62%,${light.toFixed(1)}%)`;
          const x = tile.x + cx * W;
          const y = tile.y + cy * H;
          rects.push(
            `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${tile.width.toFixed(1)}" height="${tile.height.toFixed(1)}" fill="${fill}" stroke="#111" stroke-width="${stroke.toFixed(1)}"/>`,
          );
          if (tile.duplicate) {
            rects.push(
              `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${tile.width.toFixed(1)}" height="${tile.height.toFixed(1)}" fill="url(#dup)"/>`,
            );
          }
        }
      }
    }
  }
  const dash = `stroke="#fff" stroke-width="${(stroke * 2).toFixed(1)}" stroke-dasharray="${(stroke * 12).toFixed(1)} ${(stroke * 8).toFixed(1)}" opacity="0.8"`;
  const loopLines = [
    `<line x1="${W}" y1="0" x2="${W}" y2="${2 * H}" ${dash}/>`,
    `<line x1="0" y1="${H}" x2="${2 * W}" y2="${H}" ${dash}/>`,
  ].join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${2 * W} ${2 * H}" width="${PICTURE_WIDTH}" height="${Math.round((PICTURE_WIDTH * H) / W)}">
<defs><pattern id="dup" width="${stroke * 14}" height="${stroke * 14}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="${stroke * 4}" height="${stroke * 14}" fill="rgba(255,255,255,0.45)"/></pattern></defs>
<rect width="${2 * W}" height="${2 * H}" fill="#000"/>${rects.join('')}${loopLines}</svg>`;
  const duplicates = tiles.filter((tile) => tile.duplicate).length;
  const summary = `${layout.packedPhotoCount} photos, ${duplicates} edge repeats, wall ${Math.round(W)} × ${Math.round(H)} px, layout ${elapsed} ms`;
  return { svg, summary };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const serverIndex = args.indexOf('--server');
  const server = serverIndex >= 0 ? args[serverIndex + 1] : undefined;

  const scenes: Scene[] = [
    { name: 'one-album', title: 'One album (261 photos)', groups: sampleGroups([261]) },
    { name: 'three-albums', title: 'Three albums (261, 80, 40)', groups: sampleGroups([261, 80, 40]) },
    {
      name: 'library',
      title: 'Library-sized: 92 albums, ~15k photos',
      groups: sampleGroups(Array.from({ length: 92 }, (_, g) => 20 + ((g * 977) % 300))),
    },
  ];
  if (server) {
    scenes.push({ name: 'live-library', title: `Live library (${server})`, groups: await liveGroups(server) });
  }

  await fs.mkdir(outDir, { recursive: true });
  const entries: string[] = [];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: PICTURE_WIDTH, height: 800 } });
  for (const scene of scenes) {
    const { svg, summary } = renderSvg(scene);
    // Big scenes keep only the PNG; their SVGs run to many megabytes.
    const svgPath = path.join(outDir, `${scene.name}.svg`);
    if (svg.length <= MAX_KEPT_SVG_BYTES) await fs.writeFile(svgPath, svg);
    else await fs.rm(svgPath, { force: true });
    await page.setContent(`<body style="margin:0">${svg}</body>`);
    const size = await page.evaluate(() => {
      const el = document.querySelector('svg')!;
      return { width: el.width.baseVal.value, height: el.height.baseVal.value };
    });
    await page.setViewportSize({ width: Math.ceil(size.width), height: Math.ceil(size.height) });
    await page.screenshot({ path: path.join(outDir, `${scene.name}.png`) });
    entries.push(`<section><h2>${scene.title}</h2><p>${summary}</p><img src="${scene.name}.png" alt="${scene.title}"></section>`);
    // eslint-disable-next-line no-console
    console.log(`${scene.name}: ${summary}`);
  }
  await browser.close();

  await fs.writeFile(
    path.join(outDir, 'index.html'),
    `<!doctype html><meta charset="utf-8"><title>Wall layout</title>
<style>body{font:15px system-ui;background:#111;color:#ddd;margin:24px}img{max-width:100%;display:block}section{margin-bottom:40px}</style>
<h1>Wall layout</h1>
<p>2×2 copies as the loop places them. Hue = album; darker = earlier photo (should be central); hatched = edge repeat; dashed = loop edges. Generated by <code>npm run layout:viz</code>.</p>
${entries.join('\n')}`,
  );
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
