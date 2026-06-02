import type { YearSource } from '../../shared/api/library.js';
import { relativeSegments } from './paths.js';

const YEAR_REGEX = /^\d{4}$/;
const MIN_YEAR = 1900;
const MAX_YEAR = 2099;

export interface DerivedYear {
  year: number | null;
  source: YearSource;
}

/**
 * Derive a photo's year from its relative directory path segments.
 *
 * Rules (per mission contract):
 *  - Prefer the *top-level* (root-most) folder when it is a 4-digit year.
 *  - Otherwise fall back to the nearest-rootward 4-digit-year segment.
 *  - Otherwise return `null` with source `none`.
 *
 * A 4-digit-year segment must fall in [1900, 2099] to be accepted; this
 * keeps things like a folder called `0001` from being labelled a year.
 */
export function deriveYearFromRelativeDir(
  relativeDir: string,
): DerivedYear {
  const segments = relativeSegments(relativeDir);
  if (segments.length === 0) {
    return { year: null, source: 'none' };
  }

  const topLevel = segments[0]!;
  const topLevelYear = parseYearSegment(topLevel);
  if (topLevelYear !== null) {
    return { year: topLevelYear, source: 'top-level' };
  }

  for (let i = 1; i < segments.length; i += 1) {
    const candidate = parseYearSegment(segments[i]!);
    if (candidate !== null) {
      return { year: candidate, source: 'rootward' };
    }
  }

  return { year: null, source: 'none' };
}

function parseYearSegment(segment: string): number | null {
  if (!YEAR_REGEX.test(segment)) {
    return null;
  }
  const value = Number.parseInt(segment, 10);
  if (Number.isNaN(value) || value < MIN_YEAR || value > MAX_YEAR) {
    return null;
  }
  return value;
}
