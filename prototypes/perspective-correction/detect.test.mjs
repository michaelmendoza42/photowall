// Detector logic on synthetic scenes (no OpenCV, no browser). Each scene is
// a framed painting on a wall, photographed through a known camera tilt;
// the detector must recover that tilt.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as g from './geometry.js';
import { chooseFrame, fitVanishingPoint, snapQuad, trustedVanishingPoint } from './detect.js';

const W = 2000, H = 1333, F35 = 24;
const TILT = { vertical: 6, horizontal: -8, rotate: 1.5, focal35: F35 };
const toPhoto = g.inv(g.homography(W, H, TILT)); // straight-on wall → photo
const shoot = (p) => g.project(toPhoto, p);

/** A segment as findSegments + detect() produce it (model coords = photo coords, no lens). */
function seg(a, b) {
  const [pa, pb] = [shoot(a), shoot(b)];
  const angle = ((Math.atan2(pb[1] - pa[1], pb[0] - pa[0]) * 180) / Math.PI + 180) % 180;
  const family = angle < 30 || angle > 150 ? 'h' : angle > 60 && angle < 120 ? 'v' : null;
  const len = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
  return { a: pa, b: pb, ma: pa, mb: pb, family, len };
}

/** An edge of a rectangle, broken into pieces with gaps (as Hough returns it). */
function edge(a, b, pieces = 3, fill = 0.8) {
  const out = [];
  for (let i = 0; i < pieces; i++) {
    const t0 = i / pieces, t1 = t0 + fill / pieces;
    out.push(seg([a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1]));
  }
  return out;
}

function rect(x0, y0, x1, y1) {
  return { tl: [x0, y0], tr: [x1, y0], br: [x1, y1], bl: [x0, y1] };
}
const rectEdges = (r) => [...edge(r.tl, r.tr), ...edge(r.tr, r.br), ...edge(r.br, r.bl), ...edge(r.bl, r.tl)];

// Canvas, and the frame's inner edge just outside it (they merge in edge maps).
const canvas = rect(400, 200, 1600, 1100);
const frameInner = rect(380, 180, 1620, 1120);
const wall = [...rectEdges(canvas), ...rectEdges(frameInner)];

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
function assertTilt(params, msg) {
  for (const k of ['vertical', 'horizontal', 'rotate']) near(params[k], TILT[k], 0.15, `${msg} ${k}`);
}

test('a hybrid outline (one corner on the frame, three on the canvas) is wrong until snapped', () => {
  const hybrid = [canvas.tl, canvas.tr, canvas.br, frameInner.bl].map(shoot);
  const before = g.solveFromQuad(W, H, hybrid, F35);
  assert.ok(Math.abs(before.horizontal - TILT.horizontal) > 0.5 || Math.abs(before.rotate - TILT.rotate) > 0.5,
    `hybrid should be off: ${JSON.stringify(before)}`);
  const snapped = snapQuad(hybrid, wall, W, H);
  assert.equal(snapped.snapped, 4);
  assertTilt(g.solveFromQuad(W, H, snapped.quad, F35), 'snapped');
});

test('snapping picks the nearest edge, not the longest, so nested edges stay consistent', () => {
  // A rough outline a few px outside the canvas; the frame edge 20px out is longer.
  const rough = rect(394, 194, 1606, 1106);
  const outline = [rough.tl, rough.tr, rough.br, rough.bl].map(shoot);
  const { quad } = snapQuad(outline, wall, W, H);
  const expected = [canvas.tl, canvas.tr, canvas.br, canvas.bl].map(shoot);
  quad.forEach((p, i) => assert.ok(Math.hypot(p[0] - expected[i][0], p[1] - expected[i][1]) < 2, `corner ${i}: ${p} vs ${expected[i]}`));
});

test('a canvas split in two by a painted horizon is rebuilt from both halves', () => {
  // The painting's own strong lines: a slanted horizon and a road.
  const horizon = [[400, 520], [1600, 500]], road = [[400, 650], [1600, 700]];
  const segs = [...rectEdges(canvas), ...edge(...horizon, 2, 0.9), ...edge(...road, 2, 0.9)];
  const sky = [canvas.tl, canvas.tr, horizon[1], horizon[0]].map(shoot);
  const water = [road[0], road[1], canvas.br, canvas.bl].map(shoot);
  const { frame } = chooseFrame([sky, water], segs, W, H);
  assert.ok(frame, 'a frame is chosen');
  const expected = [canvas.tl, canvas.tr, canvas.br, canvas.bl].map(shoot);
  frame.quad.forEach((p, i) => assert.ok(Math.hypot(p[0] - expected[i][0], p[1] - expected[i][1]) < 3, `corner ${i}: ${p} vs ${expected[i]}`));
  assertTilt(g.solveFromQuad(W, H, frame.quad, F35), 'rebuilt');
});

test('with only one half of a split canvas, the result is skewed (why recombining matters)', () => {
  const horizon = [[400, 520], [1600, 500]];
  const segs = [...rectEdges(canvas), ...edge(...horizon, 2, 0.9)];
  const sky = [canvas.tl, canvas.tr, horizon[1], horizon[0]].map(shoot);
  // The horizon is a real straight line, so snapping keeps it as the "bottom".
  const half = g.solveFromQuad(W, H, chooseFrame([sky], segs, W, H).frame.quad, F35);
  assert.ok(Math.abs(half.horizontal - TILT.horizontal) > 1, `half alone: ${JSON.stringify(half)}`);
});

test('vanishing point fit ignores outlier lines', () => {
  const verticals = [];
  for (let x = 300; x <= 1700; x += 140) verticals.push(seg([x, 150], [x, 1150]));
  const outliers = [seg([500, 300], [700, 1100]), seg([1500, 200], [1250, 900]), seg([900, 400], [1100, 1200])];
  const v = fitVanishingPoint([...verticals, ...outliers]);
  const truth = g.quadVanishingPoints([canvas.tl, canvas.tr, canvas.br, canvas.bl].map(shoot)).vertical;
  // Same point: compare as directions (both may be near infinity).
  const cos = Math.abs(v[0] * truth[0] + v[1] * truth[1] + v[2] * truth[2]) / (Math.hypot(...v) * Math.hypot(...truth));
  assert.ok(cos > 1 - 1e-6, `cos ${cos}`);
});

test('verticals are only trusted when at least 5 lines mostly agree', () => {
  const clean = [300, 500, 700, 900, 1100, 1300].map((x) => seg([x, 150], [x, 1150]));
  assert.ok(trustedVanishingPoint(clean, 'v', 0.6).vp, 'six agreeing lines');
  assert.equal(trustedVanishingPoint(clean.slice(0, 4), 'v', 0.6).vp, null, 'too few lines');
  // Half the line length leans the other way (straps, people): not trusted.
  const leaning = [300, 500, 700].map((x) => seg([x, 150], [x + 250, 1150]));
  assert.equal(trustedVanishingPoint([...clean.slice(0, 3), ...leaning], 'v', 0.6).vp, null, 'split vote');
});
