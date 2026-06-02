// Opaque cursor encoding for the paginated photo query.
//
// Photos are ordered by `(relativePath, id)` (path is already unique
// within a snapshot, id is a stable tiebreaker for paranoia). A cursor
// captures the active snapshot id plus the last-emitted tuple so the
// next page can resume at the correct position without server-side
// state.
//
// Cursors are base64url-encoded JSON. The shape is intentionally
// minimal but extensible: future ordering changes can bump
// `CURSOR_FORMAT_VERSION` and decoders can reject older shapes.

const CURSOR_FORMAT_VERSION = 1;

export interface PhotoQueryCursor {
  /** Cursor format version — bump on incompatible shape changes. */
  v: number;
  /** Snapshot id this cursor was issued against. */
  s: string;
  /** Last-seen relativePath (primary sort key). */
  p: string;
  /** Last-seen photo id (tiebreaker sort key). */
  i: string;
}

/** Encode a cursor into the opaque base64url string returned over the wire. */
export function encodeCursor(cursor: Omit<PhotoQueryCursor, 'v'>): string {
  const payload: PhotoQueryCursor = {
    v: CURSOR_FORMAT_VERSION,
    s: cursor.s,
    p: cursor.p,
    i: cursor.i,
  };
  return base64urlEncode(JSON.stringify(payload));
}

export type DecodeOutcome =
  | { ok: true; cursor: PhotoQueryCursor }
  | { ok: false; reason: 'malformed' | 'incompatible_version' };

/** Decode a cursor. Returns a structured failure rather than throwing. */
export function decodeCursor(raw: string): DecodeOutcome {
  let json: string;
  try {
    json = base64urlDecode(raw);
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (!isCursorShape(parsed)) {
    return { ok: false, reason: 'malformed' };
  }
  if (parsed.v !== CURSOR_FORMAT_VERSION) {
    return { ok: false, reason: 'incompatible_version' };
  }
  return { ok: true, cursor: parsed };
}

function isCursorShape(value: unknown): value is PhotoQueryCursor {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.v === 'number' &&
    typeof obj.s === 'string' &&
    typeof obj.p === 'string' &&
    typeof obj.i === 'string'
  );
}

function base64urlEncode(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64urlDecode(input: string): string {
  // Restore standard base64 padding then decode.
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, 'base64').toString('utf8');
}
