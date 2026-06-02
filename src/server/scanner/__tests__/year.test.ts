import { describe, expect, it } from 'vitest';
import { deriveYearFromRelativeDir } from '../year.js';

describe('deriveYearFromRelativeDir', () => {
  it('returns the top-level year when the first segment is YYYY', () => {
    expect(deriveYearFromRelativeDir('2024/wedding')).toEqual({
      year: 2024,
      source: 'top-level',
    });
  });

  it('falls back to the nearest-rootward YYYY segment when the top level is non-numeric', () => {
    expect(deriveYearFromRelativeDir('nested/2021/deep')).toEqual({
      year: 2021,
      source: 'rootward',
    });
  });

  it('prefers the rootward year when multiple year segments exist', () => {
    expect(deriveYearFromRelativeDir('archive/2019/extra/2024/inside')).toEqual({
      year: 2019,
      source: 'rootward',
    });
  });

  it('returns null with source "none" when no segment matches', () => {
    expect(deriveYearFromRelativeDir('no-year-folder/loose')).toEqual({
      year: null,
      source: 'none',
    });
  });

  it('treats the library root (empty path) as yearless', () => {
    expect(deriveYearFromRelativeDir('')).toEqual({
      year: null,
      source: 'none',
    });
  });

  it('rejects 4-digit segments outside the [1900, 2099] window', () => {
    expect(deriveYearFromRelativeDir('0001/event')).toEqual({
      year: null,
      source: 'none',
    });
    expect(deriveYearFromRelativeDir('2100/event')).toEqual({
      year: null,
      source: 'none',
    });
  });

  it('does not interpret partial numeric segments as years', () => {
    expect(deriveYearFromRelativeDir('20240/event')).toEqual({
      year: null,
      source: 'none',
    });
    expect(deriveYearFromRelativeDir('2024-events')).toEqual({
      year: null,
      source: 'none',
    });
  });
});
