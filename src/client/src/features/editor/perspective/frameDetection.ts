// Picking a photographed picture frame, and line directions, from detected
// edges. Pure (no OpenCV), so it is unit-tested on synthetic scenes.
//
// All reasoning happens in "model" coordinates: the turned photo with lens
// distortion removed. Segments carry both their position as shot (a, b)
// and in model space (ma, mb).

import {
  lineThrough,
  orderCorners,
  quadVanishingPoints,
  type Point,
} from '../../../../../shared/api/editWarp.js';

type Line = [number, number, number];

export interface Segment {
  a: Point;
  b: Point;
  ma: Point;
  mb: Point;
  /** Near-horizontal or near-vertical. */
  family: 'h' | 'v';
  len: number;
}

export interface FrameCandidate {
  /** Corners in model space: top-left, top-right, bottom-right, bottom-left. */
  quad: Point[];
  /** Sides moved onto a detected edge. */
  snapped: number;
  /** Side lines: top, right, bottom, left. */
  lines: Line[];
}

export interface ChosenFrame extends FrameCandidate {
  /** Share of the photo's line length that agrees with the frame's perspective. */
  support: number;
  score: number;
}

/** Near-horizontal (within 30°) or near-vertical segments; anything else is dropped. */
export function segmentFamily(a: Point, b: Point): 'h' | 'v' | null {
  const angle = (((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI) % 180 + 180) % 180;
  return angle < 30 || angle > 150 ? 'h' : angle > 60 && angle < 120 ? 'v' : null;
}

/**
 * Pick the frame from outline quads (model space): snap their sides onto
 * real edges, add recombinations of those sides, and rank by perspective
 * agreement and size.
 *
 * Snapping fixes outlines that merge a frame's inner and outer edges into
 * a hybrid with one side cutting diagonally between them. Recombining
 * rebuilds a canvas that a painting's own strong line (a horizon, a road)
 * split into two partial rectangles. Ranking by how many of the photo's
 * lines agree with a candidate's perspective rejects quads traced from
 * shapes inside a painting; size breaks ties toward the outer frame.
 */
export function chooseFrame(outlineQuads: Point[][], segs: Segment[], W: number, H: number): ChosenFrame | null {
  const S = Math.max(W, H);
  const snapped = outlineQuads.map((q) => snapQuad(q, segs, W, H)).filter((c): c is FrameCandidate => c !== null);
  const candidates = [...snapped, ...recombine(snapped, W, H)].filter((c) => quadQuality(c.quad, W, H, S * 0.008) > 0);
  let best: ChosenFrame | null = null;
  for (const c of candidates) {
    const support = supportOf(c.quad, segs);
    const score = quadQuality(c.quad, W, H, S * 0.008) * Math.sqrt(polygonArea(c.quad) / (W * H)) * support * support;
    if (support > 0.2 && (!best || score > best.score)) best = { ...c, support, score };
  }
  return best;
}

/**
 * Snap each side of a model-space quad onto the strongest nearby straight
 * edge: collinear segments within a band around the side, nearly parallel,
 * overlapping it. Groups are ranked by length discounted by distance, so
 * nested edges (canvas vs frame) are chosen consistently around the quad.
 */
export function snapQuad(quad: Point[], segs: Segment[], W: number, H: number): FrameCandidate | null {
  const S = Math.max(W, H);
  const band = S * 0.03;
  const tol = S * 0.004;
  let snapped = 0;
  const lines = [0, 1, 2, 3].map((i): Line => {
    const a = quad[i]!;
    const b = quad[(i + 1) % 4]!;
    const family = i % 2 === 0 ? 'h' : 'v';
    const l0 = unitLine(lineThrough(a, b));
    const len2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
    const t = (p: Point) => ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / len2;
    const near = segs.filter((s) => {
      if (s.family !== family || !onLine(s, l0, band, 4)) return false;
      const t0 = Math.min(t(s.ma), t(s.mb));
      const t1 = Math.max(t(s.ma), t(s.mb));
      return t1 > 0 && t0 < 1;
    });
    const groups: { line: Line; segs: Segment[]; len: number }[] = [];
    for (const s of near.sort((p, q) => q.len - p.len)) {
      const g = groups.find((group) => onLine(s, group.line, tol, 1.5));
      if (g) {
        g.segs.push(s);
        g.len += s.len;
      } else {
        groups.push({ line: unitLine(lineThrough(s.ma, s.mb)), segs: [s], len: s.len });
      }
    }
    const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const rank = (g: { line: Line; len: number }) =>
      g.len / (1 + Math.abs(g.line[0] * mid[0] + g.line[1] * mid[1] + g.line[2]) / (S * 0.005));
    const best = groups.sort((p, q) => rank(q) - rank(p))[0];
    if (!best || best.len < Math.sqrt(len2) * 0.2) return l0;
    snapped++;
    return fitLine(best.segs.flatMap((s): [Point, number][] => [[s.ma, s.len], [s.mb, s.len]]));
  });
  // Corner i is where side i-1 meets side i.
  const out = [0, 1, 2, 3].map((i) => meet(lines[(i + 3) % 4]!, lines[i]!));
  return out.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])) ? { quad: out, snapped, lines } : null;
}

/** New candidates from every combination of the candidates' snapped sides. */
export function recombine(cands: FrameCandidate[], W: number, H: number): FrameCandidate[] {
  const tol = Math.max(W, H) * 0.004;
  const pick = (k: number): Line[] => {
    const unique: Line[] = [];
    for (const c of cands) {
      const l = c.lines[k]!;
      const same = unique.some(
        (u) => Math.abs(u[0] * l[0] + u[1] * l[1]) > Math.cos(Math.PI / 180) && Math.abs(Math.abs(u[2]) - Math.abs(l[2])) < tol,
      );
      if (!same) unique.push(l);
    }
    return unique.slice(0, 8);
  };
  const [tops, rights, bottoms, lefts] = [pick(0), pick(1), pick(2), pick(3)];
  const out: FrameCandidate[] = [];
  for (const top of tops)
    for (const right of rights)
      for (const bottom of bottoms)
        for (const left of lefts) {
          const q = [meet(left, top), meet(top, right), meet(right, bottom), meet(bottom, left)];
          if (!q.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))) continue;
          const [tl, tr, br, bl] = q as [Point, Point, Point, Point];
          // Keep only properly ordered quads: top above bottom, left of right.
          if (tl[1] < bl[1] && tr[1] < br[1] && tl[0] < tr[0] && bl[0] < br[0])
            out.push({ quad: q, snapped: 4, lines: [top, right, bottom, left] });
        }
  return out;
}

/** 0 when the quad can't be a photographed rectangle, else a 0..1 fit. */
export function quadQuality(q: Point[], w: number, h: number, margin: number): number {
  if (q.some(([x, y]) => x < margin || y < margin || x > w - margin || y > h - margin)) return 0;
  let worst = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[(i + 3) % 4]!;
    const b = q[i]!;
    const c = q[(i + 1) % 4]!;
    const u = [a[0] - b[0], a[1] - b[1]] as const;
    const v = [c[0] - b[0], c[1] - b[1]] as const;
    const cos = (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v));
    const angle = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
    if (angle < 60 || angle > 120) return 0;
    worst = Math.max(worst, Math.abs(angle - 90));
  }
  const side = (i: number) => Math.hypot(q[i]![0] - q[(i + 1) % 4]![0], q[i]![1] - q[(i + 1) % 4]![1]);
  const r1 = side(0) / side(2);
  const r2 = side(1) / side(3);
  if (r1 < 0.5 || r1 > 2 || r2 < 0.5 || r2 > 2) return 0;
  // Top and bottom must be the near-horizontal pair.
  if (Math.abs(q[1]![1] - q[0]![1]) > Math.abs(q[1]![0] - q[0]![0])) return 0;
  return 1 - worst / 60;
}

/** Order a simplified outline's four points into a quad. */
export function quadFromPoints(pts: Point[]): Point[] {
  return orderCorners(pts);
}

/** Share of line length (per family, averaged) that agrees with the quad's perspective. */
function supportOf(quad: Point[], segs: Segment[]): number {
  const vp = quadVanishingPoints(quad);
  const total = { h: 0, v: 0 };
  const agree = { h: 0, v: 0 };
  for (const s of segs) {
    total[s.family] += s.len;
    if (agrees(s, s.family === 'h' ? vp.horizontal : vp.vertical, 1.2)) agree[s.family] += s.len;
  }
  const frac = (f: 'h' | 'v') => (total[f] ? agree[f] / total[f] : 0);
  return (frac('h') + frac('v')) / 2;
}

/** Does the segment (model space) point at vanishing point v, within maxDeg? */
function agrees(s: Segment, v: Line, maxDeg: number): boolean {
  const m: Point = [(s.ma[0] + s.mb[0]) / 2, (s.ma[1] + s.mb[1]) / 2];
  const d = Math.abs(v[2]) < 1e-12 ? [v[0], v[1]] : [v[0] / v[2] - m[0], v[1] / v[2] - m[1]];
  const u = [s.mb[0] - s.ma[0], s.mb[1] - s.ma[1]];
  const sin = Math.abs(u[0]! * d[1]! - u[1]! * d[0]!) / (Math.hypot(u[0]!, u[1]!) * Math.hypot(d[0]!, d[1]!));
  return sin < Math.sin((maxDeg * Math.PI) / 180);
}

/**
 * Vanishing point of a family of segments: RANSAC over pairs, then a
 * weighted least-squares refinement (the point minimizing Σ len·(l·v)²
 * over inlier lines).
 */
export function fitVanishingPoint(input: Segment[], maxDeg = 1.5): Line | null {
  if (input.length < 2) return null;
  const segs = [...input].sort((p, q) => q.len - p.len).slice(0, 60);
  const lines = segs.map((s) => unitLine(lineThrough(s.ma, s.mb)));
  const inliers = (v: Line) => segs.map((s, i) => (agrees(s, v, maxDeg) ? i : -1)).filter((i) => i >= 0);
  let best: number[] | null = null;
  let bestScore = 0;
  for (let i = 0; i < lines.length; i++)
    for (let j = i + 1; j < lines.length; j++) {
      const v = cross(lines[i]!, lines[j]!);
      const n = Math.hypot(...v);
      if (n < 1e-12) continue;
      const ids = inliers([v[0] / n, v[1] / n, v[2] / n]);
      const score = ids.reduce((sum, k) => sum + segs[k]!.len, 0);
      if (score > bestScore) {
        bestScore = score;
        best = ids;
      }
    }
  if (!best || best.length < 2) return null;
  const M = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const k of best) {
    const l = lines[k]!;
    const w = segs[k]!.len;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) M[r * 3 + c]! += w * l[r]! * l[c]!;
  }
  return smallestEigenvector(M);
}

/**
 * A family's vanishing point, trusted only when at least 5 lines and
 * `minShare` of the family's line length agree on it (people, straps and
 * furniture make stray "verticals").
 */
export function trustedVanishingPoint(segs: Segment[], family: 'h' | 'v', minShare: number): { vp: Line | null; share: number } {
  const fs = segs.filter((s) => s.family === family);
  const fit = fs.length >= 5 ? fitVanishingPoint(fs) : null;
  if (!fit) return { vp: null, share: 0 };
  const inliers = fs.filter((s) => agrees(s, fit, 1.5));
  const share = inliers.reduce((t, s) => t + s.len, 0) / fs.reduce((t, s) => t + s.len, 0);
  return { vp: inliers.length >= 5 && share >= minShare ? fit : null, share };
}

const cross = (a: Line, b: Line): Line => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function unitLine(l: Line): Line {
  const n = Math.hypot(l[0], l[1]);
  return [l[0] / n, l[1] / n, l[2] / n];
}

function meet(l1: Line, l2: Line): Point {
  const v = cross(l1, l2);
  return [v[0] / v[2], v[1] / v[2]];
}

/** Is segment s (model space) on line l: both ends within tol and parallel within maxDeg? */
function onLine(s: Segment, l: Line, tol: number, maxDeg: number): boolean {
  const d = (p: Point) => Math.abs(l[0] * p[0] + l[1] * p[1] + l[2]);
  if (d(s.ma) > tol || d(s.mb) > tol) return false;
  const u = [s.mb[0] - s.ma[0], s.mb[1] - s.ma[1]] as const;
  return Math.abs(u[0] * l[0] + u[1] * l[1]) / Math.hypot(u[0], u[1]) < Math.sin((maxDeg * Math.PI) / 180);
}

/** Weighted total-least-squares line through [point, weight] pairs. */
function fitLine(pw: [Point, number][]): Line {
  let sw = 0, mx = 0, my = 0;
  for (const [[x, y], w] of pw) {
    sw += w;
    mx += w * x;
    my += w * y;
  }
  mx /= sw;
  my /= sw;
  let sxx = 0, syy = 0, sxy = 0;
  for (const [[x, y], w] of pw) {
    sxx += w * (x - mx) ** 2;
    syy += w * (y - my) ** 2;
    sxy += w * (x - mx) * (y - my);
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const n = [-Math.sin(angle), Math.cos(angle)] as const;
  return [n[0], n[1], -(n[0] * mx + n[1] * my)];
}

function polygonArea(q: Point[]): number {
  let a = 0;
  for (let i = 0; i < q.length; i++) {
    const p = q[i]!;
    const r = q[(i + 1) % q.length]!;
    a += p[0] * r[1] - r[0] * p[1];
  }
  return Math.abs(a) / 2;
}

/** Jacobi eigen-decomposition of a symmetric 3×3; the eigenvector of the smallest eigenvalue. */
function smallestEigenvector(A: number[]): Line {
  const a = [[A[0]!, A[1]!, A[2]!], [A[3]!, A[4]!, A[5]!], [A[6]!, A[7]!, A[8]!]];
  const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const at = (m: number[][], r: number, c: number) => m[r]![c]!;
  const set = (m: number[][], r: number, c: number, v: number) => {
    m[r]![c] = v;
  };
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) off += at(a, p, q) ** 2;
    if (off < 1e-20) break;
    for (let p = 0; p < 3; p++)
      for (let q = p + 1; q < 3; q++) {
        if (Math.abs(at(a, p, q)) < 1e-30) continue;
        const theta = (at(a, q, q) - at(a, p, p)) / (2 * at(a, p, q));
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < 3; k++) {
          const akp = at(a, k, p), akq = at(a, k, q);
          set(a, k, p, c * akp - s * akq);
          set(a, k, q, s * akp + c * akq);
        }
        for (let k = 0; k < 3; k++) {
          const apk = at(a, p, k), aqk = at(a, q, k);
          set(a, p, k, c * apk - s * aqk);
          set(a, q, k, s * apk + c * aqk);
        }
        for (let k = 0; k < 3; k++) {
          const vkp = at(V, k, p), vkq = at(V, k, q);
          set(V, k, p, c * vkp - s * vkq);
          set(V, k, q, s * vkp + c * vkq);
        }
      }
  }
  let m = 0;
  for (let i = 1; i < 3; i++) if (at(a, i, i) < at(a, m, m)) m = i;
  return [at(V, 0, m), at(V, 1, m), at(V, 2, m)];
}
