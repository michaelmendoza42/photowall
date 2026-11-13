// Perspective correction as a camera model: the photo is re-projected
// through a virtually rotated camera with the same lens.
//
//   H = K · R · K⁻¹      (input pixel → output pixel)
//
// K is the lens (focal length in pixels, principal point at the center) and
// R = Rz(rotate) · Rx(vertical) · Ry(horizontal). Lens distortion is
// removed first, so perspective works on a "model" image with straight
// lines. The full lookup for an output pixel is
//
//   output → H⁻¹ → model (undistorted) pixel → distort → source pixel
//
// Pure functions only, so the same math can later run server-side.

const DEG = Math.PI / 180;
const FULL_FRAME_DIAGONAL_MM = 43.2666;

// ---- 3×3 matrices, row-major arrays of 9 --------------------------------

export function mul(a, b) {
  const o = new Array(9);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return o;
}

export function inv(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    A / det, -(b * i - c * h) / det, (b * f - c * e) / det,
    B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
    C / det, -(a * h - b * g) / det, (a * e - b * d) / det,
  ];
}

export function transpose(m) {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

export function apply(m, [x, y, w = 1]) {
  return [
    m[0] * x + m[1] * y + m[2] * w,
    m[3] * x + m[4] * y + m[5] * w,
    m[6] * x + m[7] * y + m[8] * w,
  ];
}

export function project(m, p) {
  const [x, y, w] = apply(m, p);
  return [x / w, y / w];
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); };
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const scale = (a, s) => a.map((v) => v * s);

// ---- Lens ----------------------------------------------------------------

export function focalPx(width, height, focal35) {
  return (focal35 / FULL_FRAME_DIAGONAL_MM) * Math.hypot(width, height);
}

export function focal35FromPx(width, height, f) {
  return (f / Math.hypot(width, height)) * FULL_FRAME_DIAGONAL_MM;
}

function intrinsics(width, height, f) {
  return [f, 0, width / 2, 0, f, height / 2, 0, 0, 1];
}

// ---- Lens distortion ------------------------------------------------------
//
// Lensfun's "ptlens" model in Hugin units (r = 1 at half the short side):
//   r_d = r_u · (a·r_u³ + b·r_u² + c·r_u + d),  d = 1 − a − b − c
// rescaled the way Lensfun does it, so the image center keeps its scale
// and the focal length stays valid for the perspective step. A manual
// "distortion" amount adds a k·r² term on top (positive fixes barrel;
// 100 ≈ 2% at the short-side edge, enough for a camera JPEG's leftovers).

/** Lens parameters for an edit, or null when nothing applies. */
export function lensModel(width, height, edit, profile) {
  const on = Boolean(profile && edit.lensProfile);
  const a = on ? profile.a : 0, b = on ? profile.b : 0, c = on ? profile.c : 0;
  const k = -(edit.distortion || 0) / 5000;
  if (!a && !b && !c && !k) return null;
  return { cx: width / 2, cy: height / 2, R: Math.min(width, height) / 2, a, b, c, d: 1 - a - b - c, k };
}

/** r_d / r for an undistorted normalized radius r. */
export function distortionFactor(L, r) {
  const ru = r / L.d;
  return ((L.a * ru ** 3 + L.b * ru ** 2 + L.c * ru + L.d) / L.d) * (1 + L.k * r * r);
}

/** Model (undistorted) pixel → source pixel. */
export function distort(L, [x, y]) {
  if (!L) return [x, y];
  const ux = (x - L.cx) / L.R, uy = (y - L.cy) / L.R;
  const f = distortionFactor(L, Math.hypot(ux, uy));
  return [L.cx + ux * f * L.R, L.cy + uy * f * L.R];
}

/** Source pixel → model (undistorted) pixel, by Newton's method. */
export function undistort(L, [x, y]) {
  if (!L) return [x, y];
  const dx = (x - L.cx) / L.R, dy = (y - L.cy) / L.R;
  const rd = Math.hypot(dx, dy);
  if (rd < 1e-12) return [x, y];
  const g = (r) => r * distortionFactor(L, r) - rd;
  let r = rd;
  for (let i = 0; i < 30; i++) {
    const h = 1e-7, slope = (g(r + h) - g(r - h)) / (2 * h);
    const step = g(r) / slope;
    r -= step;
    if (Math.abs(step) < 1e-12) break;
  }
  const s = r / rd;
  return [L.cx + dx * s * L.R, L.cy + dy * s * L.R];
}

/**
 * How bent a set of edge chains is under lens model L: Σ len · (mean
 * squared distance from each chain's best-fit line), capped per chain so a
 * genuinely curved object can't dominate. Lower is straighter. Used to
 * decide whether a lens profile helps: camera JPEGs are often corrected
 * in-camera already, and applying the profile again bends lines the other way.
 */
export function bendCost(chains, L, cap = 4) {
  let total = 0;
  for (const ch of chains) total += ch.len * Math.min(cap, lineFitResidual(ch.points.map((p) => undistort(L, p))));
  return total;
}

/**
 * Chains worth judging with: near-straight as shot (so they're straight
 * structures, not curved objects) and far enough from the center to bend
 * under distortion.
 */
export function usableChains(chains, width, height) {
  const probe = lensModel(width, height, { distortion: 20 }, null);
  return chains.filter((ch) =>
    lineFitResidual(ch.points) < 4 && lineFitResidual(ch.points.map((p) => undistort(probe, p))) > 0.5);
}

/** Mean squared distance of points from their total-least-squares line. */
function lineFitResidual(pts) {
  const n = pts.length;
  let mx = 0, my = 0;
  for (const [x, y] of pts) { mx += x / n; my += y / n; }
  let sxx = 0, syy = 0, sxy = 0;
  for (const [x, y] of pts) { sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my); }
  // Smallest eigenvalue of the scatter matrix = residual sum of squares.
  const tr = sxx + syy, det = sxx * syy - sxy * sxy;
  return (tr / 2 - Math.sqrt(Math.max(0, (tr * tr) / 4 - det))) / n;
}

// ---- Sliders ⇄ rotation --------------------------------------------------

export function rotation({ vertical = 0, horizontal = 0, rotate = 0 }) {
  const a = vertical * DEG, b = horizontal * DEG, g = rotate * DEG;
  const Rx = [1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)];
  const Ry = [Math.cos(b), 0, Math.sin(b), 0, 1, 0, -Math.sin(b), 0, Math.cos(b)];
  const Rz = [Math.cos(g), -Math.sin(g), 0, Math.sin(g), Math.cos(g), 0, 0, 0, 1];
  return mul(Rz, mul(Rx, Ry));
}

export function anglesFromRotation(R) {
  return {
    vertical: Math.asin(Math.max(-1, Math.min(1, R[7]))) / DEG,
    horizontal: Math.atan2(-R[6], R[8]) / DEG,
    rotate: Math.atan2(-R[1], R[4]) / DEG,
  };
}

/** Input pixel → output pixel, in the same pixel frame as the source. */
export function homography(width, height, edit) {
  const K = intrinsics(width, height, focalPx(width, height, edit.focal35));
  return mul(K, mul(rotation(edit), inv(K)));
}

// ---- Vanishing points → sliders ------------------------------------------

/** Homogeneous line through two points. */
export function lineThrough(p, q) {
  return cross([p[0], p[1], 1], [q[0], q[1], 1]);
}

/**
 * Vanishing points of a quad's edge pairs. Corners are ordered
 * top-left, top-right, bottom-right, bottom-left.
 */
export function quadVanishingPoints([tl, tr, br, bl]) {
  return {
    horizontal: norm(cross(lineThrough(tl, tr), lineThrough(bl, br))),
    vertical: norm(cross(lineThrough(tl, bl), lineThrough(tr, br))),
  };
}

/**
 * Focal length (35mm-equivalent) implied by two vanishing points of
 * orthogonal directions, or null when they don't pin it down (one is at
 * or near infinity, or the result is implausible).
 */
export function focal35FromVanishingPoints(width, height, v1, v2) {
  const cx = width / 2, cy = height / 2, diag = Math.hypot(width, height);
  const fin = (v) => Math.abs(v[2]) > 1e-12 && Math.hypot(v[0] / v[2] - cx, v[1] / v[2] - cy) < 12 * diag;
  if (!fin(v1) || !fin(v2)) return null;
  const a = [v1[0] / v1[2] - cx, v1[1] / v1[2] - cy];
  const b = [v2[0] / v2[2] - cx, v2[1] / v2[2] - cy];
  const f2 = -(a[0] * b[0] + a[1] * b[1]);
  if (!(f2 > 0)) return null;
  const f35 = focal35FromPx(width, height, Math.sqrt(f2));
  return f35 >= 12 && f35 <= 200 ? f35 : null;
}

/**
 * Sliders that make the given vanishing directions horizontal and vertical.
 * Either vanishing point may be null: only verticals fixes pitch and roll
 * (like an "Upright: Vertical" mode); only horizontals fixes yaw and roll.
 */
export function solveFromVanishingPoints(width, height, vpH, vpV, focal35) {
  const f = focalPx(width, height, focal35);
  const Kinv = inv(intrinsics(width, height, f));
  const dir = (v, axis) => {
    const d = norm(apply(Kinv, v));
    return d[axis] < 0 ? scale(d, -1) : d;
  };
  let d1 = vpH ? dir(vpH, 0) : null;
  let d2 = vpV ? dir(vpV, 1) : null;
  if (!d1 && !d2) return { vertical: 0, horizontal: 0, rotate: 0, focal35 };
  // Missing direction: the image axis, made orthogonal to the known one.
  if (!d1) d1 = norm(sub([1, 0, 0], scale(d2, d2[0])));
  if (!d2) d2 = norm(sub([0, 1, 0], scale(d1, d1[1])));
  // Symmetric orthogonalization, so neither direction is favored.
  const u = norm(add(d1, d2)), w = norm(sub(d1, d2));
  const r1 = scale(add(u, w), Math.SQRT1_2), r2 = scale(sub(u, w), Math.SQRT1_2);
  const r3 = cross(r1, r2);
  return { ...anglesFromRotation([...r1, ...r2, ...r3]), focal35 };
}

/** Sliders that turn a photographed rectangle back into a rectangle. */
export function solveFromQuad(width, height, quad, focal35) {
  const { horizontal, vertical } = quadVanishingPoints(quad);
  return solveFromVanishingPoints(width, height, horizontal, vertical, focal35);
}

// ---- Output geometry -----------------------------------------------------

/**
 * Outline of the warped photo in output pixels. Clips the source outline
 * where it would pass behind the virtual camera, so extreme slider values
 * still give a finite polygon.
 */
export function warpedOutline(width, height, H, L = null, samplesPerEdge = 24) {
  const pts = [];
  const corners = [[0, 0], [width, 0], [width, height], [0, height]];
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4];
    for (let k = 0; k < samplesPerEdge; k++) {
      const t = k / samplesPerEdge;
      const m = undistort(L, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      pts.push(apply(H, [m[0], m[1], 1]));
    }
  }
  const minW = 1e-3;
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    if (p[2] > minW) out.push([p[0] / p[2], p[1] / p[2]]);
    if ((p[2] > minW) !== (q[2] > minW)) {
      const t = (minW - p[2]) / (q[2] - p[2]);
      const r = add(p, scale(sub(q, p), t));
      out.push([r[0] / r[2], r[1] / r[2]]);
    }
  }
  return out;
}

export function bounds(poly) {
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Ray-casting point-in-polygon (works for the bowed, non-convex outlines lens correction makes). */
function insidePolygon(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Largest rectangle of the given aspect (w/h) inside the outline:
 * "constrain crop", so no empty corners show after the warp. The outline
 * is densely sampled, so "corners inside and no outline vertex inside the
 * rect" is a sound containment test even when it isn't convex.
 */
export function inscribedRect(poly, aspect) {
  const fits = (cx, cy, h) => {
    const w = h * aspect, x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
    if (![[x0, y0], [x1, y0], [x1, y1], [x0, y1]].every(([x, y]) => insidePolygon(poly, x, y))) return false;
    return !poly.some(([x, y]) => x > x0 && x < x1 && y > y0 && y < y1);
  };
  const box = bounds(poly);
  const maxH = (cx, cy) => {
    if (!insidePolygon(poly, cx, cy)) return 0;
    let lo = 0, hi = Math.min(box.h, box.w / aspect);
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (fits(cx, cy, mid)) lo = mid; else hi = mid;
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
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const h = maxH(cx + dx * step, cy + dy * step);
        if (h > best + 1e-6) { best = h; cx += dx * step; cy += dy * step; moved = true; }
      }
    }
  }
  return { x: cx - (best * aspect) / 2, y: cy - best / 2, w: best * aspect, h: best };
}

/** Crop to the corrected frame: average each pair of near-parallel edges. */
export function quadRect(quad, H, L = null) {
  const [tl, tr, br, bl] = quad.map((p) => project(H, undistort(L, p)));
  const x0 = (tl[0] + bl[0]) / 2, x1 = (tr[0] + br[0]) / 2;
  const y0 = (tl[1] + tr[1]) / 2, y1 = (bl[1] + br[1]) / 2;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Order four points as top-left, top-right, bottom-right, bottom-left. */
export function orderCorners(pts) {
  const c = pts.reduce((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length], [0, 0]);
  const sorted = [...pts].sort((a, b) => Math.atan2(a[1] - c[1], a[0] - c[0]) - Math.atan2(b[1] - c[1], b[0] - c[0]));
  // atan2 order (y down) runs clockwise on screen starting near "left";
  // rotate so the corner with the smallest x+y comes first.
  let start = 0;
  sorted.forEach((p, i) => { if (p[0] + p[1] < sorted[start][0] + sorted[start][1]) start = i; });
  return [0, 1, 2, 3].map((k) => sorted[(start + k) % 4]);
}
