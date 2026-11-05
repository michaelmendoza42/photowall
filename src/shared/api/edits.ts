// Light photo edits: the curator's non-destructive recipe for one photo.
//
// The original file is never changed. A recipe is stored beside the
// curation settings and applied when the server renders a photo's
// derivatives, so the wall, the focused view and share links all show
// the edited photo. The browser editor previews the same recipe with
// Pixi, and both sides build colors from `editColorMatrix` so the
// preview and the rendered photo agree.

/** Quarter turns, clockwise. */
export type EditRotation = 0 | 90 | 180 | 270;

/**
 * Crop rectangle as fractions of the photo after its quarter turn
 * (`rotation`), before straightening: {0, 0, 1, 1} keeps everything.
 */
export interface EditCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One-click looks: Pixi ColorMatrixFilter presets. */
export const EDIT_LOOKS = [
  'none',
  'greyscale',
  'blackAndWhite',
  'sepia',
  'vintage',
  'polaroid',
  'kodachrome',
  'technicolor',
  'browni',
  'lsd',
  'night',
  'predator',
  'negative',
  'toBGR',
] as const;

export type EditLook = (typeof EDIT_LOOKS)[number];

export interface PhotoEdit {
  rotation: EditRotation;
  /** Degrees clockwise; the photo zooms in so no blank corners show. */
  straighten: number;
  /** Mirror left-right / top-bottom, as seen after the quarter turn. */
  flipX: boolean;
  flipY: boolean;
  crop: EditCrop;
  /** White balance, -1..1: negative is cooler (bluer), positive warmer. */
  temperature: number;
  /** Stops, -2..2: each stop doubles (or halves) all the light. */
  exposure: number;
  /** -1..1; lifts or drops every tone evenly. 0 leaves the photo as it is. */
  brightness: number;
  contrast: number;
  saturation: number;
  /** Degrees around the color wheel, -180..180. */
  hue: number;
  /** 0..100; at 100 the blur radius is 1% of the photo's long edge. */
  blur: number;
  /** 0..100 film grain. */
  grain: number;
  look: EditLook;
}

export const EDIT_LIMITS = {
  straighten: 45,
  temperature: 1,
  exposure: 2,
  brightness: 1,
  contrast: 1,
  saturation: 1,
  hue: 180,
  blur: 100,
  grain: 100,
  /** Smallest crop side, as a fraction of the photo. */
  minCrop: 0.02,
} as const;

export const FULL_CROP: EditCrop = { x: 0, y: 0, w: 1, h: 1 };

export const NEUTRAL_EDIT: PhotoEdit = {
  rotation: 0,
  straighten: 0,
  flipX: false,
  flipY: false,
  crop: FULL_CROP,
  temperature: 0,
  exposure: 0,
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
  blur: 0,
  grain: 0,
  look: 'none',
};

export function curationPhotoEditPath(photoId: string): string {
  return `/api/curation/photos/${encodeURIComponent(photoId)}/edit`;
}

export interface PhotoEditRequest {
  edit: PhotoEdit;
}

/**
 * Clamp every field into range and round away float noise, so equal
 * edits serialize (and version) identically.
 */
export function normalizeEdit(edit: PhotoEdit): PhotoEdit {
  const round = (value: number, places: number) => {
    const factor = 10 ** places;
    return Math.round(value * factor) / factor;
  };
  const clamp = (value: number, limit: number) => Math.min(limit, Math.max(-limit, value));
  const min = EDIT_LIMITS.minCrop;
  const w = round(Math.min(1, Math.max(min, edit.crop.w)), 5);
  const h = round(Math.min(1, Math.max(min, edit.crop.h)), 5);
  return {
    rotation: edit.rotation,
    straighten: round(clamp(edit.straighten, EDIT_LIMITS.straighten), 2),
    flipX: edit.flipX,
    flipY: edit.flipY,
    crop: {
      x: round(Math.min(1 - w, Math.max(0, edit.crop.x)), 5),
      y: round(Math.min(1 - h, Math.max(0, edit.crop.y)), 5),
      w,
      h,
    },
    temperature: round(clamp(edit.temperature, EDIT_LIMITS.temperature), 3),
    exposure: round(clamp(edit.exposure, EDIT_LIMITS.exposure), 3),
    brightness: round(clamp(edit.brightness, EDIT_LIMITS.brightness), 3),
    contrast: round(clamp(edit.contrast, EDIT_LIMITS.contrast), 3),
    saturation: round(clamp(edit.saturation, EDIT_LIMITS.saturation), 3),
    hue: round(clamp(edit.hue, EDIT_LIMITS.hue), 1),
    blur: round(Math.min(EDIT_LIMITS.blur, Math.max(0, edit.blur)), 1),
    grain: round(Math.min(EDIT_LIMITS.grain, Math.max(0, edit.grain)), 1),
    look: edit.look,
  };
}

/** True when the edit changes nothing, so there is nothing to store. */
export function isNeutralEdit(edit: PhotoEdit): boolean {
  return editVersion(normalizeEdit(edit)) === editVersion(NEUTRAL_EDIT);
}

export function hasGeometry(edit: PhotoEdit): boolean {
  const { crop } = edit;
  return (
    edit.rotation !== 0 ||
    edit.straighten !== 0 ||
    edit.flipX ||
    edit.flipY ||
    crop.x !== 0 ||
    crop.y !== 0 ||
    crop.w !== 1 ||
    crop.h !== 1
  );
}

/**
 * Short stable fingerprint of an edit (FNV-1a over its normalized
 * fields), used in media URLs and derivative cache keys.
 */
export function editVersion(edit: PhotoEdit): string {
  const e = normalizeEdit(edit);
  const text = [
    e.rotation,
    e.straighten,
    e.flipX ? 1 : 0,
    e.flipY ? 1 : 0,
    e.crop.x,
    e.crop.y,
    e.crop.w,
    e.crop.h,
    e.temperature,
    e.exposure,
    e.brightness,
    e.contrast,
    e.saturation,
    e.hue,
    e.blur,
    e.grain,
    e.look,
  ].join('|');
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** Width and height of the photo after its quarter turn. */
export function turnedSize(
  width: number,
  height: number,
  rotation: EditRotation,
): { width: number; height: number } {
  return rotation === 90 || rotation === 270 ? { width: height, height: width } : { width, height };
}

/** Pixel size of the edited photo, given the original's display size. */
export function editedSize(
  width: number,
  height: number,
  edit: PhotoEdit,
): { width: number; height: number } {
  const turned = turnedSize(width, height, edit.rotation);
  return {
    width: Math.max(1, Math.round(turned.width * edit.crop.w)),
    height: Math.max(1, Math.round(turned.height * edit.crop.h)),
  };
}

/**
 * How much a photo straightened by `degrees` must grow so it still
 * covers its own `width` × `height` frame with no blank corners.
 */
export function straightenCover(width: number, height: number, degrees: number): number {
  const t = (Math.abs(degrees) * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  return Math.max((width * cos + height * sin) / width, (width * sin + height * cos) / height);
}

/** Grain amplitude in 0..1 color units (Pixi NoiseFilter `noise`). */
export function grainNoise(grain: number): number {
  return (grain / 100) * 0.5;
}

/** Blur sigma in pixels for an image whose long edge is `longEdge` px. */
export function blurSigma(blur: number, longEdge: number): number {
  return (blur / 100) * 0.01 * longEdge;
}

/**
 * A 4×5 color matrix, row-major like Pixi's ColorMatrixFilter: each
 * output channel is a weighted sum of r, g, b, a (0..1) plus an offset.
 */
export type ColorMatrix = number[];

const IDENTITY: ColorMatrix = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];

/**
 * The edit's color adjustments as one matrix, or null when colors are
 * untouched. Applied in this order: temperature, exposure, brightness,
 * contrast, saturation, hue, then the look. The matrices are Pixi's (MIT), so the editor's
 * ColorMatrixFilter shows exactly what the server renders.
 */
export function editColorMatrix(edit: PhotoEdit): ColorMatrix | null {
  const steps: ColorMatrix[] = [];
  if (edit.temperature !== 0) steps.push(temperatureMatrix(edit.temperature));
  if (edit.exposure !== 0) steps.push(exposureMatrix(2 ** edit.exposure));
  if (edit.brightness !== 0) steps.push(brightnessMatrix(edit.brightness));
  if (edit.contrast !== 0) steps.push(contrastMatrix(edit.contrast));
  if (edit.saturation !== 0) steps.push(saturateMatrix(edit.saturation));
  if (edit.hue !== 0) steps.push(hueMatrix(edit.hue));
  if (edit.look !== 'none') steps.push(LOOK_MATRICES[edit.look]);
  if (steps.length === 0) return null;
  // Later steps wrap earlier ones: M = look · hue · … · temperature.
  return steps.reduce((applied, step) => multiplyColorMatrices(step, applied), IDENTITY);
}

/** `a · b`: apply b first, then a. Same arithmetic as Pixi's `_multiply`. */
export function multiplyColorMatrices(a: ColorMatrix, b: ColorMatrix): ColorMatrix {
  const out = new Array<number>(20);
  for (let row = 0; row < 4; row++) {
    const r = row * 5;
    for (let col = 0; col < 5; col++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[r + k]! * b[k * 5 + col]!;
      out[r + col] = col === 4 ? sum + a[r + 4]! : sum;
    }
  }
  return out;
}

/** Warmer boosts red and cuts blue (with a touch of green); cooler the reverse. */
function temperatureMatrix(t: number): ColorMatrix {
  const r = 1 + 0.2 * t;
  const g = 1 + 0.03 * t;
  const b = 1 - 0.2 * t;
  return [r, 0, 0, 0, 0, 0, g, 0, 0, 0, 0, 0, b, 0, 0, 0, 0, 0, 1, 0];
}

/** Gain on every channel (Pixi's `brightness`). */
function exposureMatrix(gain: number): ColorMatrix {
  return [gain, 0, 0, 0, 0, 0, gain, 0, 0, 0, 0, 0, gain, 0, 0, 0, 0, 0, 1, 0];
}

/** An even lift: at ±1 every channel moves by a quarter of full scale. */
function brightnessMatrix(amount: number): ColorMatrix {
  const o = 0.25 * amount;
  return [1, 0, 0, 0, o, 0, 1, 0, 0, o, 0, 0, 1, 0, o, 0, 0, 0, 1, 0];
}

function contrastMatrix(amount: number): ColorMatrix {
  const v = amount + 1;
  const o = -0.5 * (v - 1);
  return [v, 0, 0, 0, o, 0, v, 0, 0, o, 0, 0, v, 0, o, 0, 0, 0, 1, 0];
}

function saturateMatrix(amount: number): ColorMatrix {
  const x = (amount * 2) / 3 + 1;
  const y = (x - 1) * -0.5;
  return [x, y, y, 0, 0, y, x, y, 0, 0, y, y, x, 0, 0, 0, 0, 0, 1, 0];
}

function hueMatrix(degrees: number): ColorMatrix {
  const rotation = (degrees / 180) * Math.PI;
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);
  const w = 1 / 3;
  const sqrW = Math.sqrt(w);
  const a00 = cosR + (1 - cosR) * w;
  const a01 = w * (1 - cosR) - sqrW * sinR;
  const a02 = w * (1 - cosR) + sqrW * sinR;
  const a10 = w * (1 - cosR) + sqrW * sinR;
  const a11 = cosR + w * (1 - cosR);
  const a12 = w * (1 - cosR) - sqrW * sinR;
  const a20 = w * (1 - cosR) - sqrW * sinR;
  const a21 = w * (1 - cosR) + sqrW * sinR;
  const a22 = cosR + w * (1 - cosR);
  return [a00, a01, a02, 0, 0, a10, a11, a12, 0, 0, a20, a21, a22, 0, 0, 0, 0, 0, 1, 0];
}

const NIGHT = 0.1;

const LOOK_MATRICES: Record<Exclude<EditLook, 'none'>, ColorMatrix> = {
  greyscale: [0.5, 0.5, 0.5, 0, 0, 0.5, 0.5, 0.5, 0, 0, 0.5, 0.5, 0.5, 0, 0, 0, 0, 0, 1, 0],
  blackAndWhite: [0.3, 0.6, 0.1, 0, 0, 0.3, 0.6, 0.1, 0, 0, 0.3, 0.6, 0.1, 0, 0, 0, 0, 0, 1, 0],
  sepia: [
    0.393, 0.7689999, 0.18899999, 0, 0, 0.349, 0.6859999, 0.16799999, 0, 0, 0.272, 0.5339999,
    0.13099999, 0, 0, 0, 0, 0, 1, 0,
  ],
  vintage: [
    0.6279345635605994, 0.3202183420819367, -0.03965408211312453, 0, 0.037848179746251466,
    0.02578397704808868, 0.6441188644374771, 0.03259127616149294, 0, 0.029265996770472907,
    0.0466055556782719, -0.0851232987247891, 0.5241648018700465, 0, 0.020232119953863904, 0, 0, 0,
    1, 0,
  ],
  polaroid: [
    1.438, -0.062, -0.062, 0, 0, -0.122, 1.378, -0.122, 0, 0, -0.016, -0.016, 1.483, 0, 0, 0, 0, 0,
    1, 0,
  ],
  kodachrome: [
    1.1285582396593525, -0.3967382283601348, -0.03992559172921793, 0, 0.24991995145868634,
    -0.16404339962244616, 1.0835251566291304, -0.05498805115633132, 0, 0.09698983488904393,
    -0.16786010706155763, -0.5603416277695248, 1.6014850761964943, 0, 0.13972481597886063, 0, 0, 0,
    1, 0,
  ],
  technicolor: [
    1.9125277891456083, -0.8545344976951645, -0.09155508482755585, 0, 0.046249425232852304,
    -0.3087833385928097, 1.7658908555458428, -0.10601743074722245, 0, -0.2758903984886823,
    -0.231103377548616, -0.7501899197440212, 1.847597816108189, 0, 0.12137623870388682, 0, 0, 0, 1,
    0,
  ],
  browni: [
    0.5997023498159715, 0.34553243048391263, -0.2708298674538042, 0, 0.1860075629647401,
    -0.037703249837783157, 0.8609577587992641, 0.15059552388459913, 0, -0.14497417640467167,
    0.24113635128153335, -0.07441037908422492, 0.44972182064877153, 0, -0.029655197167024642, 0, 0,
    0, 1, 0,
  ],
  lsd: [2, -0.4, 0.5, 0, 0, -0.5, 2, -0.4, 0, 0, -0.4, -0.5, 3, 0, 0, 0, 0, 0, 1, 0],
  night: [
    NIGHT * -2, -NIGHT, 0, 0, 0, -NIGHT, 0, NIGHT, 0, 0, 0, NIGHT, NIGHT * 2, 0, 0, 0, 0, 0, 1, 0,
  ],
  predator: [
    11.224130630493164, -4.794486999511719, -2.8746118545532227, 0, 0.40342438220977783,
    -3.6330697536468506, 9.193157196044922, -2.951810836791992, 0, -1.316135048866272,
    -3.2184197902679443, -4.2375030517578125, 7.476448059082031, 0, 0.8044459223747253, 0, 0, 0, 1,
    0,
  ],
  negative: [-1, 0, 0, 1, 0, 0, -1, 0, 1, 0, 0, 0, -1, 1, 0, 0, 0, 0, 1, 0],
  toBGR: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0],
};

/**
 * Apply a color matrix to 8-bit RGB pixels in place (opaque, so the
 * alpha column counts as 1). Clamps like the GPU does.
 */
export function applyColorMatrixToRgb(
  pixels: Uint8Array,
  channels: number,
  m: ColorMatrix,
): void {
  const o0 = (m[3]! + m[4]!) * 255;
  const o1 = (m[8]! + m[9]!) * 255;
  const o2 = (m[13]! + m[14]!) * 255;
  for (let i = 0; i + 2 < pixels.length; i += channels) {
    const r = pixels[i]!;
    const g = pixels[i + 1]!;
    const b = pixels[i + 2]!;
    pixels[i] = clampByte(m[0]! * r + m[1]! * g + m[2]! * b + o0);
    pixels[i + 1] = clampByte(m[5]! * r + m[6]! * g + m[7]! * b + o1);
    pixels[i + 2] = clampByte(m[10]! * r + m[11]! * g + m[12]! * b + o2);
  }
}

function clampByte(value: number): number {
  return value <= 0 ? 0 : value >= 255 ? 255 : Math.round(value);
}
