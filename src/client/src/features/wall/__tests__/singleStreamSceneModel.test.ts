import { describe, expect, it } from 'vitest';
import type { PhotoQueryRecord } from '../../../../../shared/api/photos.js';
import { buildSingleStreamSceneModel } from '../singleStreamSceneModel.js';

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

describe('buildSingleStreamSceneModel', () => {
  it('keeps row-local hit-target geometry aligned with absolute pixi tile geometry', () => {
    const model = buildSingleStreamSceneModel({
      photos: [photo('a'), photo('b', 100, 200)],
      hasMore: false,
      worldWidth: 320,
      cameraX: 0,
      cameraY: 0,
      zoom: 1,
      viewportWidth: 320,
      viewportHeight: 480,
      overscan: NO_OVERSCAN,
      maxRowHeight: 200,
      columnWidthFactors: [1],
      tileScale: 1,
    });

    expect(model.packed.rows.length).toBeGreaterThan(0);
    expect(model.renderedRows.length).toBeGreaterThan(0);
    expect(model.pixiTiles.length).toBeGreaterThan(0);
    expect(model.visibleStart).toBe(0);
    expect(model.visibleEnd).toBeGreaterThan(0);
    expect(model.horizontalCopyCount).toBeGreaterThan(0);
    expect(model.verticalSegmentCount).toBeGreaterThan(0);
    expect(model.renderedTileCount).toBe(model.pixiTiles.length);

    for (const row of model.renderedRows) {
      for (const tile of row.tiles) {
        const pixiTile = model.pixiTiles.find((candidate) => candidate.key === tile.key);
        expect(pixiTile).toBeDefined();
        expect(pixiTile?.x).toBe(tile.x);
        expect(pixiTile?.y).toBe(row.offsetTop + tile.y);
        expect(pixiTile?.sourceWidth).toBe(tile.sourceWidth);
        expect(pixiTile?.sourceHeight).toBe(tile.sourceHeight);
      }
    }
  });

  it('repeats wrapped copies when the viewport is larger than the bounded world', () => {
    const model = buildSingleStreamSceneModel({
      photos: [photo('solo')],
      hasMore: false,
      worldWidth: 240,
      cameraX: 60,
      cameraY: 40,
      zoom: 1,
      viewportWidth: 820,
      viewportHeight: 820,
      overscan: NO_OVERSCAN,
      maxRowHeight: 240,
      columnWidthFactors: [1],
      tileScale: 1,
    });

    expect(model.mountedRowCount).toBe(1);
    expect(model.renderedRows.length).toBeGreaterThan(1);
    expect(model.pixiTiles.length).toBeGreaterThan(1);
    expect(new Set(model.pixiTiles.map((tile) => tile.key)).size).toBe(model.pixiTiles.length);
    expect(new Set(model.pixiTiles.map((tile) => tile.photoId))).toEqual(new Set(['solo']));
  });

  it('keeps the visible render window stable when later photos append below the current wall viewport', () => {
    const initial = buildSingleStreamSceneModel({
      photos: [
        photo('a'),
        photo('b'),
        photo('c'),
        photo('d'),
        photo('e'),
        photo('f'),
      ],
      hasMore: true,
      worldWidth: 240,
      cameraX: 0,
      cameraY: 0,
      zoom: 1,
      viewportWidth: 240,
      viewportHeight: 220,
      overscan: NO_OVERSCAN,
      maxRowHeight: 200,
      columnWidthFactors: [1],
      tileScale: 1,
    });

    const appended = buildSingleStreamSceneModel({
      photos: [
        photo('a'),
        photo('b'),
        photo('c'),
        photo('d'),
        photo('e'),
        photo('f'),
        photo('g'),
        photo('h'),
        photo('i'),
      ],
      hasMore: true,
      worldWidth: 240,
      cameraX: 0,
      cameraY: 0,
      zoom: 1,
      viewportWidth: 240,
      viewportHeight: 220,
      overscan: NO_OVERSCAN,
      maxRowHeight: 200,
      columnWidthFactors: [1],
      tileScale: 1,
    });

    expect(appended.renderedRows).toEqual(initial.renderedRows);
    expect(appended.pixiTiles).toEqual(initial.pixiTiles);
    expect(appended.renderedTileCount).toBe(initial.renderedTileCount);
    expect(appended.mountedRowCount).toBe(initial.mountedRowCount);
  });

  it('is deterministic for identical inputs', () => {
    const input = {
      photos: [photo('a'), photo('b'), photo('c', 150, 200)],
      hasMore: false,
      worldWidth: 960,
      cameraX: 120,
      cameraY: 80,
      zoom: 1.3,
      viewportWidth: 640,
      viewportHeight: 480,
      overscan: { rowsAbove: 1, rowsBelow: 2 },
      maxRowHeight: 220,
      columnWidthFactors: [1, 0.8, 1.1],
      tileScale: 0.9,
    } as const;

    expect(buildSingleStreamSceneModel(input)).toEqual(
      buildSingleStreamSceneModel(input),
    );
  });
});
