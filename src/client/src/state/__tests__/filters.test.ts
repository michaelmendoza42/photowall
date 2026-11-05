import { describe, expect, it } from 'vitest';
import {
  pruneMissingFolders,
  EMPTY_FILTERS,
  clearFilters,
  hasAnyFilter,
  parseActiveFilters,
  summarizeFilters,
  toQueryFilters,
  toggleFolder,
  toggleYear,
} from '../filters.js';

describe('filters', () => {
  it('reports no active filter for the empty value', () => {
    expect(hasAnyFilter(EMPTY_FILTERS)).toBe(false);
    expect(summarizeFilters(EMPTY_FILTERS)).toBe('none');
  });

  it('detects an active year filter', () => {
    const f = { years: [2024], folders: [], excludeFolders: [] };
    expect(hasAnyFilter(f)).toBe(true);
    expect(summarizeFilters(f)).toContain('years=2024');
  });

  it('omits empty axes from the query shape', () => {
    expect(toQueryFilters(EMPTY_FILTERS)).toEqual({});
  });

  it('includes only non-empty axes in the query shape', () => {
    expect(
      toQueryFilters({
        years: [2023, 2024],
        folders: [],
        excludeFolders: [],
      }),
    ).toEqual({
      years: [2023, 2024],
    });
  });

  describe('toggleYear', () => {
    it('adds a year sorted ascending', () => {
      const out = toggleYear(
        { years: [2024], folders: [], excludeFolders: [] },
        2022,
      );
      expect(out.years).toEqual([2022, 2024]);
    });

    it('removes an already-selected year', () => {
      const out = toggleYear(
        { years: [2022, 2024], folders: [], excludeFolders: [] },
        2024,
      );
      expect(out.years).toEqual([2022]);
    });
  });

  describe('toggleFolder', () => {
    it('adds a folder path and sorts the result', () => {
      const out = toggleFolder(
        { years: [], folders: ['2024'], excludeFolders: [] },
        '2023',
      );
      expect(out.folders).toEqual(['2023', '2024']);
    });

    it('removes an already-selected folder', () => {
      const out = toggleFolder(
        { years: [], folders: ['2023', '2024'], excludeFolders: [] },
        '2024',
      );
      expect(out.folders).toEqual(['2023']);
    });
  });

  describe('clearFilters', () => {
    it('returns the same identity when nothing is set', () => {
      expect(clearFilters(EMPTY_FILTERS)).toBe(EMPTY_FILTERS);
    });

    it('resets to empty when filters are present', () => {
      const out = clearFilters({
        years: [2024],
        folders: ['2024/travel'],
        excludeFolders: [],
      });
      expect(out).toEqual(EMPTY_FILTERS);
    });
  });

  describe('pruneMissingFolders', () => {
    const available = ['', '2024', '2024/trip', '2024/trip/favs'];

    it('drops folder rules the library no longer has', () => {
      const out = pruneMissingFolders(
        {
          years: [],
          folders: ['2023/birthday-leo', '2024'],
          excludeFolders: ['2024/gone', '2024/trip/favs'],
        },
        available,
      );
      expect(out.folders).toEqual(['2024']);
      expect(out.excludeFolders).toEqual(['2024/trip/favs']);
    });

    it('drops leftover exclusions when no selection remains', () => {
      const out = pruneMissingFolders(
        { years: [], folders: ['2023/gone'], excludeFolders: ['2024/trip'] },
        available,
      );
      expect(out.folders).toEqual([]);
      expect(out.excludeFolders).toEqual([]);
    });

    it('keeps the same object when everything still exists', () => {
      const f = { years: [], folders: ['2024'], excludeFolders: [] };
      expect(pruneMissingFolders(f, available)).toBe(f);
    });
  });

  describe('parseActiveFilters', () => {
    it('returns empty filters for invalid persisted data', () => {
      expect(parseActiveFilters('{bad json')).toBe(EMPTY_FILTERS);
      expect(parseActiveFilters(null)).toBe(EMPTY_FILTERS);
    });

    it('normalizes persisted filters and drops a retired playlist id', () => {
      expect(
        parseActiveFilters(
          JSON.stringify({
            years: [2024, 2022, 'bad'],
            folders: ['b', 'a', 1],
            excludeFolders: [],
            playlistId: 'pl-1',
          }),
        ),
      ).toEqual({
        years: [2022, 2024],
        folders: ['a', 'b'],
        excludeFolders: [],
      });
    });
  });
});
