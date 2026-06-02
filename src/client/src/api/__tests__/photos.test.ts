import { describe, expect, it } from 'vitest';
import { buildPhotosQueryParams } from '../photos.js';

describe('buildPhotosQueryParams', () => {
  it('omits cursor and limit when not provided', () => {
    const params = buildPhotosQueryParams({
      filters: {},
      cursor: null,
    });
    expect(params.toString()).toBe('');
  });

  it('encodes cursor and limit when provided', () => {
    const params = buildPhotosQueryParams({
      filters: {},
      cursor: 'opaque-cursor',
      limit: 60,
    });
    expect(params.get('cursor')).toBe('opaque-cursor');
    expect(params.get('limit')).toBe('60');
  });

  it('appends repeated year and folder params', () => {
    const params = buildPhotosQueryParams({
      filters: { years: [2023, 2024], folders: ['2023/birthday'] },
      cursor: null,
    });
    expect(params.getAll('year')).toEqual(['2023', '2024']);
    expect(params.getAll('folder')).toEqual(['2023/birthday']);
  });

  it('passes through a playlist id', () => {
    const params = buildPhotosQueryParams({
      filters: { playlistId: 'pl-favourites' },
      cursor: null,
    });
    expect(params.get('playlist')).toBe('pl-favourites');
  });

  it('combines playlist with inline year filters', () => {
    const params = buildPhotosQueryParams({
      filters: { playlistId: 'pl-1', years: [2024] },
      cursor: 'c',
      limit: 30,
    });
    expect(params.get('playlist')).toBe('pl-1');
    expect(params.getAll('year')).toEqual(['2024']);
    expect(params.get('cursor')).toBe('c');
    expect(params.get('limit')).toBe('30');
  });
});
