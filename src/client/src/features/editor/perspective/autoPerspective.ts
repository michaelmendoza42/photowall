// Auto perspective: find the picture frame (or trusted line directions) in
// the photo and work out the camera angles that square it up. OpenCV.js
// (~10 MB) loads the first time Auto is used.

import opencvUrl from '@techstark/opencv-js/dist/opencv.js?url';
import { EDIT_LIMITS, turnedSize, type PhotoEdit } from '../../../../../shared/api/edits.js';
import {
  distort,
  lensModel,
  solveFromQuad,
  solveFromVanishingPoints,
  undistort,
  type CameraAngles,
  type Point,
} from '../../../../../shared/api/editWarp.js';
import { chooseFrame, quadFromPoints, quadQuality, segmentFamily, trustedVanishingPoint, type Segment } from './frameDetection.js';

/** "framed": square up a picture frame. "general": straighten from the photo's lines. */
export type AutoMode = 'framed' | 'general';

export interface AutoResult {
  /** frame: a frame was squared up. lines: line directions only. none: nothing trustworthy. */
  method: 'frame' | 'lines' | 'none';
  angles: CameraAngles | null;
  /** The frame's corners in the turned photo as shot, for "Crop to frame". */
  quad: Point[] | null;
  message: string;
}

const WORK_SIZE = 1000;
/** A frame-based answer beyond this is more likely a bad detection than a real tilt. */
const MAX_FRAME_DEG = 25;
/** Without a frame, large corrections are more likely wrong than right. */
const MAX_LINES_DEG = 10;

// OpenCV.js has no types worth importing; it is used through a narrow surface.
type Cv = any;

let cvPromise: Promise<{ cv: Cv }> | null = null;

function loadCv(): Promise<Cv> {
  cvPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = opencvUrl;
    script.async = true;
    script.onerror = () => {
      cvPromise = null;
      reject(new Error('Could not load the detector'));
    };
    // The Emscripten module fills in place once its runtime is up; its own
    // self-resolving `then` would make any promise adopting it spin forever.
    script.onload = () => {
      const timer = window.setInterval(() => {
        const cv = (window as unknown as { cv?: Cv }).cv;
        if (cv && cv.Mat) {
          window.clearInterval(timer);
          cv.then = undefined;
          resolve({ cv });
        }
      }, 30);
    };
    document.head.appendChild(script);
  });
  return cvPromise.then((m) => m.cv);
}

/**
 * Detect and solve on `image` (the unedited photo) as the edit currently
 * turns it, with its lens correction applied, assuming `focal35`.
 */
export async function autoPerspective(
  image: HTMLImageElement,
  edit: PhotoEdit,
  mode: AutoMode,
  focal35: number,
): Promise<AutoResult> {
  const cv = await loadCv();
  const { width: W, height: H } = turnedSize(image.naturalWidth, image.naturalHeight, edit.rotation);
  const k = Math.min(1, WORK_SIZE / Math.max(W, H));
  const w = Math.max(1, Math.round(W * k));
  const h = Math.max(1, Math.round(H * k));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  // Draw the photo turned clockwise by the edit's quarter turn.
  ctx.translate(w / 2, h / 2);
  ctx.rotate((edit.rotation * Math.PI) / 180);
  const along = edit.rotation === 90 || edit.rotation === 270;
  ctx.drawImage(image, -(along ? h : w) / 2, -(along ? w : h) / 2, along ? h : w, along ? w : h);

  const L = lensModel(W, H, edit.lensDistortion);
  const up = (p: Point): Point => [p[0] / k, p[1] / k];
  const toModel = (p: Point): Point => undistort(L, up(p));

  const mats: { delete(): void }[] = [];
  const keep = <T extends { delete(): void }>(m: T): T => {
    mats.push(m);
    return m;
  };
  try {
    const src = keep(cv.imread(canvas));
    const gray = keep(new cv.Mat());
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
    const med = median(gray.data as Uint8Array);
    const edges = keep(new cv.Mat());
    cv.Canny(gray, edges, Math.max(10, 0.33 * med), Math.max(30, 0.66 * med));

    const segs = findSegments(cv, edges, w, h, keep).map((s): Segment => {
      const a = up(s.a);
      const b = up(s.b);
      return { a, b, ma: undistort(L, a), mb: undistort(L, b), family: s.family, len: s.len };
    });

    if (mode === 'framed') {
      const outlines = contourQuads(cv, edges, w, h, keep).map((q) => q.map(toModel));
      const frame = chooseFrame(outlines, segs, W, H);
      if (frame) {
        const angles = solveFromQuad(W, H, frame.quad, focal35);
        if (withinDeg(angles, MAX_FRAME_DEG)) {
          return {
            method: 'frame',
            angles,
            quad: frame.quad.map((p) => distort(L, p)),
            message: 'Squared up the frame.',
          };
        }
      }
    }

    // Lines: verticals always; horizontals only in general mode, and only
    // when most of them agree (floors and side walls recede elsewhere).
    let vpV = trustedVanishingPoint(segs, 'v', 0.6).vp;
    let vpH = mode === 'general' ? trustedVanishingPoint(segs, 'h', 0.8).vp : null;
    if (vpH && Math.abs(solveFromVanishingPoints(W, H, vpH, vpV, focal35).horizontal) > MAX_LINES_DEG) vpH = null;
    if (vpV && Math.abs(solveFromVanishingPoints(W, H, null, vpV, focal35).vertical) > MAX_LINES_DEG) vpV = null;
    if (vpV || vpH) {
      const angles = solveFromVanishingPoints(W, H, vpH, vpV, focal35);
      if (withinDeg(angles, MAX_LINES_DEG)) {
        const what = vpV && vpH ? 'verticals and the side-on angle' : vpV ? 'verticals' : 'the side-on angle';
        const lead = mode === 'framed' ? 'No frame found; straightened ' : 'Straightened ';
        return { method: 'lines', angles, quad: null, message: `${lead}${what}.` };
      }
    }
    return { method: 'none', angles: null, quad: null, message: 'Nothing clear to straighten. Use the sliders.' };
  } finally {
    for (const m of mats) m.delete();
  }
}

function withinDeg(a: CameraAngles, limit: number): boolean {
  return (
    Math.abs(a.vertical) <= Math.min(limit, EDIT_LIMITS.perspective) &&
    Math.abs(a.horizontal) <= Math.min(limit, EDIT_LIMITS.perspective) &&
    Math.abs(a.rotate) <= Math.min(limit, EDIT_LIMITS.straighten)
  );
}

function median(data: Uint8Array): number {
  const hist = new Uint32Array(256);
  for (let i = 0; i < data.length; i++) hist[data[i]!]!++;
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v]!;
    if (acc >= data.length / 2) return v;
  }
  return 128;
}

/** Straight segments (work pixels), near-horizontal or near-vertical. */
function findSegments(cv: Cv, edges: Cv, w: number, h: number, keep: <T extends { delete(): void }>(m: T) => T) {
  const lines = keep(new cv.Mat());
  cv.HoughLinesP(edges, lines, 1, Math.PI / 360, 50, Math.max(w, h) * 0.06, 4);
  const out: { a: Point; b: Point; family: 'h' | 'v'; len: number }[] = [];
  const data = lines.data32S as Int32Array;
  for (let i = 0; i < lines.rows; i++) {
    const a: Point = [data[i * 4]!, data[i * 4 + 1]!];
    const b: Point = [data[i * 4 + 2]!, data[i * 4 + 3]!];
    const family = segmentFamily(a, b);
    if (family) out.push({ a, b, family, len: Math.hypot(b[0] - a[0], b[1] - a[1]) });
  }
  return out;
}

/**
 * Quads simplified from closed outlines in the edge map (work pixels). Two
 * passes: a tight one, and a looser one that bridges gaps where a frame's
 * edge fades out (bevels, glare, shadows).
 */
function contourQuads(cv: Cv, edges: Cv, w: number, h: number, keep: <T extends { delete(): void }>(m: T) => T): Point[][] {
  const area0 = w * h;
  const margin = Math.max(w, h) * 0.008;
  const out: Point[][] = [];
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
      if (area >= area0 * 0.03) {
        const hull = new cv.Mat();
        cv.convexHull(c, hull);
        const hullArea = cv.contourArea(hull);
        const peri = cv.arcLength(hull, true);
        for (const eps of [0.01, 0.02, 0.035]) {
          const approx = new cv.Mat();
          cv.approxPolyDP(hull, approx, eps * peri, true);
          if (approx.rows === 4) {
            const d = approx.data32S as Int32Array;
            const quad = quadFromPoints([0, 1, 2, 3].map((j): Point => [d[j * 2]!, d[j * 2 + 1]!]));
            // A frame outline fills its hull; a scatter of unrelated edges doesn't.
            if (quadQuality(quad, w, h, margin) > 0 && area / hullArea > 0.8) out.push(quad);
            approx.delete();
            break;
          }
          approx.delete();
        }
        hull.delete();
      }
      c.delete();
    }
  }
  return out;
}
