import { describe, expect, it } from 'vitest';
import {
  getAppSurfaceHref,
  parseAppSurfaceFromHash,
  readAppSurfaceFromLocation,
} from './appSurface.js';

describe('appSurface helpers', () => {
  it('defaults unknown or empty hashes to the real photo wall surface', () => {
    expect(parseAppSurfaceFromHash('')).toBe('wall');
    expect(parseAppSurfaceFromHash('#wall')).toBe('wall');
    expect(parseAppSurfaceFromHash('#something-else')).toBe('wall');
  });

  it('recognizes the mosaic lab hash seam', () => {
    expect(parseAppSurfaceFromHash('#mosaic-lab')).toBe('mosaic-lab');
    expect(parseAppSurfaceFromHash('  #MOSAIC-LAB  ')).toBe('mosaic-lab');
  });

  it('builds stable hrefs for entry and exit links', () => {
    expect(getAppSurfaceHref('wall')).toBe('#wall');
    expect(getAppSurfaceHref('mosaic-lab')).toBe('#mosaic-lab');
  });

  it('reads the active surface from location-like objects', () => {
    expect(readAppSurfaceFromLocation({ hash: '#mosaic-lab' })).toBe('mosaic-lab');
    expect(readAppSurfaceFromLocation({ hash: '#wall' })).toBe('wall');
  });
});
