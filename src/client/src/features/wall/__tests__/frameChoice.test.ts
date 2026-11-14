import { describe, expect, it } from 'vitest';
import {
  FANCY_FRAME_STYLES,
  STANDARD_FRAME_STYLES,
  type FrameStyle,
} from '../../../../../shared/api/curation.js';
import { isFancyFrame, resolveFeaturedFrame } from '../featuredFrames.js';

const ids = Array.from({ length: 200 }, (_, index) => `photo-${index}`);
const pick = (choice: Parameters<typeof resolveFeaturedFrame>[0], pool?: Parameters<typeof resolveFeaturedFrame>[2]) =>
  new Set(ids.map((id) => resolveFeaturedFrame(choice, id, pool)));
const within = (styles: Set<FrameStyle>, pool: readonly FrameStyle[]) => [...styles].every((s) => pool.includes(s));

describe('frame choice', () => {
  it('hangs random frames from the standard frames unless the curator says otherwise', () => {
    const standard = pick('random');
    expect(within(standard, STANDARD_FRAME_STYLES)).toBe(true);
    expect(standard.size).toBe(STANDARD_FRAME_STYLES.length);
    expect(within(pick(undefined), STANDARD_FRAME_STYLES)).toBe(true);
    expect(within(pick('random', 'fancy'), FANCY_FRAME_STYLES)).toBe(true);
    const both = pick('random', 'both');
    expect([...both].some((s) => STANDARD_FRAME_STYLES.includes(s as never))).toBe(true);
    expect([...both].some((s) => FANCY_FRAME_STYLES.includes(s as never))).toBe(true);
  });

  it('hangs Random fancy in a fancy frame whatever the wall uses', () => {
    for (const pool of ['standard', 'fancy', 'both'] as const) {
      expect(within(pick('random-fancy', pool), FANCY_FRAME_STYLES)).toBe(true);
    }
  });

  it('keeps a picked frame, standard or fancy', () => {
    expect(resolveFeaturedFrame('walnut', 'a', 'fancy')).toBe('walnut');
    expect(resolveFeaturedFrame('museum-gilt', 'a', 'standard')).toBe('museum-gilt');
  });

  it('labels the fancy frames as their own group', () => {
    expect(FANCY_FRAME_STYLES.every(isFancyFrame)).toBe(true);
    expect(isFancyFrame('random-fancy')).toBe(true);
    expect(STANDARD_FRAME_STYLES.some(isFancyFrame)).toBe(false);
    expect(isFancyFrame('random')).toBe(false);
  });
});
