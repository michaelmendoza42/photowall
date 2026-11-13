// Perspective and lens correction for light edits, shared by the editor
// preview and the server render so both draw the same photo.
//
// The photo (after its quarter turn) is re-projected through a virtually
// rotated camera with the same lens:
//
//   H = K · R · K⁻¹,   R = Rz(straighten) · Rx(vertical) · Ry(horizontal)
//
// K is the lens: focal length from the 35mm-equivalent focal length, the
// principal point at the photo's center. Lens distortion (a k·r² term) is
// removed first, so perspective works on straight lines. The warped photo
// is then zoomed so its largest rectangle with the photo's own shape fills
// the frame, with no blank corners; crops are fractions of that frame, as
// before. With only straighten set this is exactly the old rotate-and-cover.

import type { PhotoEdit } from './edits.js';

export type Point = [number, number];
type Vec3 = [number, number, number];
/** 3×3 matrix, row-major. */
export type Mat3 = number[];

const DEG = Math.PI / 180;
const FULL_FRAME_DIAGONAL_MM = 43.2666;
/** Focal length assumed when the photo doesn't say (a typical phone or kit-zoom wide end). */
export const DEFAULT_FOCAL35 = 28;

/** True when the edit uses perspective or lens correction (a missing field, from an older recipe, counts as off). */
export function hasWarp(edit: PhotoEdit): boolean {
  return Boolean(edit.perspectiveVertical || edit.perspectiveHorizontal || edit.lensDistortion);
}

// ---- 3×3 matrices --------------------------------------------------------

export function mul(a: Mat3, b: Mat3): Mat3 {
  const o = new Array<number>(9);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      o[r * 3 + c] = a[r * 3]! * b[c]! + a[r * 3 + 1]! * b[3 + c]! + a[r * 3 + 2]! * b[6 + c]!;
  return o;
}

export function inv(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m as [number, number, number, number, number, number, number, number, number];
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    A / det, -(b * i - c * h) / det, (b * f - c * e) / det,
    B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
    C / det, -(a * h - b * g) / det, (a * e - b * d) / det,
  ];
}

function apply(m: Mat3, [x, y, w]: Vec3): Vec3 {
  return [
    m[0]! * x + m[1]! * y + m[2]! * w,
    m[3]! * x + m[4]! * y + m[5]! * w,
    m[6]! * x + m[7]! * y + m[8]! * w,
  ];
}

export function project(m: Mat3, [x, y]: Point): Point {
  const [px, py, pw] = apply(m, [x, y, 1]);
  return [px / pw, py / pw];
}

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a);
  return [a[0] / l, a[1] / l, a[2] / l];
};
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];

// ---- Lens ----------------------------------------------------------------

export function focalPx(width: number, height: number, focal35: number): number {
  return (focal35 / FULL_FRAME_DIAGONAL_MM) * Math.hypot(width, height);
}

export function focal35FromPx(width: number, height: number, f: number): number {
  return (f / Math.hypot(width, height)) * FULL_FRAME_DIAGONAL_MM;
}

function intrinsics(width: number, height: number, f: number): Mat3 {
  return [f, 0, width / 2, 0, f, height / 2, 0, 0, 1];
}

/**
 * Radial lens model about the photo's center: r_d = r · (1 + k·r²), with
 * r = 1 at half the short side. Positive `lensDistortion` fixes barrel
 * (100 ≈ 2% at the short side's edge).
 */
export interface LensModel {
  cx: number;
  cy: number;
  R: number;
  k: number;
}

export function lensModel(width: number, height: number, lensDistortion: number): LensModel | null {
  if (lensDistortion === 0) return null;
  return { cx: width / 2, cy: height / 2, R: Math.min(width, height) / 2, k: -lensDistortion / 5000 };
}

/** Undistorted (model) pixel → pixel in the photo as shot. */
export function distort(L: LensModel | null, [x, y]: Point): Point {
  if (!L) return [x, y];
  const ux = (x - L.cx) / L.R;
  const uy = (y - L.cy) / L.R;
  const f = 1 + L.k * (ux * ux + uy * uy);
  return [L.cx + ux * f * L.R, L.cy + uy * f * L.R];
}

/** Pixel in the photo as shot → undistorted (model) pixel, by Newton's method. */
export function undistort(L: LensModel | null, [x, y]: Point): Point {
  if (!L) return [x, y];
  const dx = (x - L.cx) / L.R;
  const dy = (y - L.cy) / L.R;
  const rd = Math.hypot(dx, dy);
  if (rd < 1e-12) return [x, y];
  // Solve r + k·r³ = rd.
  let r = rd;
  for (let i = 0; i < 30; i++) {
    const step = (r + L.k * r * r * r - rd) / (1 + 3 * L.k * r * r);
    r -= step;
    if (Math.abs(step) < 1e-12) break;
  }
  const s = r / rd;
  return [L.cx + dx * s * L.R, L.cy + dy * s * L.R];
}

// ---- Sliders ⇄ rotation --------------------------------------------------

export interface CameraAngles {
  /** Perspective vertical (pitch), degrees. */
  vertical: number;
  /** Perspective horizontal (yaw), degrees. */
  horizontal: number;
  /** Straighten (roll), degrees clockwise. */
  rotate: number;
}

export function rotation({ vertical, horizontal, rotate }: CameraAngles): Mat3 {
  const a = vertical * DEG;
  const b = horizontal * DEG;
  const g = rotate * DEG;
  const Rx = [1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)];
  const Ry = [Math.cos(b), 0, Math.sin(b), 0, 1, 0, -Math.sin(b), 0, Math.cos(b)];
  const Rz = [Math.cos(g), -Math.sin(g), 0, Math.sin(g), Math.cos(g), 0, 0, 0, 1];
  return mul(Rz, mul(Rx, Ry));
}

export function anglesFromRotation(R: Mat3): CameraAngles {
  return {
    vertical: Math.asin(Math.max(-1, Math.min(1, R[7]!))) / DEG,
    horizontal: Math.atan2(-R[6]!, R[8]!) / DEG,
    rotate: Math.atan2(-R[1]!, R[4]!) / DEG,
  };
}

/** Turned-photo pixel (undistorted) → warped pixel, same pixel frame. */
export function homography(width: number, height: number, angles: CameraAngles, focal35: number): Mat3 {
  const K = intrinsics(width, height, focalPx(width, height, focal35));
  return mul(K, mul(rotation(angles), inv(K)));
}

// ---- Vanishing points → sliders ------------------------------------------

/** Homogeneous line through two points. */
export function lineThrough(p: Point, q: Point): Vec3 {
  return cross([p[0], p[1], 1], [q[0], q[1], 1]);
}

/** Vanishing points of a quad's edge pairs (corners top-left, top-right, bottom-right, bottom-left). */
export function quadVanishingPoints([tl, tr, br, bl]: Point[]): { horizontal: Vec3; vertical: Vec3 } {
  return {
    horizontal: norm(cross(lineThrough(tl!, tr!), lineThrough(bl!, br!))),
    vertical: norm(cross(lineThrough(tl!, bl!), lineThrough(tr!, br!))),
  };
}

/**
 * Focal length (35mm-equivalent) implied by vanishing points of two
 * orthogonal directions, or null when they don't pin it down.
 */
export function focal35FromVanishingPoints(width: number, height: number, v1: Vec3, v2: Vec3): number | null {
  const cx = width / 2;
  const cy = height / 2;
  const diag = Math.hypot(width, height);
  const finite = (v: Vec3) => Math.abs(v[2]) > 1e-12 && Math.hypot(v[0] / v[2] - cx, v[1] / v[2] - cy) < 12 * diag;
  if (!finite(v1) || !finite(v2)) return null;
  const a = [v1[0] / v1[2] - cx, v1[1] / v1[2] - cy] as const;
  const b = [v2[0] / v2[2] - cx, v2[1] / v2[2] - cy] as const;
  const f2 = -(a[0] * b[0] + a[1] * b[1]);
  if (!(f2 > 0)) return null;
  const f35 = focal35FromPx(width, height, Math.sqrt(f2));
  return f35 >= 12 && f35 <= 200 ? f35 : null;
}

/**
 * Angles that make the given vanishing directions horizontal and vertical.
 * Either may be null: only verticals fixes pitch and roll; only
 * horizontals fixes yaw and roll.
 */
export function solveFromVanishingPoints(
  width: number,
  height: number,
  vpH: Vec3 | null,
  vpV: Vec3 | null,
  focal35: number,
): CameraAngles {
  const Kinv = inv(intrinsics(width, height, focalPx(width, height, focal35)));
  const dir = (v: Vec3, axis: 0 | 1): Vec3 => {
    const d = norm(apply(Kinv, v));
    return d[axis] < 0 ? scale(d, -1) : d;
  };
  let d1 = vpH ? dir(vpH, 0) : null;
  let d2 = vpV ? dir(vpV, 1) : null;
  if (!d1 && !d2) return { vertical: 0, horizontal: 0, rotate: 0 };
  // Missing direction: the image axis, made orthogonal to the known one.
  if (!d1) d1 = norm(sub([1, 0, 0], scale(d2!, d2![0])));
  if (!d2) d2 = norm(sub([0, 1, 0], scale(d1, d1[1])));
  // Symmetric orthogonalization, so neither direction is favored.
  const u = norm(add(d1, d2));
  const w = norm(sub(d1, d2));
  const r1 = scale(add(u, w), Math.SQRT1_2);
  const r2 = scale(sub(u, w), Math.SQRT1_2);
  return anglesFromRotation([...r1, ...r2, ...cross(r1, r2)]);
}

/** Angles that turn a photographed rectangle back into a rectangle. */
export function solveFromQuad(width: number, height: number, quad: Point[], focal35: number): CameraAngles {
  const { horizontal, vertical } = quadVanishingPoints(quad);
  return solveFromVanishingPoints(width, height, horizontal, vertical, focal35);
}

/** Order four points as top-left, top-right, bottom-right, bottom-left. */
export function orderCorners(pts: Point[]): Point[] {
  const c: Point = [0, 0];
  for (const p of pts) {
    c[0] += p[0] / pts.length;
    c[1] += p[1] / pts.length;
  }
  const sorted = [...pts].sort((a, b) => Math.atan2(a[1] - c[1], a[0] - c[0]) - Math.atan2(b[1] - c[1], b[0] - c[0]));
  let start = 0;
  sorted.forEach((p, i) => {
    if (p[0] + p[1] < sorted[start]![0] + sorted[start]![1]) start = i;
  });
  return [0, 1, 2, 3].map((k) => sorted[(start + k) % 4]!);
}

// ---- Output geometry -----------------------------------------------------

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Outline of the warped photo. Clips where the outline would pass behind
 * the virtual camera, so extreme angles still give a finite polygon.
 */
export function warpedOutline(width: number, height: number, H: Mat3, L: LensModel | null, samplesPerEdge = 24): Point[] {
  const pts: Vec3[] = [];
  const corners: Point[] = [[0, 0], [width, 0], [width, height], [0, height]];
  for (let i = 0; i < 4; i++) {
    const a = corners[i]!;
    const b = corners[(i + 1) % 4]!;
    for (let k = 0; k < samplesPerEdge; k++) {
      const t = k / samplesPerEdge;
      const m = undistort(L, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      pts.push(apply(H, [m[0], m[1], 1]));
    }
  }
  const minW = 1e-3;
  const out: Point[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    if (p[2] > minW) out.push([p[0] / p[2], p[1] / p[2]]);
    if (p[2] > minW !== q[2] > minW) {
      const r = add(p, scale(sub(q, p), (minW - p[2]) / (q[2] - p[2])));
      out.push([r[0] / r[2], r[1] / r[2]]);
    }
  }
  return out;
}

export function bounds(poly: Point[]): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Ray-casting point-in-polygon (lens correction makes the outline non-convex). */
function insidePolygon(poly: Point[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Largest rectangle of the given aspect (w/h) inside the outline, so no
 * blank corners show after the warp. The outline is densely sampled, so
 * "corners inside and no outline vertex inside the rect" is a sound test
 * even where it isn't convex.
 */
export function inscribedRect(poly: Point[], aspect: number): Rect {
  const fits = (cx: number, cy: number, h: number) => {
    const w = h * aspect;
    const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
    const corners: Point[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    if (!corners.every(([x, y]) => insidePolygon(poly, x, y))) return false;
    return !poly.some(([x, y]) => x > x0 && x < x1 && y > y0 && y < y1);
  };
  const box = bounds(poly);
  const maxH = (cx: number, cy: number) => {
    if (!insidePolygon(poly, cx, cy)) return 0;
    let lo = 0;
    let hi = Math.min(box.h, box.w / aspect);
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (fits(cx, cy, mid)) lo = mid;
      else hi = mid;
    }
    return lo;
  };
  let cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  let cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  let best = maxH(cx, cy);
  for (let step = Math.max(box.w, box.h) / 8; step > 0.25; step /= 2) {
    let moved = true;
    while (moved) {
      moved = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const h = maxH(cx + dx * step, cy + dy * step);
        if (h > best + 1e-6) {
          best = h;
          cx += dx * step;
          cy += dy * step;
          moved = true;
        }
      }
    }
  }
  return { x: cx - (best * aspect) / 2, y: cy - best / 2, w: best * aspect, h: best };
}

// ---- Turned photo ⇄ frame ------------------------------------------------

/**
 * How the turned photo (`width` × `height` px, after its quarter turn,
 * before mirroring) maps onto the editor's frame: the `width` × `height`
 * rectangle that crops are fractions of. Mirroring happens after this, in
 * frame space.
 */
export interface FrameWarp {
  /** Turned-photo pixel → frame pixel (0..width, 0..height). */
  toFrame(p: Point): Point;
  /** Frame pixel → turned-photo pixel. */
  fromFrame(p: Point): Point;
}

export function frameWarp(width: number, height: number, edit: PhotoEdit): FrameWarp {
  const cx = width / 2;
  const cy = height / 2;
  if (!hasWarp(edit)) {
    // Rotate about the center, zoomed just enough to cover the frame.
    const t = edit.straighten * DEG;
    const cos = Math.cos(t), sin = Math.sin(t);
    const k = straightenCoverOf(width, height, edit.straighten);
    return {
      toFrame: ([x, y]) => {
        const dx = x - cx, dy = y - cy;
        return [cx + k * (cos * dx - sin * dy), cy + k * (sin * dx + cos * dy)];
      },
      fromFrame: ([x, y]) => {
        const dx = (x - cx) / k, dy = (y - cy) / k;
        return [cx + cos * dx + sin * dy, cy - sin * dx + cos * dy];
      },
    };
  }
  const angles = { vertical: edit.perspectiveVertical, horizontal: edit.perspectiveHorizontal, rotate: edit.straighten };
  const H = homography(width, height, angles, edit.focal35);
  const Hinv = inv(H);
  const L = lensModel(width, height, edit.lensDistortion);
  const win = inscribedRect(warpedOutline(width, height, H, L), width / height);
  const s = width / win.w;
  return {
    toFrame: (p) => {
      const [x, y] = project(H, undistort(L, p));
      return [(x - win.x) * s, (y - win.y) * s];
    },
    fromFrame: ([x, y]) => distort(L, project(Hinv, [win.x + x / s, win.y + y / s])),
  };
}

/** Same as edits.ts `straightenCover`; repeated here to avoid an import cycle. */
function straightenCoverOf(width: number, height: number, degrees: number): number {
  const t = Math.abs(degrees) * DEG;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  return Math.max((width * cos + height * sin) / width, (width * sin + height * cos) / height);
}

/** Frame pixel → turned-photo pixel, including the edit's mirroring. */
export function frameToTurned(warp: FrameWarp, width: number, height: number, edit: PhotoEdit, [x, y]: Point): Point {
  return warp.fromFrame([edit.flipX ? width - x : x, edit.flipY ? height - y : y]);
}

/** Turned-photo pixel → frame pixel, including the edit's mirroring. */
export function turnedToFrame(warp: FrameWarp, width: number, height: number, edit: PhotoEdit, p: Point): Point {
  const [x, y] = warp.toFrame(p);
  return [edit.flipX ? width - x : x, edit.flipY ? height - y : y];
}

/** Original-photo pixel → turned-photo pixel for a clockwise quarter turn. */
export function turnPoint(width: number, height: number, rotation: 0 | 90 | 180 | 270, [x, y]: Point): Point {
  switch (rotation) {
    case 90:
      return [height - y, x];
    case 180:
      return [width - x, height - y];
    case 270:
      return [y, width - x];
    default:
      return [x, y];
  }
}
