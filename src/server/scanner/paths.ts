import path from 'node:path';

/**
 * Normalize an absolute path to a forward-slash relative path under
 * `rootRealPath`. Both arguments must already be absolute and realpath-resolved.
 *
 * Returns `null` when the path escapes the root. The empty string means
 * the input *is* the root itself.
 */
export function normalizeRelative(
  absolutePath: string,
  rootRealPath: string,
): string | null {
  const relative = path.relative(rootRealPath, absolutePath);
  if (relative === '') {
    return '';
  }
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }
  return relative.split(path.sep).join('/');
}

/**
 * Split a forward-slash relative path into its segments. Returns an
 * empty array for the empty (root) path.
 */
export function relativeSegments(relativePath: string): string[] {
  if (relativePath === '') {
    return [];
  }
  return relativePath.split('/');
}

/**
 * Derive the relative directory of a relative file path. Forward-slash
 * normalized. The directory of `2024/wedding/img.jpg` is `2024/wedding`;
 * for `img.jpg` at the root it is `''`.
 */
export function relativeDirname(relativePath: string): string {
  const idx = relativePath.lastIndexOf('/');
  return idx < 0 ? '' : relativePath.slice(0, idx);
}
