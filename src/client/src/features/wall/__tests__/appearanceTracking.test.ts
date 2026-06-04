import { describe, expect, it } from 'vitest';
import {
  collectFirstAppearancePhotoIds,
  rememberSeenPhotoIds,
} from '../appearanceTracking.js';

describe('collectFirstAppearancePhotoIds', () => {
  it('returns only ids that have not been seen yet', () => {
    const seen = new Set(['b']);
    expect(
      collectFirstAppearancePhotoIds(['a', 'b', 'c'], seen),
    ).toEqual(['a', 'c']);
  });

  it('dedupes repeated ids within the same render pass', () => {
    expect(
      collectFirstAppearancePhotoIds(['a', 'a', 'b', 'a', 'b'], new Set()),
    ).toEqual(['a', 'b']);
  });

  it('returns an empty list when everything is already known', () => {
    const seen = new Set(['a', 'b']);
    expect(collectFirstAppearancePhotoIds(['a', 'b'], seen)).toEqual([]);
  });
});

describe('rememberSeenPhotoIds', () => {
  it('records new ids in-place and reports that the set changed', () => {
    const seen = new Set<string>();
    expect(rememberSeenPhotoIds(seen, ['a', 'b'])).toBe(true);
    expect([...seen]).toEqual(['a', 'b']);
  });

  it('returns false when the ids were already present', () => {
    const seen = new Set(['a', 'b']);
    expect(rememberSeenPhotoIds(seen, ['b', 'a'])).toBe(false);
    expect([...seen]).toEqual(['a', 'b']);
  });
});
