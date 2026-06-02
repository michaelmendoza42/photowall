import { describe, expect, it } from 'vitest';
import type { PhotoQueryRecord } from '../../../../shared/api/photos.js';
import {
  DEFAULT_OVERSCAN,
  INITIAL_LAYOUT,
  withLoadedPhotos,
} from '../layout.js';

const samplePhoto: PhotoQueryRecord = {
  id: 'p-1',
  relativePath: '2023/birthday/img_001.jpg',
  directoryPath: '2023/birthday',
  filename: 'img_001.jpg',
  width: 1600,
  height: 900,
  aspectRatio: 1600 / 900,
  fileSize: 12345,
  mtimeMs: 0,
  year: 2023,
  yearSource: 'top-level',
};

describe('layout state contract', () => {
  it('initialises with an empty packer and zero content height', () => {
    expect(INITIAL_LAYOUT.photos).toEqual([]);
    expect(INITIAL_LAYOUT.rows).toEqual([]);
    expect(INITIAL_LAYOUT.contentHeight).toBe(0);
  });

  it('exposes default overscan rows above and below the visible window', () => {
    expect(DEFAULT_OVERSCAN.rowsAbove).toBeGreaterThanOrEqual(1);
    expect(DEFAULT_OVERSCAN.rowsBelow).toBeGreaterThanOrEqual(
      DEFAULT_OVERSCAN.rowsAbove,
    );
  });

  it('attaches loaded photos without producing rows yet', () => {
    const next = withLoadedPhotos(INITIAL_LAYOUT, [samplePhoto]);
    expect(next.photos).toEqual([samplePhoto]);
    expect(next.rows).toEqual([]);
    expect(next.contentHeight).toBe(0);
  });
});
