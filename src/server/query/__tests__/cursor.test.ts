import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from '../cursor.js';

describe('photo query cursor', () => {
  it('round-trips snapshot id and sort tuple', () => {
    const raw = encodeCursor({
      s: 'snapshot-abc',
      p: '2024/wedding-anna/img_002.jpg',
      i: 'photo-id-001',
    });
    expect(typeof raw).toBe('string');
    expect(raw).not.toContain('=');
    expect(raw).not.toContain('+');
    expect(raw).not.toContain('/');

    const decoded = decodeCursor(raw);
    if (!decoded.ok) {
      throw new Error(`expected ok cursor, got ${decoded.reason}`);
    }
    expect(decoded.cursor.s).toBe('snapshot-abc');
    expect(decoded.cursor.p).toBe('2024/wedding-anna/img_002.jpg');
    expect(decoded.cursor.i).toBe('photo-id-001');
    expect(decoded.cursor.v).toBe(1);
  });

  it('rejects malformed base64', () => {
    const result = decodeCursor('!!!not-base64!!!');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('malformed');
  });

  it('rejects non-JSON payload', () => {
    // valid base64 but the decoded bytes are not JSON.
    const malformed = Buffer.from('not json at all', 'utf8').toString('base64');
    const result = decodeCursor(malformed);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('malformed');
  });

  it('rejects payloads with missing required fields', () => {
    const partial = Buffer.from(JSON.stringify({ v: 1, s: 'x' }), 'utf8').toString(
      'base64',
    );
    const result = decodeCursor(partial);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('malformed');
  });

  it('rejects payloads with an incompatible format version', () => {
    const future = Buffer.from(
      JSON.stringify({ v: 99, s: 'x', p: 'y', i: 'z' }),
      'utf8',
    ).toString('base64');
    const result = decodeCursor(future);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('incompatible_version');
  });
});
