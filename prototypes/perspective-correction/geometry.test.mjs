import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as g from './geometry.js';

const W = 2000, H = 1333;

test('rotation ⇄ angles round-trips', () => {
  for (const e of [{ vertical: 12, horizontal: -20, rotate: 3 }, { vertical: -30, horizontal: 5, rotate: -8 }]) {
    const a = g.anglesFromRotation(g.rotation(e));
    for (const k of ['vertical', 'horizontal', 'rotate']) assert.ok(Math.abs(a[k] - e[k]) < 1e-9, k);
  }
});

test('a rectangle seen through a tilted camera solves back to the tilt', () => {
  for (const e of [
    { vertical: 15, horizontal: -10, rotate: 2, focal35: 24 },
    { vertical: -8, horizontal: 25, rotate: -4, focal35: 35 },
    { vertical: 20, horizontal: 0, rotate: 0, focal35: 24 },
  ]) {
    const Hm = g.homography(W, H, e);
    const rect = [[700, 400], [1300, 400], [1300, 900], [700, 900]];
    const quad = rect.map((p) => g.project(g.inv(Hm), p));
    const s = g.solveFromQuad(W, H, quad, e.focal35);
    for (const k of ['vertical', 'horizontal', 'rotate']) assert.ok(Math.abs(s[k] - e[k]) < 1e-6, `${k}: ${s[k]} vs ${e[k]}`);
    const { horizontal, vertical } = g.quadVanishingPoints(quad);
    const f = g.focal35FromVanishingPoints(W, H, horizontal, vertical);
    if (e.horizontal !== 0) assert.ok(Math.abs(f - e.focal35) < 1e-3, `focal ${f}`);
    // Corrected quad is an axis-aligned rectangle.
    const out = quad.map((p) => g.project(g.homography(W, H, s), p));
    assert.ok(Math.abs(out[0][1] - out[1][1]) < 1e-6 && Math.abs(out[0][0] - out[3][0]) < 1e-6);
  }
});

test('verticals only fixes pitch and roll, leaves yaw alone', () => {
  const e = { vertical: 18, horizontal: 0, rotate: 3, focal35: 24 };
  const Hm = g.homography(W, H, e);
  const quad = [[700, 400], [1300, 400], [1300, 900], [700, 900]].map((p) => g.project(g.inv(Hm), p));
  const { vertical } = g.quadVanishingPoints(quad);
  const s = g.solveFromVanishingPoints(W, H, null, vertical, 24);
  assert.ok(Math.abs(s.vertical - 18) < 1e-6 && Math.abs(s.rotate - 3) < 1e-6 && Math.abs(s.horizontal) < 1e-6, JSON.stringify(s));
});

test('inscribed rect fits and keeps aspect', () => {
  const e = { vertical: 15, horizontal: -10, rotate: 2, focal35: 24 };
  const poly = g.warpedOutline(W, H, g.homography(W, H, e));
  const r = g.inscribedRect(poly, W / H);
  assert.ok(Math.abs(r.w / r.h - W / H) < 1e-9);
  assert.ok(r.w > W * 0.4, `w ${r.w}`);
});

test('orderCorners', () => {
  const q = g.orderCorners([[10, 90], [90, 85], [12, 8], [95, 10]]);
  assert.deepEqual(q, [[12, 8], [95, 10], [90, 85], [10, 90]]);
});

test('lens distort/undistort round-trips and fixes barrel', () => {
  const L = g.lensModel(W, H, { lensProfile: true, distortion: 0 }, { a: 0.013, b: -0.039, c: 0.003 });
  for (const p of [[0, 0], [2000, 1333], [1500, 200], [1000, 666.5]]) {
    const q = g.distort(L, g.undistort(L, p));
    assert.ok(Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-6, `${p} → ${q}`);
  }
  // Center scale is preserved; corners move outward when undistorted (barrel fix).
  const near = g.undistort(L, [1010, 666.5]);
  assert.ok(Math.abs(near[0] - 1010) < 0.01, `center ${near}`);
  const corner = g.undistort(L, [0, 0]);
  assert.ok(corner[0] < -20 && corner[1] < -10, `corner ${corner}`);
});

test('inscribed rect handles the bowed outline after lens correction', () => {
  const e = { vertical: 5, horizontal: -5, rotate: 0, focal35: 24, lensProfile: true };
  const L = g.lensModel(W, H, e, { a: 0.013, b: -0.039, c: 0.003 });
  const poly = g.warpedOutline(W, H, g.homography(W, H, e), L);
  const r = g.inscribedRect(poly, W / H);
  assert.ok(r.w > W * 0.5, `w ${r.w}`);
  // Every rect corner maps back inside the source photo.
  const Hi = g.inv(g.homography(W, H, e));
  for (const p of [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]]) {
    const s = g.distort(L, g.project(Hi, p));
    assert.ok(s[0] >= -1 && s[0] <= W + 1 && s[1] >= -1 && s[1] <= H + 1, `${p} → ${s}`);
  }
});

test('bend cost prefers the profile only when the photo is uncorrected', () => {
  const P = { a: 0.013, b: -0.039, c: 0.003 };
  const prof = g.lensModel(W, H, { lensProfile: true }, P);
  const lines = [[[100, 60], [1900, 80]], [[80, 1270], [1920, 1260]], [[70, 100], [90, 1230]], [[1930, 90], [1910, 1240]]];
  const chainsThrough = (L) => lines.map(([a, b]) => {
    const points = [];
    for (let t = 0; t <= 1; t += 0.01) points.push(g.distort(L, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]));
    return { points, len: Math.hypot(b[0] - a[0], b[1] - a[1]) };
  });
  const raw = chainsThrough(prof);      // as the lens draws them
  const corrected = chainsThrough(null); // as a camera-corrected JPEG has them
  assert.ok(g.bendCost(raw, prof) < g.bendCost(raw, null));
  assert.ok(g.bendCost(corrected, null) < g.bendCost(corrected, prof));
});
