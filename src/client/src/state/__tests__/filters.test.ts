import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTERS,
  hasAnyFilter,
  summarizeFilters,
  toQueryFilters,
} from '../filters.js';

describe('filters', () => {
  it('reports no active filter for the empty value', () => {
    expect(hasAnyFilter(EMPTY_FILTERS)).toBe(false);
    expect(summarizeFilters(EMPTY_FILTERS)).toBe('none');
  });

  it('detects an active year filter', () => {
    const f = { years: [2024], folders: [], playlistId: null };
    expect(hasAnyFilter(f)).toBe(true);
    expect(summarizeFilters(f)).toContain('years=2024');
  });

  it('detects a playlist-only filter', () => {
    const f = { years: [], folders: [], playlistId: 'pl-1' };
    expect(hasAnyFilter(f)).toBe(true);
    expect(summarizeFilters(f)).toContain('playlist=pl-1');
  });

  it('omits empty axes from the query shape', () => {
    expect(toQueryFilters(EMPTY_FILTERS)).toEqual({});
  });

  it('includes only non-empty axes in the query shape', () => {
    expect(
      toQueryFilters({
        years: [2023, 2024],
        folders: [],
        playlistId: 'pl-1',
      }),
    ).toEqual({
      years: [2023, 2024],
      playlistId: 'pl-1',
    });
  });
});
