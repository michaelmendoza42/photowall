import { describe, expect, it } from 'vitest';
import type { PhotoQueryRecord } from '../../../../../shared/api/photos.js';
import { packJustifiedRows } from '../packer.js';
import {
  buildSingleStreamRenderWindow,
  projectSingleStreamViewport,
} from '../singleStreamRenderWindow.js';

function photo(id: string, width = 200, height = 100): PhotoQueryRecord {
  return {
    id,
    relativePath: `2024/event/${id}.jpg`,
    directoryPath: '2024/event',
    filename: `${id}.jpg`,
    width,
    height,
    aspectRatio: width / height,
    fileSize: 1000,
    mtimeMs: 0,
    year: 2024,
    yearSource: 'top-level',
  };
}

const NO_OVERSCAN = { rowsAbove: 0, rowsBelow: 0 };

describe('singleStreamRenderWindow', () => {
  it('preserves the same wrapped render window after whole-period travel', () => {
    const packed = packJustifiedRows(
      [
        photo('a', 160, 90),
        photo('b', 90, 160),
        photo('c', 100, 100),
        photo('d', 160, 90),
        photo('e', 90, 160),
      ],
      {
        worldWidth: 320,
        maxRowHeight: 220,
        columnWidthFactors: [1, 1],
        tileScale: 1,
      },
      false,
    );

    const initialProjection = projectSingleStreamViewport({
      worldWidth: 320,
      contentHeight: packed.contentHeight,
      cameraX: 90,
      cameraY: 70,
      zoom: 1.25,
      viewportWidth: 280,
      viewportHeight: 260,
    });
    const initial = buildSingleStreamRenderWindow({
      packed,
      worldWidth: 320,
      projection: initialProjection,
      overscan: NO_OVERSCAN,
    });

    const wrappedProjection = projectSingleStreamViewport({
      worldWidth: 320,
      contentHeight: packed.contentHeight,
      cameraX: 410,
      cameraY: 70 + packed.contentHeight,
      zoom: 1.25,
      viewportWidth: 280,
      viewportHeight: 260,
    });
    const wrapped = buildSingleStreamRenderWindow({
      packed,
      worldWidth: 320,
      projection: wrappedProjection,
      overscan: NO_OVERSCAN,
    });

    expect(wrapped).toEqual(initial);
  });

  it('reports repeated wrapped copies when the viewport exceeds the bounded world', () => {
    const packed = packJustifiedRows(
      [photo('solo')],
      {
        worldWidth: 240,
        maxRowHeight: 240,
        columnWidthFactors: [1],
        tileScale: 1,
      },
      false,
    );

    const projection = projectSingleStreamViewport({
      worldWidth: 240,
      contentHeight: packed.contentHeight,
      cameraX: 60,
      cameraY: 40,
      zoom: 1,
      viewportWidth: 820,
      viewportHeight: 820,
    });

    const renderWindow = buildSingleStreamRenderWindow({
      packed,
      worldWidth: 240,
      projection,
      overscan: NO_OVERSCAN,
    });

    expect(renderWindow.mountedRowCount).toBe(1);
    expect(renderWindow.horizontalCopyCount).toBeGreaterThan(1);
    expect(renderWindow.verticalSegmentCount).toBeGreaterThan(1);
    expect(renderWindow.renderedRows.length).toBeGreaterThan(1);
    expect(renderWindow.renderedTileCount).toBeGreaterThan(1);
    expect(new Set(renderWindow.renderedRows.flatMap((row) => row.tiles.map((tile) => tile.key))).size)
      .toBe(renderWindow.renderedTileCount);
  });
});
