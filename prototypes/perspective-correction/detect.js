// Auto detection with OpenCV.js.
//
// 1. Frame: find closed outlines in the edge map that simplify to a
//    quadrilateral, then snap each side onto the strongest straight edge
//    running alongside it. A frame's inner and outer edges often merge into
//    one outline, and simplifying it can give a hybrid whose side cuts
//    diagonally from one edge to the other; snapping puts that side back on
//    a real edge. (Which nested edge doesn't matter: they're all parallel
//    lines on the wall, so they share vanishing points.) Candidates are
//    ranked by how many of the photo's straight lines agree with their
//    perspective, so a quad traced from shapes *inside* a painting loses.
// 2. Lines: if no frame closes (someone stands in front of it), or in
//    "general" mode (which skips frames), fit a vanishing point to the
//    near-vertical segments. Horizontals are only used in general mode, and
//    only when most of them agree on one vanishing point: floors and side
//    walls recede in other directions and would otherwise skew the fit.
//
// Contours and lines are found in the photo as shot, but all perspective
// reasoning happens in "model" coordinates (lens distortion removed), via
// the toModel point mapping. Returned quads and segments are in source
// pixels; segments also carry their model endpoints (ma, mb).

import { lineThrough, orderCorners, quadVanishingPoints } from "./geometry.js";

const WORK_SIZE = 1000;

let cvPromise = null;
export function loadCv() {
  cvPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "opencv.js";
    s.onerror = () => reject(new Error("opencv.js failed to load"));
    // window.cv is the Emscripten module; it fills in place once the wasm
    // runtime is up, so poll for it.
    s.onload = () => {
      const t = setInterval(() => {
        if (window.cv && window.cv.Mat) {
          clearInterval(t);
          // Its self-resolving `then` makes any promise that adopts it spin
          // forever, so drop it before the module is passed around.
          window.cv.then = undefined;
          resolve({ cv: window.cv });
        }
      }, 30);
    };
    document.head.appendChild(s);
  });
  return cvPromise.then((m) => m.cv);
}

/** Last run's candidates, for debugging in the console. */
export const debugInfo = {};

export async function detect(img, toModel = (p) => p, fromModel = (p) => p, { mode = "framed" } = {}) {
  const cv = await loadCv();
  const W = img.naturalWidth || img.width,
    H = img.naturalHeight || img.height;
  const k = Math.min(1, WORK_SIZE / Math.max(W, H));
  const w = Math.round(W * k),
    h = Math.round(H * k);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(img, 0, 0, w, h);

  const mats = [];
  const keep = (m) => (mats.push(m), m);
  try {
    const src = keep(cv.imread(canvas));
    const gray = keep(new cv.Mat());
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
    const med = median(gray.data);
    const edges = keep(new cv.Mat());
    cv.Canny(
      gray,
      edges,
      Math.max(10, 0.66 * med * 0.5),
      Math.max(30, 1.33 * med * 0.5),
    );

    const up = (p) => [p[0] / k, p[1] / k];
    const segs = findSegments(cv, edges, w, h, keep).map((s) => {
      const a = up(s.a), b = up(s.b);
      return { ...s, a, b, ma: toModel(a), mb: toModel(b) };
    });
    const rawQuads = mode === "framed" ? contourQuads(cv, edges, w, h, keep) : [];
    const { frame, scored } = chooseFrame(rawQuads.map((q) => q.map((p) => toModel(up(p)))), segs, W, H);
    debugInfo.candidates = scored.map((c) => ({ ...c, quad: c.quad.map(fromModel) }));
    debugInfo.raw = rawQuads.map((q) => q.map(up));

    if (frame) {
      return {
        method: "frame",
        quad: frame.quad.map(fromModel),
        support: frame.support,
        snapped: frame.snapped,
        segments: segs,
      };
    }
    const v = trustedVanishingPoint(segs, "v", 0.6);
    const hz = mode === "general" ? trustedVanishingPoint(segs, "h", 0.8) : { vp: null, share: 0 };
    if (v.vp || hz.vp)
      return { method: "lines", vpV: v.vp, vpH: hz.vp, vSupport: v.share, hSupport: hz.share, segments: segs };
    return { method: "none", segments: segs };
  } finally {
    mats.forEach((m) => m.delete());
  }
}

/**
 * Long, nearly straight edge chains (ceiling lines, wall corners, frame
 * sides) for estimating leftover lens distortion. Runs at full sample
 * resolution: the residual bow is only a pixel or two.
 */
export async function findStraightChains(img) {
  const cv = await loadCv();
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(img, 0, 0, w, h);
  const mats = [];
  const keep = (m) => (mats.push(m), m);
  try {
    const src = keep(cv.imread(canvas));
    const gray = keep(new cv.Mat());
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
    const med = median(gray.data);
    const edges = keep(new cv.Mat());
    cv.Canny(gray, edges, Math.max(10, 0.33 * med), Math.max(30, 0.66 * med));
    const contours = keep(new cv.MatVector());
    const hierarchy = keep(new cv.Mat());
    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_NONE);

    const minLen = Math.max(w, h) * 0.2, eps = Math.max(w, h) * 0.004;
    const chains = [];
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      if (c.rows < minLen) { c.delete(); continue; }
      const pts = [];
      for (let j = 0; j < c.rows; j++) pts.push([c.data32S[j * 2], c.data32S[j * 2 + 1]]);
      const approx = new cv.Mat();
      cv.approxPolyDP(c, approx, eps, false);
      // Map polyline vertices back to contour indices, then keep the
      // contour points under each long polyline edge.
      const idx = [];
      let from = 0;
      for (let j = 0; j < approx.rows; j++) {
        const x = approx.data32S[j * 2], y = approx.data32S[j * 2 + 1];
        let k = from;
        while (k < pts.length && (pts[k][0] !== x || pts[k][1] !== y)) k++;
        if (k < pts.length) { idx.push(k); from = k; }
      }
      for (let j = 0; j + 1 < idx.length; j++) {
        const a = pts[idx[j]], b = pts[idx[j + 1]];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < minLen) continue;
        // Skip a few points at each end (corners round off).
        const run = pts.slice(idx[j] + 5, idx[j + 1] - 5).filter((_, n) => n % 3 === 0);
        if (run.length > 20) chains.push({ points: run, len });
      }
      approx.delete();
      c.delete();
    }
    return chains;
  } finally {
    mats.forEach((m) => m.delete());
  }
}

/**
 * Pick the frame from outline quads (model pixels): snap their sides to
 * real edges, add recombinations of those sides, and rank by perspective
 * agreement and size. Pure, so it's testable without OpenCV.
 */
export function chooseFrame(outlineQuads, segs, W, H) {
  const S = Math.max(W, H);
  const snapped = outlineQuads.map((q) => snapQuad(q, segs, W, H)).filter(Boolean);
  const candidates = [...snapped, ...recombine(snapped, W, H)].filter((c) => quadQuality(c.quad, W, H, S * 0.008));
  let frame = null;
  const scored = [];
  for (const c of candidates) {
    const support = supportOf(c.quad, segs);
    const score = quadQuality(c.quad, W, H, S * 0.008) * Math.sqrt(polygonArea(c.quad) / (W * H)) * support * support;
    scored.push({ quad: c.quad, support, score });
    if (support > 0.2 && (!frame || score > frame.score)) frame = { ...c, support, score };
  }
  return { frame, scored };
}

/**
 * A family's vanishing point, trusted only when at least 5 lines and
 * minShare of the family's line length agree on it (people, straps and
 * furniture make stray "verticals").
 */
export function trustedVanishingPoint(segs, family, minShare) {
  const fs = segs.filter((s) => s.family === family);
  const fit = fs.length >= 5 ? fitVanishingPoint(fs) : null;
  if (!fit) return { vp: null, share: 0 };
  const inliers = fs.filter((s) => agrees(s, fit, 1.5));
  const share = inliers.reduce((t, s) => t + s.len, 0) / fs.reduce((t, s) => t + s.len, 0);
  return { vp: inliers.length >= 5 && share >= minShare ? fit : null, share };
}

function median(data) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < data.length; i++) hist[data[i]]++;
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= data.length / 2) return v;
  }
  return 128;
}

/** Quads simplified from closed outlines in the edge map (work pixels). */
function contourQuads(cv, edges, w, h, keep) {
  const imgArea = w * h,
    margin = Math.max(w, h) * 0.008;
  const out = [];
  // Two passes: a tight one, and a looser one that bridges gaps where a
  // frame's edge fades out (bevels, glare, shadows).
  for (const size of [3, 7]) {
    const closed = keep(new cv.Mat());
    const kernel = keep(cv.Mat.ones(size, size, cv.CV_8U));
    cv.dilate(edges, closed, kernel);
    const contours = keep(new cv.MatVector());
    const hierarchy = keep(new cv.Mat());
    cv.findContours(closed, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      const area = cv.contourArea(c);
      if (area < imgArea * 0.03) {
        c.delete();
        continue;
      }
      const hull = new cv.Mat();
      cv.convexHull(c, hull);
      const hullArea = cv.contourArea(hull);
      const peri = cv.arcLength(hull, true);
      for (const eps of [0.01, 0.02, 0.035]) {
        const approx = new cv.Mat();
        cv.approxPolyDP(hull, approx, eps * peri, true);
        if (approx.rows === 4) {
          const pts = [];
          for (let j = 0; j < 4; j++) pts.push([approx.data32S[j * 2], approx.data32S[j * 2 + 1]]);
          const quad = orderCorners(pts);
          // The contour must actually fill its hull (a frame outline does;
          // a scatter of unrelated edges doesn't).
          if (quadQuality(quad, w, h, margin) && area / hullArea > 0.8) out.push(quad);
          approx.delete();
          break;
        }
        approx.delete();
      }
      hull.delete();
      c.delete();
    }
  }
  return out;
}

/**
 * Snap each side of a model-space quad onto the strongest straight edge
 * nearby: collinear segments within a band around the side, nearly
 * parallel, overlapping its extent. The side becomes the weighted
 * least-squares line through the winning group's endpoints; corners are
 * re-intersected. Sides with no edge nearby are left as they were.
 */
export function snapQuad(quad, segs, W, H) {
  const S = Math.max(W, H), band = S * 0.03, tol = S * 0.004;
  let snapped = 0;
  const sideLines = [0, 1, 2, 3].map((i) => {
    const a = quad[i], b = quad[(i + 1) % 4];
    const family = i % 2 === 0 ? "h" : "v";
    const l0 = unitLine(lineThrough(a, b));
    const len2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
    const t = (p) => ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / len2;
    const near = segs.filter((s) => {
      if (s.family !== family || !onLine(s, l0, band, 4)) return false;
      const [t0, t1] = [t(s.ma), t(s.mb)].sort((x, y) => x - y);
      return t1 > 0 && t0 < 1;
    });
    // Group into collinear lines. Pick by length, discounted by distance
    // from the original side, so nested edges (canvas vs frame) are chosen
    // consistently around the quad and "To frame" crops evenly.
    const groups = [];
    for (const s of near.sort((p, q) => q.len - p.len)) {
      const g = groups.find((g) => onLine(s, g.line, tol, 1.5));
      if (g) { g.segs.push(s); g.len += s.len; }
      else groups.push({ line: unitLine(lineThrough(s.ma, s.mb)), segs: [s], len: s.len });
    }
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const rank = (g) => g.len / (1 + Math.abs(g.line[0] * mid[0] + g.line[1] * mid[1] + g.line[2]) / (S * 0.005));
    const best = groups.sort((p, q) => rank(q) - rank(p))[0];
    if (!best || best.len < Math.sqrt(len2) * 0.2) return l0;
    snapped++;
    return fitLine(best.segs.flatMap((s) => [[s.ma, s.len], [s.mb, s.len]]));
  });
  const meet = (l1, l2) => {
    const v = [l1[1] * l2[2] - l1[2] * l2[1], l1[2] * l2[0] - l1[0] * l2[2], l1[0] * l2[1] - l1[1] * l2[0]];
    return [v[0] / v[2], v[1] / v[2]];
  };
  // Corner i is where side i-1 (left/top neighbor) meets side i.
  const out = [0, 1, 2, 3].map((i) => meet(sideLines[(i + 3) % 4], sideLines[i]));
  return out.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])) ? { quad: out, snapped, lines: sideLines } : null;
}

/**
 * New candidates from mixing snapped sides across candidates. A painting's
 * own strong edges (a horizon, a road) can split the canvas outline into
 * partial rectangles; the top of one and the bottom of another rebuild it.
 */
export function recombine(cands, W, H) {
  const S = Math.max(W, H);
  const pick = (k) => {
    const uniq = [];
    for (const c of cands) {
      const l = c.lines[k];
      const same = uniq.some((u) => Math.abs(u[0] * l[0] + u[1] * l[1]) > Math.cos(Math.PI / 180) &&
        Math.abs(Math.abs(u[2]) - Math.abs(l[2])) < S * 0.004);
      if (!same) uniq.push(l);
    }
    return uniq.slice(0, 8);
  };
  const [tops, rights, bottoms, lefts] = [0, 1, 2, 3].map(pick);
  const meet = (l1, l2) => {
    const v = [l1[1] * l2[2] - l1[2] * l2[1], l1[2] * l2[0] - l1[0] * l2[2], l1[0] * l2[1] - l1[1] * l2[0]];
    return [v[0] / v[2], v[1] / v[2]];
  };
  const out = [];
  for (const top of tops) for (const right of rights) for (const bottom of bottoms) for (const left of lefts) {
    const q = [meet(left, top), meet(top, right), meet(right, bottom), meet(bottom, left)];
    if (!q.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))) continue;
    // Keep only properly ordered quads (top above bottom, left of right).
    if (q[0][1] < q[3][1] && q[1][1] < q[2][1] && q[0][0] < q[1][0] && q[3][0] < q[2][0])
      out.push({ quad: q, snapped: 4, lines: [top, right, bottom, left], recombined: true });
  }
  return out;
}

/** Weighted total-least-squares line through [point, weight] pairs. */
function fitLine(pw) {
  let sw = 0, mx = 0, my = 0;
  for (const [[x, y], w] of pw) { sw += w; mx += w * x; my += w * y; }
  mx /= sw; my /= sw;
  let sxx = 0, syy = 0, sxy = 0;
  for (const [[x, y], w] of pw) { sxx += w * (x - mx) ** 2; syy += w * (y - my) ** 2; sxy += w * (x - mx) * (y - my); }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy); // direction of the line
  const n = [-Math.sin(angle), Math.cos(angle)];
  return [n[0], n[1], -(n[0] * mx + n[1] * my)];
}

const unitLine = (l) => {
  const n = Math.hypot(l[0], l[1]);
  return l.map((v) => v / n);
};

/** Is segment s (model coords) on line l: both ends within tol and parallel within maxDeg? */
function onLine(s, l, tol, maxDeg) {
  const d = (p) => Math.abs(l[0] * p[0] + l[1] * p[1] + l[2]);
  if (d(s.ma) > tol || d(s.mb) > tol) return false;
  const u = [s.mb[0] - s.ma[0], s.mb[1] - s.ma[1]];
  const sin = Math.abs(u[0] * l[0] + u[1] * l[1]) / Math.hypot(...u); // l's normal · direction
  return sin < Math.sin((maxDeg * Math.PI) / 180);
}

/** Share of line length (per family, averaged) that agrees with the quad's perspective. */
function supportOf(quad, segs) {
  const vp = quadVanishingPoints(quad);
  const total = { h: 0, v: 0 }, agree = { h: 0, v: 0 };
  for (const s of segs) {
    total[s.family] += s.len;
    if (agrees(s, s.family === "h" ? vp.horizontal : vp.vertical, 1.2)) agree[s.family] += s.len;
  }
  const frac = (f) => (total[f] ? agree[f] / total[f] : 0);
  return (frac("h") + frac("v")) / 2;
}

function polygonArea(q) {
  let a = 0;
  for (let i = 0; i < q.length; i++) {
    const p = q[i], r = q[(i + 1) % q.length];
    a += p[0] * r[1] - r[0] * p[1];
  }
  return Math.abs(a) / 2;
}

/** 0 when the quad can't be a photographed rectangle, else a 0..1 fit. */
function quadQuality(q, w, h, margin) {
  if (
    q.some(
      ([x, y]) => x < margin || y < margin || x > w - margin || y > h - margin,
    )
  )
    return 0;
  let worst = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[(i + 3) % 4],
      b = q[i],
      c = q[(i + 1) % 4];
    const u = [a[0] - b[0], a[1] - b[1]],
      v = [c[0] - b[0], c[1] - b[1]];
    const cos =
      (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v));
    const angle = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
    if (angle < 60 || angle > 120) return 0;
    worst = Math.max(worst, Math.abs(angle - 90));
  }
  const side = (i) =>
    Math.hypot(q[i][0] - q[(i + 1) % 4][0], q[i][1] - q[(i + 1) % 4][1]);
  const r1 = side(0) / side(2),
    r2 = side(1) / side(3);
  if (r1 < 0.5 || r1 > 2 || r2 < 0.5 || r2 > 2) return 0;
  // Top/bottom must be the near-horizontal pair.
  const dx = Math.abs(q[1][0] - q[0][0]),
    dy = Math.abs(q[1][1] - q[0][1]);
  if (dy > dx) return 0;
  return 1 - worst / 60;
}

function findSegments(cv, edges, w, h, keep) {
  const lines = keep(new cv.Mat());
  const minLen = Math.max(w, h) * 0.06;
  cv.HoughLinesP(edges, lines, 1, Math.PI / 360, 50, minLen, 4);
  const out = [];
  for (let i = 0; i < lines.rows; i++) {
    const [x1, y1, x2, y2] = lines.data32S.slice(i * 4, i * 4 + 4);
    const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
    const a = ((angle % 180) + 180) % 180;
    const family = a < 30 || a > 150 ? "h" : a > 60 && a < 120 ? "v" : null;
    if (family)
      out.push({
        a: [x1, y1],
        b: [x2, y2],
        family,
        len: Math.hypot(x2 - x1, y2 - y1),
      });
  }
  return out;
}

/** Does the segment (in model coordinates) point at vanishing point v? */
function agrees(s, v, maxAngleDeg) {
  const m = [(s.ma[0] + s.mb[0]) / 2, (s.ma[1] + s.mb[1]) / 2];
  const d =
    Math.abs(v[2]) < 1e-12
      ? [v[0], v[1]]
      : [v[0] / v[2] - m[0], v[1] / v[2] - m[1]];
  const u = [s.mb[0] - s.ma[0], s.mb[1] - s.ma[1]];
  const sin =
    Math.abs(u[0] * d[1] - u[1] * d[0]) / (Math.hypot(...u) * Math.hypot(...d));
  return sin < Math.sin((maxAngleDeg * Math.PI) / 180);
}

/**
 * RANSAC over segment pairs, then a weighted least-squares refinement:
 * the point minimizing Σ len·(l·v)² over inlier lines.
 */
export function fitVanishingPoint(segs, maxAngleDeg = 1.5) {
  if (segs.length < 2) return null;
  segs = [...segs].sort((p, q) => q.len - p.len).slice(0, 60);
  const lines = segs.map((s) => {
    const l = lineThrough(s.ma, s.mb);
    const n = Math.hypot(l[0], l[1]);
    return l.map((v) => v / n);
  });
  const inliers = (v) =>
    segs
      .map((s, i) => (agrees(s, v, maxAngleDeg) ? i : -1))
      .filter((i) => i >= 0);

  let best = null,
    bestScore = 0;
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const l1 = lines[i],
        l2 = lines[j];
      const v = [
        l1[1] * l2[2] - l1[2] * l2[1],
        l1[2] * l2[0] - l1[0] * l2[2],
        l1[0] * l2[1] - l1[1] * l2[0],
      ];
      const n = Math.hypot(...v);
      if (n < 1e-12) continue;
      const ids = inliers(v.map((x) => x / n));
      const score = ids.reduce((s, k) => s + segs[k].len, 0);
      if (score > bestScore) {
        bestScore = score;
        best = ids;
      }
    }
  }
  if (!best || best.length < 2) return null;
  const M = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const k of best) {
    const l = lines[k],
      wgt = segs[k].len;
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++) M[r * 3 + c] += wgt * l[r] * l[c];
  }
  return smallestEigenvector(M);
}

/** Jacobi eigen-decomposition of a symmetric 3×3; returns the vector of the smallest eigenvalue. */
function smallestEigenvector(A) {
  const a = [
    [A[0], A[1], A[2]],
    [A[3], A[4], A[5]],
    [A[6], A[7], A[8]],
  ];
  const V = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0;
    for (let p = 0; p < 3; p++)
      for (let q = p + 1; q < 3; q++) off += a[p][q] ** 2;
    if (off < 1e-20) break;
    for (let p = 0; p < 3; p++)
      for (let q = p + 1; q < 3; q++) {
        if (Math.abs(a[p][q]) < 1e-30) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t =
          Math.sign(theta || 1) /
          (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1),
          s = t * c;
        for (let k = 0; k < 3; k++) {
          const akp = a[k][p],
            akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < 3; k++) {
          const apk = a[p][k],
            aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < 3; k++) {
          const vkp = V[k][p],
            vkq = V[k][q];
          V[k][p] = c * vkp - s * vkq;
          V[k][q] = s * vkp + c * vkq;
        }
      }
  }
  let m = 0;
  for (let i = 1; i < 3; i++) if (a[i][i] < a[m][m]) m = i;
  return [V[0][m], V[1][m], V[2][m]];
}
