import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  normalizeRelative,
  relativeDirname,
  relativeSegments,
} from '../paths.js';

const ROOT = path.resolve('/tmp', 'photo-wall-root-fake');

describe('normalizeRelative', () => {
  it('returns the empty string when the path *is* the root', () => {
    expect(normalizeRelative(ROOT, ROOT)).toBe('');
  });

  it('returns a forward-slash relative path for a nested file', () => {
    const abs = path.join(ROOT, '2024', 'wedding', 'img.jpg');
    expect(normalizeRelative(abs, ROOT)).toBe('2024/wedding/img.jpg');
  });

  it('rejects paths that escape the root via ..', () => {
    const abs = path.resolve(ROOT, '..', 'sibling', 'leak.jpg');
    expect(normalizeRelative(abs, ROOT)).toBeNull();
  });

  it('rejects absolute paths that point at a different root', () => {
    expect(normalizeRelative('/etc/passwd', ROOT)).toBeNull();
  });
});

describe('relativeDirname', () => {
  it('returns the parent dir for a nested file', () => {
    expect(relativeDirname('2024/wedding/img.jpg')).toBe('2024/wedding');
  });

  it('returns empty string for a root-level file', () => {
    expect(relativeDirname('img.jpg')).toBe('');
  });
});

describe('relativeSegments', () => {
  it('splits a relative path into its segments', () => {
    expect(relativeSegments('a/b/c')).toEqual(['a', 'b', 'c']);
  });

  it('returns an empty array for the root', () => {
    expect(relativeSegments('')).toEqual([]);
  });
});
