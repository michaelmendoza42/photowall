// The frame detector's logic on synthetic scenes: a framed painting on a
// wall, photographed through a known camera tilt. The detector must
// recover that tilt.
import { describe, expect, it } from 'vitest';
import {
  homography,
  inv,
  project,
  quadVanishingPoints,
  solveFromQuad,
  type CameraAngles,
  type Point,
} from '../../../../../shared/api/editWarp.js';
import {
  chooseFrame,
  fitVanishingPoint,
  segmentFamily,
  snapQuad,
  trustedVanishingPoint,
  type Segment,
} from '../perspective/frameDetection.js';

const W = 2000;
const H = 1333;
const F35 = 24;
const TILT: CameraAngles = { vertical: 6, horizontal: -8, rotate: 1.5 };
const toPhoto = inv(homography(W, H, TILT, F35));
const shoot = (p: Point): Point => project(toPhoto, p);

/** A segment as the detector produces it (no lens: model = photo coordinates). */
function seg(a: Point, b: Point): Segment {
  const pa = shoot(a);
  const pb = shoot(b);
  return { a: pa, b: pb, ma: pa, mb: pb, family: segmentFamily(pa, pb)!, len: Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) };
}

/** A rectangle edge broken into pieces with gaps, as Hough returns it. */
function edge(a: Point, b: Point, pieces = 3, fill = 0.8): Segment[] {
  const out: Segment[] = [];
  for (let i = 0; i < pieces; i++) {
    const t0 = i / pieces;
    const t1 = t0 + fill / pieces;
    out.push(seg([a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1]));
  }
  return out;
}

interface Rect { tl: Point; tr: Point; br: Point; bl: Point }
const rect = (x0: number, y0: number, x1: number, y1: number): Rect => ({ tl: [x0, y0], tr: [x1, y0], br: [x1, y1], bl: [x0, y1] });
const rectEdges = (r: Rect) => [...edge(r.tl, r.tr), ...edge(r.tr, r.br), ...edge(r.br, r.bl), ...edge(r.bl, r.tl)];
const corners = (r: Rect) => [r.tl, r.tr, r.br, r.bl].map(shoot);

// A canvas, and the frame's inner edge just outside it (they merge in edge maps).
const canvas = rect(400, 200, 1600, 1100);
const frameInner = rect(380, 180, 1620, 1120);
const wall = [...rectEdges(canvas), ...rectEdges(frameInner)];

function expectTilt(quad: Point[]): void {
  const solved = solveFromQuad(W, H, quad, F35);
  expect(solved.vertical).toBeCloseTo(TILT.vertical, 1);
  expect(solved.horizontal).toBeCloseTo(TILT.horizontal, 1);
  expect(solved.rotate).toBeCloseTo(TILT.rotate, 1);
}

function expectCorners(quad: Point[], expected: Point[], tol: number): void {
  quad.forEach((p, i) => expect(Math.hypot(p[0] - expected[i]![0], p[1] - expected[i]![1])).toBeLessThan(tol));
}

describe('frame detection', () => {
  it('snaps a hybrid outline (one corner on the frame, three on the canvas) back onto real edges', () => {
    const hybrid = [canvas.tl, canvas.tr, canvas.br, frameInner.bl].map(shoot);
    const before = solveFromQuad(W, H, hybrid, F35);
    expect(Math.abs(before.horizontal - TILT.horizontal) > 0.5 || Math.abs(before.rotate - TILT.rotate) > 0.5).toBe(true);
    const snapped = snapQuad(hybrid, wall, W, H)!;
    expect(snapped.snapped).toBe(4);
    expectTilt(snapped.quad);
  });

  it('snaps to the nearest edge, not the longest, so nested edges stay consistent', () => {
    const rough = rect(394, 194, 1606, 1106);
    const { quad } = snapQuad(corners(rough), wall, W, H)!;
    expectCorners(quad, corners(canvas), 2);
  });

  it('rebuilds a canvas split in two by a painted horizon', () => {
    const horizon: [Point, Point] = [[400, 520], [1600, 500]];
    const road: [Point, Point] = [[400, 650], [1600, 700]];
    const segs = [...rectEdges(canvas), ...edge(...horizon, 2, 0.9), ...edge(...road, 2, 0.9)];
    const sky = [canvas.tl, canvas.tr, horizon[1], horizon[0]].map(shoot);
    const water = [road[0], road[1], canvas.br, canvas.bl].map(shoot);
    const frame = chooseFrame([sky, water], segs, W, H)!;
    expectCorners(frame.quad, corners(canvas), 3);
    expectTilt(frame.quad);
  });

  it('with only one half of a split canvas, the answer is skewed (why recombining matters)', () => {
    const horizon: [Point, Point] = [[400, 520], [1600, 500]];
    const segs = [...rectEdges(canvas), ...edge(...horizon, 2, 0.9)];
    const sky = [canvas.tl, canvas.tr, horizon[1], horizon[0]].map(shoot);
    const half = solveFromQuad(W, H, chooseFrame([sky], segs, W, H)!.quad, F35);
    expect(Math.abs(half.horizontal - TILT.horizontal)).toBeGreaterThan(1);
  });
});

describe('line directions', () => {
  it('fits a vanishing point through outlier lines', () => {
    const verticals: Segment[] = [];
    for (let x = 300; x <= 1700; x += 140) verticals.push(seg([x, 150], [x, 1150]));
    const outliers = [seg([500, 300], [700, 1100]), seg([1500, 200], [1250, 900]), seg([900, 400], [1100, 1200])];
    const v = fitVanishingPoint([...verticals, ...outliers])!;
    const truth = quadVanishingPoints(corners(canvas)).vertical;
    const cos = Math.abs(v[0] * truth[0] + v[1] * truth[1] + v[2] * truth[2]) / (Math.hypot(...v) * Math.hypot(...truth));
    expect(cos).toBeGreaterThan(1 - 1e-6);
  });

  it('only trusts verticals when at least 5 lines mostly agree', () => {
    const clean = [300, 500, 700, 900, 1100, 1300].map((x) => seg([x, 150], [x, 1150]));
    expect(trustedVanishingPoint(clean, 'v', 0.6).vp).not.toBeNull();
    expect(trustedVanishingPoint(clean.slice(0, 4), 'v', 0.6).vp).toBeNull();
    // Half the line length leans another way (straps, people): not trusted.
    const leaning = [300, 500, 700].map((x) => seg([x, 150], [x + 250, 1150]));
    expect(trustedVanishingPoint([...clean.slice(0, 3), ...leaning], 'v', 0.6).vp).toBeNull();
  });
});
