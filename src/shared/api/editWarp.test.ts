import { describe, expect, it } from 'vitest';
import { NEUTRAL_EDIT, editVersion, normalizeEdit, straightenCover, type PhotoEdit } from './edits.js';
import {
  anglesFromRotation,
  distort,
  focal35FromVanishingPoints,
  frameToTurned,
  frameWarp,
  homography,
  inv,
  lensModel,
  orderCorners,
  project,
  quadVanishingPoints,
  rotation,
  solveFromQuad,
  solveFromVanishingPoints,
  turnPoint,
  turnedToFrame,
  undistort,
  type Point,
} from './editWarp.js';

const W = 2000;
const H = 1333;
const edit = (patch: Partial<PhotoEdit>): PhotoEdit => ({ ...NEUTRAL_EDIT, ...patch });

describe('camera model', () => {
  it('round-trips sliders through the rotation matrix', () => {
    for (const a of [{ vertical: 12, horizontal: -20, rotate: 3 }, { vertical: -30, horizontal: 5, rotate: -8 }]) {
      const back = anglesFromRotation(rotation(a));
      expect(back.vertical).toBeCloseTo(a.vertical, 9);
      expect(back.horizontal).toBeCloseTo(a.horizontal, 9);
      expect(back.rotate).toBeCloseTo(a.rotate, 9);
    }
  });

  it('solves a rectangle seen through a tilted camera back to the tilt', () => {
    for (const [angles, f35] of [
      [{ vertical: 15, horizontal: -10, rotate: 2 }, 24],
      [{ vertical: -8, horizontal: 25, rotate: -4 }, 35],
    ] as const) {
      const toPhoto = inv(homography(W, H, angles, f35));
      const quad = ([[700, 400], [1300, 400], [1300, 900], [700, 900]] as Point[]).map((p) => project(toPhoto, p));
      const solved = solveFromQuad(W, H, quad, f35);
      expect(solved.vertical).toBeCloseTo(angles.vertical, 6);
      expect(solved.horizontal).toBeCloseTo(angles.horizontal, 6);
      expect(solved.rotate).toBeCloseTo(angles.rotate, 6);
      // Both vanishing points finite: the frame alone pins the focal length.
      const { horizontal, vertical } = quadVanishingPoints(quad);
      expect(focal35FromVanishingPoints(W, H, horizontal, vertical)).toBeCloseTo(f35, 3);
    }
  });

  it('fixes pitch and roll from verticals alone, leaving yaw', () => {
    const angles = { vertical: 18, horizontal: 0, rotate: 3 };
    const toPhoto = inv(homography(W, H, angles, 24));
    const quad = ([[700, 400], [1300, 400], [1300, 900], [700, 900]] as Point[]).map((p) => project(toPhoto, p));
    const solved = solveFromVanishingPoints(W, H, null, quadVanishingPoints(quad).vertical, 24);
    expect(solved.vertical).toBeCloseTo(18, 6);
    expect(solved.rotate).toBeCloseTo(3, 6);
    expect(solved.horizontal).toBeCloseTo(0, 6);
  });

  it('orders corners top-left, top-right, bottom-right, bottom-left', () => {
    expect(orderCorners([[10, 90], [90, 85], [12, 8], [95, 10]])).toEqual([[12, 8], [95, 10], [90, 85], [10, 90]]);
  });
});

describe('lens', () => {
  it('distort and undistort are inverses, and positive values fix barrel', () => {
    const L = lensModel(W, H, 60)!;
    for (const p of [[0, 0], [2000, 1333], [1500, 200]] as Point[]) {
      const q = distort(L, undistort(L, p));
      expect(Math.hypot(q[0] - p[0], q[1] - p[1])).toBeLessThan(1e-6);
    }
    // Fixing barrel pulls the corners outward when undistorting.
    const corner = undistort(L, [0, 0]);
    expect(corner[0]).toBeLessThan(0);
    expect(corner[1]).toBeLessThan(0);
  });
});

describe('frameWarp', () => {
  it('reproduces the old rotate-and-cover exactly when only straighten is set', () => {
    const warp = frameWarp(W, H, edit({ straighten: 7 }));
    const k = straightenCover(W, H, 7);
    const t = (7 * Math.PI) / 180;
    const p: Point = [300, 1100];
    const dx = p[0] - W / 2, dy = p[1] - H / 2;
    const expected: Point = [W / 2 + k * (Math.cos(t) * dx - Math.sin(t) * dy), H / 2 + k * (Math.sin(t) * dx + Math.cos(t) * dy)];
    const got = warp.toFrame(p);
    expect(got[0]).toBeCloseTo(expected[0], 9);
    expect(got[1]).toBeCloseTo(expected[1], 9);
  });

  it.each([
    ['perspective', { perspectiveVertical: 12, perspectiveHorizontal: -9, straighten: 2, focal35: 24 }],
    ['lens', { lensDistortion: 70 }],
    ['both', { perspectiveVertical: -6, lensDistortion: -40, focal35: 35 }],
  ])('%s: toFrame and fromFrame are inverses, and the frame is fully covered', (_name, patch) => {
    const e = edit(patch);
    const warp = frameWarp(W, H, e);
    for (const f of [[10, 10], [W / 2, H / 2], [W - 5, 300], [700, H - 2]] as Point[]) {
      const back = warp.toFrame(warp.fromFrame(f));
      expect(Math.hypot(back[0] - f[0], back[1] - f[1])).toBeLessThan(1e-6);
    }
    // Every point of the frame comes from inside the photo: no blank corners.
    for (let i = 0; i <= 10; i++)
      for (const f of [[(W * i) / 10, 0], [(W * i) / 10, H], [0, (H * i) / 10], [W, (H * i) / 10]] as Point[]) {
        const [x, y] = warp.fromFrame(f);
        expect(x).toBeGreaterThan(-0.5);
        expect(y).toBeGreaterThan(-0.5);
        expect(x).toBeLessThan(W + 0.5);
        expect(y).toBeLessThan(H + 0.5);
      }
  });

  it('mirrors in frame space, after the warp', () => {
    const e = edit({ perspectiveVertical: 10, flipX: true });
    const warp = frameWarp(W, H, e);
    const p: Point = [400, 300];
    const f = turnedToFrame(warp, W, H, e, p);
    expect(f[0]).toBeCloseTo(W - warp.toFrame(p)[0], 9);
    const back = frameToTurned(warp, W, H, e, f);
    expect(back[0]).toBeCloseTo(p[0], 6);
    expect(back[1]).toBeCloseTo(p[1], 6);
  });

  it('turns points clockwise like the quarter-turn rotation', () => {
    // A 200×100 photo turned 90° is 100×200; its top-left corner lands top-right.
    expect(turnPoint(200, 100, 90, [0, 0])).toEqual([100, 0]);
    expect(turnPoint(200, 100, 180, [0, 0])).toEqual([200, 100]);
    expect(turnPoint(200, 100, 270, [0, 0])).toEqual([0, 200]);
  });
});

describe('recipes', () => {
  it('keeps the version of edits saved before perspective existed', () => {
    const legacy = normalizeEdit(edit({ straighten: 3, brightness: 0.2 }));
    const { perspectiveVertical: _v, perspectiveHorizontal: _h, lensDistortion: _l, focal35: _f, ...stored } = legacy;
    expect(editVersion(stored as PhotoEdit)).toBe(editVersion(legacy));
    expect(editVersion(edit({ straighten: 3, brightness: 0.2, focal35: 50 }))).toBe(editVersion(legacy));
    expect(editVersion(edit({ straighten: 3, brightness: 0.2, perspectiveVertical: 4 }))).not.toBe(editVersion(legacy));
  });
});
