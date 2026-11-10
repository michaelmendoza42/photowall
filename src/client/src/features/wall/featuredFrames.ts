// Picture frames for featured photos, drawn on a canvas: modern gallery
// frames and a few museum classics. Each fills the hero tile's frame band
// (see featuredGeometry.ts) with a moulding and, inside it, a mat or liner
// up to the photo. Light falls from the top left, so the top and left
// faces of a moulding are lit and the bottom and right ones shaded.

import {
  FEATURED_FRAMES,
  type FeaturedFrame,
  type FeaturedFrameChoice,
} from '../../../../shared/api/curation.js';
import { featuredPhotoRect, FEATURED_FRAME_BAND_RATIO, type Rect } from './featuredGeometry.js';

export const FEATURED_FRAME_LABELS: Record<FeaturedFrameChoice, string> = {
  random: 'Random',
  'gallery-black': 'Gallery black',
  'white-gallery': 'White gallery',
  'natural-oak': 'Natural oak',
  walnut: 'Walnut',
  'shadow-box': 'Shadow box',
  'brushed-silver': 'Brushed silver',
  gilded: 'Gilded',
  baroque: 'Baroque gold',
};

/** Changes on every page load, so `random` frames change on every load too. */
const LOAD_SEED = Math.floor(Math.random() * 0x7fffffff);

/** The frame a featured photo shows in: `random` picks one per page load. */
export function resolveFeaturedFrame(
  choice: FeaturedFrameChoice | undefined,
  photoId: string,
): FeaturedFrame {
  if (choice && choice !== 'random') return choice;
  return FEATURED_FRAMES[hash(`${LOAD_SEED}:${photoId}`) % FEATURED_FRAMES.length]!;
}

type Side = 'top' | 'right' | 'bottom' | 'left';

interface FrameStyle {
  /** Share of the frame band the moulding takes; the mat or liner takes the rest. */
  moulding: number;
  /** Colors across the moulding from its outer edge to its inner edge. */
  profile: string[];
  /** How strongly the light changes each face. */
  shading: number;
  grain?: { color: string; light: string; density: number };
  brushed?: boolean;
  /** Beads along the moulding's inner edge. */
  beads?: { color: string; light: string };
  /** Carved leaf ornament along the moulding and rosettes at the corners. */
  carving?: { dark: string; light: string };
  mat: { color: string; texture: 'paper' | 'linen' | 'velvet' | 'none'; bevel?: string };
  /** A deep box: the photo floats above a dark backing, casting a shadow. */
  floating?: boolean;
}

const STYLES: Record<FeaturedFrame, FrameStyle> = {
  'gallery-black': {
    moulding: 0.34,
    profile: ['#2b2b2b', '#151515', '#111111', '#1c1c1c', '#3a3a3a'],
    shading: 0.22,
    mat: { color: '#f4f1ea', texture: 'paper', bevel: '#fffdf8' },
  },
  'white-gallery': {
    moulding: 0.32,
    profile: ['#d9d8d4', '#f6f5f2', '#fbfaf8', '#ecebe7', '#cfcdc8'],
    shading: 0.12,
    mat: { color: '#efede7', texture: 'paper', bevel: '#ffffff' },
  },
  'natural-oak': {
    moulding: 0.5,
    profile: ['#a98058', '#c9a274', '#d4b083', '#c49b6c', '#9c7449'],
    shading: 0.2,
    grain: { color: 'rgba(110, 74, 40, 0.28)', light: 'rgba(255, 236, 205, 0.18)', density: 1 },
    mat: { color: '#f2ede2', texture: 'paper', bevel: '#fbf8f1' },
  },
  walnut: {
    moulding: 0.62,
    profile: ['#3b2416', '#5e3c25', '#6b4630', '#553521', '#2f1c11'],
    shading: 0.24,
    grain: { color: 'rgba(25, 13, 6, 0.4)', light: 'rgba(196, 140, 92, 0.16)', density: 1.3 },
    mat: { color: '#ebe3d2', texture: 'paper', bevel: '#f7f1e4' },
  },
  'shadow-box': {
    moulding: 0.3,
    profile: ['#202020', '#0d0d0d', '#0a0a0a', '#151515', '#262626'],
    shading: 0.2,
    mat: { color: '#2a2a2a', texture: 'none' },
    floating: true,
  },
  'brushed-silver': {
    moulding: 0.42,
    profile: ['#7d8287', '#c9cdd1', '#eef0f2', '#b4b8bc', '#80858a'],
    shading: 0.18,
    brushed: true,
    mat: { color: '#e6e6e3', texture: 'paper', bevel: '#f7f7f5' },
  },
  gilded: {
    moulding: 0.66,
    profile: ['#5c3d0c', '#a87b25', '#e9c96a', '#f7e3a0', '#c19434', '#7c5814', '#d6b25a', '#8c6418'],
    shading: 0.22,
    beads: { color: '#b98a2b', light: '#fbe7a6' },
    mat: { color: '#d8ccb1', texture: 'linen' },
  },
  baroque: {
    moulding: 0.8,
    profile: ['#4a300a', '#8f6519', '#d8b257', '#f3d98d', '#b58a2c', '#6e4c10', '#c9a043', '#f0d27e', '#7a5513'],
    shading: 0.26,
    beads: { color: '#a97b22', light: '#f6dc8f' },
    carving: { dark: 'rgba(60, 36, 4, 0.75)', light: 'rgba(255, 240, 180, 0.8)' },
    mat: { color: '#4b1717', texture: 'velvet' },
  },
};

/** Longest edge, in canvas px, a frame is drawn at; larger tiles scale it up. */
const MAX_CANVAS_EDGE = 2400;
const CACHE_LIMIT = 24;
const canvasCache = new Map<string, HTMLCanvasElement>();
const dataUrlCache = new Map<string, string>();

/**
 * A frame for a `width`×`height` hero tile (any units) holding a photo of
 * `photo`'s shape: moulding and mat, with the photo's own area left for
 * the photo itself. Cached by shape.
 */
export function featuredFrameCanvas(
  frame: FeaturedFrame,
  width: number,
  height: number,
  photo: { width: number; height: number },
  maxEdge = MAX_CANVAS_EDGE,
): HTMLCanvasElement {
  // Twice the tile's size for sharp high-DPI screens, within the cap.
  const factor = Math.min(2, maxEdge / Math.max(width, height, 1));
  const pixelWidth = Math.max(8, Math.round(width * factor));
  const pixelHeight = Math.max(8, Math.round(height * factor));
  const key = `${frame}:${pixelWidth}x${pixelHeight}:${(photo.width / Math.max(1, photo.height)).toFixed(4)}`;
  const cached = canvasCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  const context = canvas.getContext('2d');
  if (context) drawFrame(context, STYLES[frame], pixelWidth, pixelHeight, photo, hash(frame));
  if (canvasCache.size >= CACHE_LIMIT) canvasCache.delete(canvasCache.keys().next().value!);
  canvasCache.set(key, canvas);
  return canvas;
}

/** The same frame as a data URL, for DOM previews. */
export function featuredFrameDataUrl(
  frame: FeaturedFrame,
  width: number,
  height: number,
  photo: { width: number; height: number },
  maxEdge?: number,
): string {
  const canvas = featuredFrameCanvas(frame, width, height, photo, maxEdge);
  const key = `${frame}:${canvas.width}x${canvas.height}:${(photo.width / Math.max(1, photo.height)).toFixed(4)}`;
  let url = dataUrlCache.get(key);
  if (!url) {
    url = canvas.toDataURL('image/png');
    if (dataUrlCache.size >= CACHE_LIMIT) dataUrlCache.delete(dataUrlCache.keys().next().value!);
    dataUrlCache.set(key, url);
  }
  return url;
}

function drawFrame(
  context: CanvasRenderingContext2D,
  style: FrameStyle,
  width: number,
  height: number,
  photoShape: { width: number; height: number },
  seed: number,
): void {
  const tile = { x: 0, y: 0, width, height };
  const band = FEATURED_FRAME_BAND_RATIO * Math.min(width, height);
  const mouldingWidth = band * style.moulding;
  const photo = featuredPhotoRect(tile, photoShape);
  const opening: Rect = {
    x: mouldingWidth,
    y: mouldingWidth,
    width: width - 2 * mouldingWidth,
    height: height - 2 * mouldingWidth,
  };
  const random = mulberry32(seed);

  drawMat(context, style, opening, photo, random);
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    context.save();
    clipSide(context, side, tile, mouldingWidth);
    drawMoulding(context, style, side, tile, mouldingWidth, random);
    context.restore();
  }
  if (style.carving) drawCorners(context, style, tile, mouldingWidth);
  // Mitre lines where the sides meet, and a crisp outer edge.
  context.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  context.lineWidth = Math.max(1, mouldingWidth * 0.012);
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(mouldingWidth, mouldingWidth);
  context.moveTo(width, 0);
  context.lineTo(width - mouldingWidth, mouldingWidth);
  context.moveTo(width, height);
  context.lineTo(width - mouldingWidth, height - mouldingWidth);
  context.moveTo(0, height);
  context.lineTo(mouldingWidth, height - mouldingWidth);
  context.stroke();
  context.strokeStyle = 'rgba(0, 0, 0, 0.6)';
  context.lineWidth = Math.max(1, mouldingWidth * 0.03);
  context.strokeRect(0, 0, width, height);
}

function drawMat(
  context: CanvasRenderingContext2D,
  style: FrameStyle,
  opening: Rect,
  photo: Rect,
  random: () => number,
): void {
  const { mat } = style;
  context.fillStyle = mat.color;
  context.fillRect(opening.x, opening.y, opening.width, opening.height);
  const size = Math.min(opening.width, opening.height);

  if (mat.texture === 'paper') {
    // Faint speckle, like cotton rag board.
    const count = Math.round((opening.width * opening.height) / 900);
    for (let index = 0; index < count; index += 1) {
      context.fillStyle = random() < 0.5 ? 'rgba(0, 0, 0, 0.035)' : 'rgba(255, 255, 255, 0.05)';
      context.fillRect(
        opening.x + random() * opening.width,
        opening.y + random() * opening.height,
        1 + random(),
        1 + random(),
      );
    }
  } else if (mat.texture === 'linen') {
    context.lineWidth = Math.max(0.6, size * 0.0012);
    const step = Math.max(2, size * 0.004);
    for (let y = opening.y; y < opening.y + opening.height; y += step) {
      context.strokeStyle = `rgba(90, 70, 40, ${0.05 + random() * 0.07})`;
      context.beginPath();
      context.moveTo(opening.x, y);
      context.lineTo(opening.x + opening.width, y + (random() - 0.5) * step);
      context.stroke();
    }
    for (let x = opening.x; x < opening.x + opening.width; x += step) {
      context.strokeStyle = `rgba(255, 250, 235, ${0.05 + random() * 0.08})`;
      context.beginPath();
      context.moveTo(x, opening.y);
      context.lineTo(x + (random() - 0.5) * step, opening.y + opening.height);
      context.stroke();
    }
  } else if (mat.texture === 'velvet') {
    const sheen = context.createLinearGradient(opening.x, opening.y, opening.x + opening.width, opening.y + opening.height);
    sheen.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
    sheen.addColorStop(0.5, 'rgba(0, 0, 0, 0.1)');
    sheen.addColorStop(1, 'rgba(255, 255, 255, 0.05)');
    context.fillStyle = sheen;
    context.fillRect(opening.x, opening.y, opening.width, opening.height);
  }

  // The moulding's shadow falls onto the mat from the top left.
  const shadow = Math.max(2, size * 0.02);
  insetShadow(context, opening, shadow, style.floating ? 0.55 : 0.28);

  if (style.floating) {
    // The photo floats off the backing: a soft drop shadow under it.
    context.save();
    context.shadowColor = 'rgba(0, 0, 0, 0.6)';
    context.shadowBlur = Math.max(4, size * 0.03);
    context.shadowOffsetX = Math.max(1, size * 0.008);
    context.shadowOffsetY = Math.max(2, size * 0.014);
    context.fillStyle = '#1a1a1a';
    context.fillRect(photo.x, photo.y, photo.width, photo.height);
    context.restore();
  } else if (mat.bevel) {
    // The mat's cut edge: a thin bright bevel around the photo, darker on
    // the sides facing away from the light.
    const bevel = Math.max(1.5, size * 0.006);
    context.fillStyle = mat.bevel;
    context.fillRect(photo.x - bevel, photo.y - bevel, photo.width + 2 * bevel, photo.height + 2 * bevel);
    context.fillStyle = 'rgba(0, 0, 0, 0.12)';
    context.fillRect(photo.x + photo.width, photo.y - bevel, bevel, photo.height + 2 * bevel);
    context.fillRect(photo.x - bevel, photo.y + photo.height, photo.width + 2 * bevel, bevel);
  } else {
    context.fillStyle = 'rgba(0, 0, 0, 0.35)';
    const lip = Math.max(1, size * 0.003);
    context.fillRect(photo.x - lip, photo.y - lip, photo.width + 2 * lip, photo.height + 2 * lip);
  }
}

function insetShadow(context: CanvasRenderingContext2D, rect: Rect, depth: number, strength: number): void {
  const top = context.createLinearGradient(0, rect.y, 0, rect.y + depth);
  top.addColorStop(0, `rgba(0, 0, 0, ${strength})`);
  top.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.fillStyle = top;
  context.fillRect(rect.x, rect.y, rect.width, depth);
  const left = context.createLinearGradient(rect.x, 0, rect.x + depth, 0);
  left.addColorStop(0, `rgba(0, 0, 0, ${strength * 0.8})`);
  left.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.fillStyle = left;
  context.fillRect(rect.x, rect.y, depth, rect.height);
  const thin = depth * 0.35;
  const bottom = context.createLinearGradient(0, rect.y + rect.height, 0, rect.y + rect.height - thin);
  bottom.addColorStop(0, `rgba(0, 0, 0, ${strength * 0.4})`);
  bottom.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.fillStyle = bottom;
  context.fillRect(rect.x, rect.y + rect.height - thin, rect.width, thin);
}

/** Clip to one side's mitred trapezoid. */
function clipSide(context: CanvasRenderingContext2D, side: Side, tile: Rect, depth: number): void {
  const { width, height } = tile;
  context.beginPath();
  if (side === 'top') {
    context.moveTo(0, 0);
    context.lineTo(width, 0);
    context.lineTo(width - depth, depth);
    context.lineTo(depth, depth);
  } else if (side === 'right') {
    context.moveTo(width, 0);
    context.lineTo(width, height);
    context.lineTo(width - depth, height - depth);
    context.lineTo(width - depth, depth);
  } else if (side === 'bottom') {
    context.moveTo(width, height);
    context.lineTo(0, height);
    context.lineTo(depth, height - depth);
    context.lineTo(width - depth, height - depth);
  } else {
    context.moveTo(0, height);
    context.lineTo(0, 0);
    context.lineTo(depth, depth);
    context.lineTo(depth, height - depth);
  }
  context.closePath();
  context.clip();
}

/** How each face catches the top-left light: positive lightens. */
const SIDE_LIGHT: Record<Side, number> = { top: 0.9, left: 0.55, right: -0.55, bottom: -1 };

function drawMoulding(
  context: CanvasRenderingContext2D,
  style: FrameStyle,
  side: Side,
  tile: Rect,
  depth: number,
  random: () => number,
): void {
  const { width, height } = tile;
  // Gradient across the moulding, outer edge to inner edge.
  const [x0, y0, x1, y1] =
    side === 'top'
      ? [0, 0, 0, depth]
      : side === 'bottom'
        ? [0, height, 0, height - depth]
        : side === 'left'
          ? [0, 0, depth, 0]
          : [width, 0, width - depth, 0];
  const gradient = context.createLinearGradient(x0, y0, x1, y1);
  style.profile.forEach((color, index) => {
    gradient.addColorStop(index / (style.profile.length - 1), color);
  });
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  const along = side === 'top' || side === 'bottom';
  const length = along ? width : height;
  const across = (offset: number) => (side === 'top' || side === 'left' ? offset : (along ? height : width) - offset);

  if (style.grain) {
    // Long wavy grain lines running along the moulding.
    const lines = Math.round(depth * 0.9 * style.grain.density);
    for (let line = 0; line < lines; line += 1) {
      const offset = random() * depth;
      const wave = 0.6 + random() * 2.2;
      const period = length * (0.08 + random() * 0.25);
      const phase = random() * Math.PI * 2;
      context.strokeStyle = random() < 0.72 ? style.grain.color : style.grain.light;
      context.lineWidth = Math.max(0.5, depth * (0.004 + random() * 0.012));
      context.beginPath();
      for (let t = 0; t <= length; t += Math.max(4, length / 140)) {
        const o = across(offset + Math.sin(t / period + phase) * wave);
        if (along) {
          if (t === 0) context.moveTo(t, o);
          else context.lineTo(t, o);
        } else if (t === 0) context.moveTo(o, t);
        else context.lineTo(o, t);
      }
      context.stroke();
    }
    // A few knots and darker figure.
    for (let knot = 0; knot < Math.round(length / 900) + 1; knot += 1) {
      const t = random() * length;
      const o = across(depth * (0.25 + random() * 0.5));
      const radius = depth * (0.05 + random() * 0.08);
      const knotGradient = context.createRadialGradient(along ? t : o, along ? o : t, 0, along ? t : o, along ? o : t, radius * 2.5);
      knotGradient.addColorStop(0, 'rgba(40, 20, 8, 0.35)');
      knotGradient.addColorStop(1, 'rgba(40, 20, 8, 0)');
      context.fillStyle = knotGradient;
      context.fillRect(0, 0, width, height);
    }
  }

  if (style.brushed) {
    const lines = Math.round(depth * 2.5);
    for (let line = 0; line < lines; line += 1) {
      const offset = across(random() * depth);
      const start = random() * length;
      const run = length * (0.05 + random() * 0.4);
      context.strokeStyle = random() < 0.5 ? 'rgba(255, 255, 255, 0.16)' : 'rgba(40, 45, 50, 0.12)';
      context.lineWidth = Math.max(0.4, depth * 0.006);
      context.beginPath();
      if (along) {
        context.moveTo(start, offset);
        context.lineTo(start + run, offset);
      } else {
        context.moveTo(offset, start);
        context.lineTo(offset, start + run);
      }
      context.stroke();
    }
  }

  if (style.carving) {
    // Repeating leaves carved along the middle of the moulding.
    const leaf = depth * 0.42;
    const middle = depth * 0.42;
    for (let t = depth; t < length - depth; t += leaf * 0.9) {
      for (const [color, shift] of [
        [style.carving.dark, leaf * 0.06],
        [style.carving.light, -leaf * 0.04],
      ] as const) {
        context.fillStyle = color;
        context.beginPath();
        const cx = along ? t + shift : across(middle) + shift;
        const cy = along ? across(middle) + shift : t + shift;
        context.ellipse(cx, cy, along ? leaf * 0.38 : leaf * 0.2, along ? leaf * 0.2 : leaf * 0.38, Math.PI / 5, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  if (style.beads) {
    const radius = depth * 0.045;
    const offset = depth - radius * 2.2;
    for (let t = depth; t < length - depth; t += radius * 2.3) {
      const cx = along ? t : across(offset);
      const cy = along ? across(offset) : t;
      const bead = context.createRadialGradient(cx - radius * 0.35, cy - radius * 0.35, radius * 0.1, cx, cy, radius);
      bead.addColorStop(0, style.beads.light);
      bead.addColorStop(1, style.beads.color);
      context.fillStyle = bead;
      context.beginPath();
      context.arc(cx, cy, radius, 0, Math.PI * 2);
      context.fill();
    }
  }

  // Light and shade per face.
  const light = SIDE_LIGHT[side] * style.shading;
  context.fillStyle = light > 0 ? `rgba(255, 255, 255, ${light})` : `rgba(0, 0, 0, ${-light})`;
  context.fillRect(0, 0, width, height);
  // A bright highlight on the outer and inner lips.
  const lip = Math.max(1, depth * 0.03);
  context.fillStyle = `rgba(255, 255, 255, ${0.12 + Math.max(0, light)})`;
  if (side === 'top') context.fillRect(0, 0, width, lip);
  if (side === 'left') context.fillRect(0, 0, lip, height);
  context.fillStyle = 'rgba(0, 0, 0, 0.35)';
  if (side === 'top') context.fillRect(0, depth - lip, width, lip);
  if (side === 'bottom') context.fillRect(0, height - depth, width, lip);
  if (side === 'left') context.fillRect(depth - lip, 0, lip, height);
  if (side === 'right') context.fillRect(width - depth, 0, lip, height);
}

/** Carved rosettes over the mitred corners of the ornate frames. */
function drawCorners(context: CanvasRenderingContext2D, style: FrameStyle, tile: Rect, depth: number): void {
  const radius = depth * 0.48;
  for (const [cx, cy] of [
    [depth / 2, depth / 2],
    [tile.width - depth / 2, depth / 2],
    [tile.width - depth / 2, tile.height - depth / 2],
    [depth / 2, tile.height - depth / 2],
  ] as const) {
    const base = context.createRadialGradient(cx - radius * 0.3, cy - radius * 0.3, radius * 0.1, cx, cy, radius);
    base.addColorStop(0, '#fbe6a0');
    base.addColorStop(0.55, '#c99c3c');
    base.addColorStop(1, '#6e4c10');
    context.fillStyle = base;
    context.beginPath();
    for (let petal = 0; petal < 8; petal += 1) {
      const angle = (petal / 8) * Math.PI * 2;
      context.moveTo(cx, cy);
      context.ellipse(
        cx + Math.cos(angle) * radius * 0.5,
        cy + Math.sin(angle) * radius * 0.5,
        radius * 0.5,
        radius * 0.24,
        angle,
        0,
        Math.PI * 2,
      );
    }
    context.fill();
    context.fillStyle = style.carving?.dark ?? 'rgba(0,0,0,0.4)';
    context.beginPath();
    context.arc(cx, cy, radius * 0.2, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#f6dc8f';
    context.beginPath();
    context.arc(cx - radius * 0.06, cy - radius * 0.06, radius * 0.1, 0, Math.PI * 2);
    context.fill();
  }
}

function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
