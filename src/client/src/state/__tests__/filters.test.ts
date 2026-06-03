import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTERS,
  applyPlaylistFilters,
  clearFilters,
  findStaleFolders,
  hasAnyFilter,
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

  describe('toggleYear', () => {
    it('adds a year sorted ascending', () => {
      const out = toggleYear(
        { years: [2024], folders: [], playlistId: null },
        2022,
      );
      expect(out.years).toEqual([2022, 2024]);
    });

    it('removes an already-selected year', () => {
      const out = toggleYear(
        { years: [2022, 2024], folders: [], playlistId: null },
        2024,
      );
      expect(out.years).toEqual([2022]);
    });
  });

  describe('toggleFolder', () => {
    it('adds a folder path and sorts the result', () => {
      const out = toggleFolder(
        { years: [], folders: ['2024'], playlistId: null },
        '2023',
      );
      expect(out.folders).toEqual(['2023', '2024']);
    });

    it('removes an already-selected folder', () => {
      const out = toggleFolder(
        { years: [], folders: ['2023', '2024'], playlistId: null },
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
        playlistId: 'pl-1',
      });
      expect(out).toEqual(EMPTY_FILTERS);
    });
  });

  describe('applyPlaylistFilters', () => {
    it('replaces years/folders with the saved set and records the id', () => {
      const out = applyPlaylistFilters('pl-9', {
        years: [2024, 2022],
        folders: ['b', 'a'],
      });
      expect(out).toEqual({
        playlistId: 'pl-9',
        years: [2022, 2024],
        folders: ['a', 'b'],
      });
    });
  });

  describe('findStaleFolders', () => {
    it('returns saved folders that are not in the available set', () => {
      const stale = findStaleFolders(
        ['2024/travel-iceland', '2025/missing'],
        ['', '2024', '2024/travel-iceland'],
      );
      expect(stale).toEqual(['2025/missing']);
    });

    it('returns an empty array when nothing is stale', () => {
      expect(findStaleFolders([], ['2024'])).toEqual([]);
      expect(findStaleFolders(['2024'], ['2024', '2025'])).toEqual([]);
    });
  });
});
