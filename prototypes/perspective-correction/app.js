import * as g from './geometry.js';
import { detect, findStraightChains, loadCv } from './detect.js';
import { WarpRenderer } from './render.js';
import { lensProfile } from './lenses.js';

const STORE_KEY = 'perspective-proto:v1';
const DEFAULT_FOCAL35 = 28;
const SLIDERS = [
  { key: 'vertical', label: 'Vertical', min: -40, max: 40, step: 0.1, unit: '°' },
  { key: 'horizontal', label: 'Horizontal', min: -40, max: 40, step: 0.1, unit: '°' },
  { key: 'rotate', label: 'Rotate', min: -45, max: 45, step: 0.1, unit: '°' },
  { key: 'focal35', label: 'Focal length (35mm eq.)', min: 12, max: 120, step: 0.5, unit: 'mm' },
  { key: 'distortion', label: 'Distortion', min: -100, max: 100, step: 1, unit: '', group: 'lens' },
];

const $ = (id) => document.getElementById(id);
const samples = await (await fetch('samples/samples.json')).json();
const edits = loadEdits();
let current = 0;
let mode = 'edit'; // 'edit' | 'guided'
let before = false;
let drag = null;

// ---- Persistence ---------------------------------------------------------

function loadEdits() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
}
function saveEdits() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(edits)); } catch { /* private mode */ }
}
function defaultEdit(s) {
  return {
    vertical: 0, horizontal: 0, rotate: 0, focal35: s.focal35 || DEFAULT_FOCAL35,
    // Off by default: camera JPEGs usually have most distortion corrected
    // in-camera already. Auto decides from the photo's own straight edges.
    lensProfile: false, distortion: 0,
    crop: 'fill', quad: null, auto: null,
  };
}
function editOf(s) {
  // Merge defaults so edits saved before a field existed still work.
  return (edits[s.name] = { ...defaultEdit(s), ...edits[s.name] });
}
function profileOf(s) {
  return lensProfile(s.lens);
}
/** Lens model for an edit; points from the photo go through it before any perspective math. */
function lensOf(s, e) {
  return g.lensModel(s.width, s.height, e, profileOf(s));
}
function modelQuad(s, e, quad = e.quad) {
  const L = lensOf(s, e);
  return quad.map((p) => g.undistort(L, p));
}

// ---- Images --------------------------------------------------------------

const images = new Map();
const thumbs = new Map();
function image(s) {
  if (!images.has(s.name)) {
    images.set(s.name, new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = s.file;
    }));
  }
  return images.get(s.name);
}
async function thumbSource(s) {
  if (!thumbs.has(s.name)) {
    thumbs.set(s.name, image(s).then((img) => createImageBitmap(img, { resizeWidth: Math.round(s.width * 0.3), resizeQuality: 'high' })));
  }
  return thumbs.get(s.name);
}

// ---- View geometry -------------------------------------------------------

function view(s, e, { corrected = true } = {}) {
  const Hm = corrected ? g.homography(s.width, s.height, e) : [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const L = corrected ? lensOf(s, e) : null;
  const outline = g.warpedOutline(s.width, s.height, Hm, L);
  const whole = g.bounds(outline);
  let crop = whole;
  if (corrected && e.crop === 'frame' && e.quad) crop = g.quadRect(e.quad, Hm, L);
  else if (corrected && e.crop !== 'none') crop = g.inscribedRect(outline, s.width / s.height);
  if (!(crop.w > 1 && crop.h > 1)) crop = whole;
  return { Hm, L, outline, whole, crop };
}

/** Fit a rect into a canvas; returns canvas↔output transforms. */
function fit(rect, cw, ch, pad = 0) {
  const s = Math.min((cw - 2 * pad) / rect.w, (ch - 2 * pad) / rect.h);
  const ox = (cw - rect.w * s) / 2, oy = (ch - rect.h * s) / 2;
  return {
    s,
    toCanvas: ([x, y]) => [(x - rect.x) * s + ox, (y - rect.y) * s + oy],
    toOutput: ([x, y]) => [(x - ox) / s + rect.x, (y - oy) / s + rect.y],
    S: [1 / s, 0, rect.x - ox / s, 0, 1 / s, rect.y - oy / s, 0, 0, 1],
  };
}

// ---- Stage ---------------------------------------------------------------

const glCanvas = $('gl'), overlay = $('overlay'), stage = $('stage');
const renderer = new WarpRenderer(glCanvas);
const octx = overlay.getContext('2d');
let stageFit = null;

function resizeStage() {
  const dpr = window.devicePixelRatio || 1;
  const r = stage.getBoundingClientRect();
  for (const c of [glCanvas, overlay]) {
    c.width = Math.max(1, Math.round(r.width * dpr));
    c.height = Math.max(1, Math.round(r.height * dpr));
  }
}

async function drawStage() {
  const s = samples[current], e = editOf(s);
  const img = await image(s);
  if (s !== samples[current]) return;
  const dpr = window.devicePixelRatio || 1;
  const corrected = mode === 'edit' && !before;
  const v = view(s, e, { corrected });
  const showWhole = !corrected || $('whole').checked;
  const rect = showWhole ? v.whole : v.crop;
  const f = (stageFit = { ...fit(rect, glCanvas.width, glCanvas.height, 16 * dpr), v, corrected });
  renderer.draw(s.name, img, g.mul(g.inv(v.Hm), f.S), s.width, s.height, undefined, v.L);

  octx.clearRect(0, 0, overlay.width, overlay.height);
  const toC = (p) => f.toCanvas(g.project(v.Hm, g.undistort(v.L, p))); // source px → canvas
  if (corrected && showWhole) {
    const c = v.crop, a = f.toCanvas([c.x, c.y]), b = f.toCanvas([c.x + c.w, c.y + c.h]);
    octx.save();
    octx.fillStyle = 'rgba(0,0,0,.45)';
    octx.beginPath();
    octx.rect(0, 0, overlay.width, overlay.height);
    octx.rect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
    octx.fill('evenodd');
    octx.strokeStyle = '#f2b24c'; octx.lineWidth = 1.5 * dpr; octx.setLineDash([6 * dpr, 4 * dpr]);
    octx.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
    octx.restore();
  }
  if (!showWhole) maskOutside(octx, f, rect, overlay.width, overlay.height, '#0b0b0c');
  if ($('grid').checked) drawGrid(f, rect, dpr);
  if ($('debug').checked && e.auto?.segments) {
    octx.save();
    octx.lineWidth = 2 * dpr;
    for (const seg of e.auto.segments) {
      octx.strokeStyle = seg.family === 'v' ? 'rgba(90,200,255,.9)' : 'rgba(255,120,200,.9)';
      octx.beginPath(); octx.moveTo(...toC(seg.a)); octx.lineTo(...toC(seg.b)); octx.stroke();
    }
    octx.restore();
  }
  if (e.quad && (mode === 'guided' || $('debug').checked)) drawQuad(e.quad.map(toC), dpr, mode === 'guided');
  if (mode === 'guided' && drag) drawLoupe(img, e.quad[drag.index], toC(e.quad[drag.index]), dpr);

  const hint = $('hint');
  hint.hidden = !(before || mode === 'guided');
  hint.textContent = before ? 'Before' : 'Drag the corners onto the frame, then press Done';
}

/** Paint over everything outside the crop (the letterbox would show the rest of the photo). */
function maskOutside(ctx, f, rect, w, h, color) {
  const a = f.toCanvas([rect.x, rect.y]), b = f.toCanvas([rect.x + rect.w, rect.y + rect.h]);
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.rect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
  ctx.fill('evenodd');
  ctx.restore();
}

function drawGrid(f, rect, dpr) {
  const a = f.toCanvas([rect.x, rect.y]), b = f.toCanvas([rect.x + rect.w, rect.y + rect.h]);
  octx.save();
  octx.strokeStyle = 'rgba(255,255,255,.28)'; octx.lineWidth = dpr;
  const n = 8;
  for (let i = 1; i < n; i++) {
    const x = a[0] + ((b[0] - a[0]) * i) / n, y = a[1] + ((b[1] - a[1]) * i) / n;
    octx.beginPath(); octx.moveTo(x, a[1]); octx.lineTo(x, b[1]); octx.moveTo(a[0], y); octx.lineTo(b[0], y); octx.stroke();
  }
  octx.restore();
}

function drawQuad(pts, dpr, handles) {
  octx.save();
  octx.strokeStyle = '#6cc98a'; octx.lineWidth = 2 * dpr;
  octx.beginPath(); pts.forEach((p, i) => (i ? octx.lineTo(...p) : octx.moveTo(...p))); octx.closePath(); octx.stroke();
  if (handles) {
    for (const p of pts) {
      octx.beginPath(); octx.arc(p[0], p[1], 9 * dpr, 0, Math.PI * 2);
      octx.fillStyle = 'rgba(108,201,138,.25)'; octx.fill(); octx.stroke();
    }
  }
  octx.restore();
}

function drawLoupe(img, src, at, dpr) {
  const R = 70 * dpr, zoom = 4 * dpr, half = R / zoom;
  const cx = at[0] + (at[0] > overlay.width / 2 ? -1 : 1) * (R + 30 * dpr);
  const cy = Math.max(R + 8, Math.min(overlay.height - R - 8, at[1] - R - 30 * dpr));
  octx.save();
  octx.beginPath(); octx.arc(cx, cy, R, 0, Math.PI * 2); octx.clip();
  octx.fillStyle = '#000'; octx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  octx.drawImage(img, src[0] - half, src[1] - half, half * 2, half * 2, cx - R, cy - R, 2 * R, 2 * R);
  octx.strokeStyle = '#6cc98a'; octx.lineWidth = dpr;
  octx.beginPath(); octx.moveTo(cx - R, cy); octx.lineTo(cx + R, cy); octx.moveTo(cx, cy - R); octx.lineTo(cx, cy + R); octx.stroke();
  octx.restore();
  octx.beginPath(); octx.arc(cx, cy, R, 0, Math.PI * 2); octx.strokeStyle = '#fff'; octx.lineWidth = 2 * dpr; octx.stroke();
}

// ---- Guided frame dragging -----------------------------------------------

function canvasPoint(ev) {
  const r = overlay.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  return [(ev.clientX - r.left) * dpr, (ev.clientY - r.top) * dpr];
}

overlay.addEventListener('pointerdown', (ev) => {
  if (mode !== 'guided' || !stageFit) return;
  const s = samples[current], e = editOf(s), dpr = window.devicePixelRatio || 1;
  const p = canvasPoint(ev);
  let best = -1, bestD = 28 * dpr;
  e.quad.forEach((q, i) => {
    const c = stageFit.toCanvas(q), d = Math.hypot(c[0] - p[0], c[1] - p[1]);
    if (d < bestD) { bestD = d; best = i; }
  });
  if (best < 0) return;
  const c = stageFit.toCanvas(e.quad[best]);
  drag = { index: best, offset: [c[0] - p[0], c[1] - p[1]] };
  overlay.setPointerCapture(ev.pointerId);
  drawStage();
});
overlay.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  const s = samples[current], e = editOf(s), p = canvasPoint(ev);
  const q = stageFit.toOutput([p[0] + drag.offset[0], p[1] + drag.offset[1]]);
  e.quad[drag.index] = [Math.max(0, Math.min(s.width, q[0])), Math.max(0, Math.min(s.height, q[1]))];
  applyQuad(s, e, 'manual');
  syncPanel();
  drawStage();
});
overlay.addEventListener('pointerup', () => {
  if (!drag) return;
  drag = null;
  saveEdits(); drawStage(); drawThumb(current);
});

function applyQuad(s, e, method) {
  e.quad = g.orderCorners(e.quad);
  Object.assign(e, g.solveFromQuad(s.width, s.height, modelQuad(s, e), e.focal35));
  if (method === 'manual') e.auto = { ...(e.auto || {}), method: 'manual' };
}

// ---- Auto ----------------------------------------------------------------

/**
 * mode 'framed': find the picture frame and make it a true rectangle.
 * mode 'general': ignore frames; fix verticals and tilt from the photo's
 * lines, plus the side-on angle when its horizontals agree.
 */
async function runAuto(index, { quiet = false, mode = 'framed' } = {}) {
  const s = samples[index], e = editOf(s);
  if (!quiet) setStatus('Loading OpenCV…');
  await loadCv();
  const img = await image(s);
  const profile = profileOf(s);
  const t0 = performance.now();
  // Lens first: does the profile straighten the photo's long straight edges,
  // or was the JPEG already corrected in-camera? (A per-photo fit of the
  // leftover amount proved too noisy to trust, so the manual slider is left alone.)
  const chains = g.usableChains(await findStraightChains(img), s.width, s.height);
  let lensVerdict = 'none';
  if (profile && chains.length >= 5) {
    const off = g.bendCost(chains, g.lensModel(s.width, s.height, { ...e, lensProfile: false }, profile));
    const on = g.bendCost(chains, g.lensModel(s.width, s.height, { ...e, lensProfile: true }, profile));
    e.lensProfile = on < off * 0.7;
    lensVerdict = { on, off };
  }
  const L = lensOf(s, e);
  const r = await detect(img, (p) => g.undistort(L, p), (p) => g.distort(L, p), { mode });
  const ms = Math.round(performance.now() - t0);
  const focal35 = s.focal35 || DEFAULT_FOCAL35;
  const MAX_AUTO_DEG = 25;
  const sane = (p) => ['vertical', 'horizontal', 'rotate'].every((k) => Math.abs(p[k]) <= MAX_AUTO_DEG);
  if (r.method === 'frame' && !sane(g.solveFromQuad(s.width, s.height, modelQuad(s, e, r.quad), focal35))) r.method = 'rejected';
  // Without a frame, large corrections are more likely wrong than right:
  // drop a side-on angle over 10°, and a vertical one over 10°.
  if (r.method === 'lines' && r.vpH && Math.abs(g.solveFromVanishingPoints(s.width, s.height, r.vpH, r.vpV, focal35).horizontal) > 10) r.vpH = null;
  if (r.method === 'lines' && r.vpV && Math.abs(g.solveFromVanishingPoints(s.width, s.height, null, r.vpV, focal35).vertical) > 10) r.vpV = null;
  if (r.method === 'lines' && !r.vpV && !r.vpH) r.method = 'none';
  if (r.method === 'lines' && !sane(g.solveFromVanishingPoints(s.width, s.height, r.vpH, r.vpV, focal35))) r.method = 'rejected';
  let note = '';
  if (r.method === 'frame') {
    const mq = modelQuad(s, e, r.quad);
    const { horizontal, vertical } = g.quadVanishingPoints(mq);
    const implied = g.focal35FromVanishingPoints(s.width, s.height, horizontal, vertical);
    Object.assign(e, { quad: r.quad, crop: 'fill', focal35 }, g.solveFromQuad(s.width, s.height, mq, focal35));
    note = `Frame found (${(r.support * 100).toFixed(0)}% of lines agree; ${r.snapped}/4 sides snapped to edges).\nLens ${focal35}mm from EXIF` +
      (implied ? `; the frame alone implies ${implied.toFixed(0)}mm.` : '.');
  } else if (r.method === 'lines') {
    Object.assign(e, { quad: null, crop: 'fill', focal35 }, g.solveFromVanishingPoints(s.width, s.height, r.vpH, r.vpV, focal35));
    const nv = r.segments.filter((x) => x.family === 'v').length;
    note = mode === 'general'
      ? `General: ${r.vpV ? `verticals from ${nv} lines` : 'no clear verticals'}` +
        (r.vpH ? `, side-on angle from horizontals (${(r.hSupport * 100).toFixed(0)}% agree).` : '; horizontals not clear enough, side-on angle left alone.')
      : `No closed frame; straightened verticals from ${nv} lines.\nTry Auto: General, or Adjust frame to fix the side-on angle too.`;
  } else if (r.method === 'rejected') {
    note = `Detection disagreed with itself (over ${MAX_AUTO_DEG}°), so nothing was applied.\nUse Adjust frame or the sliders.`;
    r.method = 'none';
  } else {
    note = 'Nothing usable found. Use Adjust frame or the sliders.';
  }
  for (const k of ['vertical', 'horizontal', 'rotate']) e[k] = Math.max(-45, Math.min(45, e[k]));
  const lensNote = !profile ? `Lens: no profile for ${s.lens || 'this lens'}.`
    : lensVerdict === 'none' ? 'Lens: too few long straight edges to judge; profile left as is.'
    : e.lensProfile ? `Lens: ${profile.name} profile applied (edges ${(lensVerdict.off / lensVerdict.on).toFixed(1)}× straighter, ${chains.length} checked).`
    : `Lens: already corrected in-camera; the profile would bend edges ${(lensVerdict.on / lensVerdict.off).toFixed(1)}× more (${chains.length} checked).`;
  e.auto = { method: r.method, mode, segments: r.segments, note: `${note}\n${lensNote}\n${ms} ms` };
  saveEdits();
  if (index === current) { syncPanel(); drawStage(); }
  drawThumb(index);
}

function setStatus(text) { $('status').textContent = text; }

// ---- Panel ---------------------------------------------------------------

const sliderEls = {};
for (const def of SLIDERS) {
  const wrap = document.createElement('div');
  wrap.className = 'slider';
  wrap.innerHTML = `<label>${def.label}</label><output></output>
    <input type="range" min="${def.min}" max="${def.max}" step="${def.step}">`;
  const input = wrap.querySelector('input'), out = wrap.querySelector('output');
  input.addEventListener('input', () => {
    const s = samples[current], e = editOf(s);
    e[def.key] = Number(input.value);
    if (e.auto && e.auto.method !== 'manual') e.auto = { ...e.auto, method: 'manual' };
    out.textContent = fmt(def, e[def.key]);
    drawStage();
  });
  input.addEventListener('change', () => { saveEdits(); drawThumb(current); });
  wrap.querySelector('label').addEventListener('dblclick', () => {
    const s = samples[current], e = editOf(s);
    e[def.key] = def.key === 'focal35' ? s.focal35 || DEFAULT_FOCAL35 : 0;
    saveEdits(); syncPanel(); drawStage(); drawThumb(current);
  });
  sliderEls[def.key] = { input, out, def };
  $(def.group || 'sliders').appendChild(wrap);
}
const fmt = (def, v) =>
  def.key === 'focal35' ? `${v.toFixed(1)}${def.unit}` :
  def.key === 'distortion' ? `${v > 0 ? '+' : ''}${v.toFixed(0)}` :
  `${v > 0 ? '+' : ''}${v.toFixed(1)}${def.unit}`;

function syncPanel() {
  const s = samples[current], e = editOf(s);
  for (const { input, out, def } of Object.values(sliderEls)) {
    input.value = e[def.key];
    out.textContent = fmt(def, e[def.key]);
  }
  const profile = profileOf(s);
  $('lensProfile').checked = e.lensProfile;
  $('lensProfile').disabled = !profile;
  $('lensName').textContent = profile ? `${profile.name} · Lensfun` : `No profile for ${s.lens || 'unknown lens'}`;
  for (const b of $('crop').querySelectorAll('button')) {
    b.classList.toggle('on', b.dataset.crop === e.crop);
    b.disabled = b.dataset.crop === 'frame' && !e.quad;
  }
  $('guided').textContent = mode === 'guided' ? 'Done' : 'Adjust frame';
  $('guided').classList.toggle('on', mode === 'guided');
  setStatus(e.auto?.note ? (e.auto.method === 'manual' ? `${e.auto.note.split('\n')[0]}\nAdjusted by hand since.` : e.auto.note) : 'Not run yet.');
}

$('crop').addEventListener('click', (ev) => {
  const b = ev.target.closest('button'); if (!b || b.disabled) return;
  editOf(samples[current]).crop = b.dataset.crop;
  saveEdits(); syncPanel(); drawStage(); drawThumb(current);
});
$('auto').addEventListener('click', () => runAuto(current).catch((err) => setStatus(String(err))));
$('autoGeneral').addEventListener('click', () => runAuto(current, { mode: 'general' }).catch((err) => setStatus(String(err))));
$('guided').addEventListener('click', toggleGuided);
$('reset').addEventListener('click', () => {
  const s = samples[current];
  edits[s.name] = defaultEdit(s);
  mode = 'edit';
  saveEdits(); syncPanel(); drawStage(); drawThumb(current);
});
$('resetAll').addEventListener('click', () => {
  samples.forEach((s) => (edits[s.name] = defaultEdit(s)));
  mode = 'edit';
  saveEdits(); syncPanel(); drawStage(); samples.forEach((_, i) => drawThumb(i));
});
$('autoAll').addEventListener('click', async () => {
  const btn = $('autoAll');
  btn.disabled = true;
  try {
    for (let i = 0; i < samples.length; i++) {
      btn.textContent = `Auto ${i + 1}/${samples.length}…`;
      await runAuto(i, { quiet: i !== current });
    }
  } catch (err) { setStatus(String(err)); }
  btn.disabled = false; btn.textContent = 'Auto all';
});
for (const id of ['grid', 'whole', 'debug']) $(id).addEventListener('change', drawStage);
$('lensProfile').addEventListener('change', () => {
  const s = samples[current], e = editOf(s);
  e.lensProfile = $('lensProfile').checked;
  // A frame outline fixes the perspective; re-solve it under the new lens model.
  if (e.quad) Object.assign(e, g.solveFromQuad(s.width, s.height, modelQuad(s, e), e.focal35));
  saveEdits(); syncPanel(); drawStage(); drawThumb(current);
});

// Remember whether the extra controls are open.
const more = $('more');
try { more.open = localStorage.getItem(`${STORE_KEY}:more`) === '1'; } catch { /* private mode */ }
more.addEventListener('toggle', () => {
  try { localStorage.setItem(`${STORE_KEY}:more`, more.open ? '1' : '0'); } catch { /* private mode */ }
});

function toggleGuided() {
  const s = samples[current], e = editOf(s);
  if (mode === 'guided') {
    mode = 'edit';
    e.crop = 'frame';
  } else {
    mode = 'guided';
    more.open = true;
    if (!e.quad) {
      const ix = s.width * 0.25, iy = s.height * 0.25;
      e.quad = [[ix, iy], [s.width - ix, iy], [s.width - ix, s.height - iy], [ix, s.height - iy]];
      applyQuad(s, e, 'manual');
    }
  }
  saveEdits(); syncPanel(); drawStage(); drawThumb(current);
}

// ---- Filmstrip -----------------------------------------------------------

const thumbCanvas = document.createElement('canvas');
thumbCanvas.width = 480; thumbCanvas.height = 300;
const thumbRenderer = new WarpRenderer(thumbCanvas);
const cards = samples.map((s, i) => {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `<canvas width="480" height="300"></canvas><div class="label"><span>${s.name}</span><span class="badge"></span></div>`;
  card.addEventListener('click', () => select(i));
  $('strip').appendChild(card);
  return card;
});

async function drawThumb(i) {
  const s = samples[i], e = editOf(s);
  const src = await thumbSource(s);
  const v = view(s, e);
  const f = fit(v.crop, thumbCanvas.width, thumbCanvas.height, 6);
  thumbRenderer.draw(s.name, src, g.mul(g.inv(v.Hm), f.S), s.width, s.height, [0, 0, 0], v.L);
  const ctx = cards[i].querySelector('canvas').getContext('2d');
  ctx.clearRect(0, 0, 480, 300);
  ctx.drawImage(thumbCanvas, 0, 0);
  maskOutside(ctx, f, v.crop, 480, 300, '#000');
  const badge = cards[i].querySelector('.badge');
  const m = e.auto?.method;
  badge.className = `badge ${m || ''}`;
  badge.textContent = m === 'frame' ? 'frame' : m === 'lines' ? (e.auto.mode === 'general' ? 'general' : 'verticals') : m === 'none' ? 'not found' : m === 'manual' ? 'manual' : '';
}

function select(i) {
  current = (i + samples.length) % samples.length;
  mode = 'edit'; drag = null;
  cards.forEach((c, k) => c.classList.toggle('active', k === current));
  cards[current].scrollIntoView({ block: 'nearest', inline: 'nearest' });
  syncPanel(); drawStage();
}

// ---- Keys ----------------------------------------------------------------

window.addEventListener('keydown', (ev) => {
  if (ev.target.tagName === 'INPUT' && ev.target.type !== 'range' && ev.target.type !== 'checkbox') return;
  if (ev.key === 'b' && !before) { before = true; drawStage(); }
  else if (ev.key === 'ArrowRight' && ev.target.type !== 'range') select(current + 1);
  else if (ev.key === 'ArrowLeft' && ev.target.type !== 'range') select(current - 1);
  else if (ev.key === 'a') runAuto(current).catch((err) => setStatus(String(err)));
  else if (ev.key === 'g') runAuto(current, { mode: 'general' }).catch((err) => setStatus(String(err)));
  else if (ev.key === 'f') toggleGuided();
});
const beforeBtn = $('before');
beforeBtn.addEventListener('pointerdown', () => { before = true; drawStage(); });
for (const t of ['pointerup', 'pointerleave', 'pointercancel']) beforeBtn.addEventListener(t, () => { if (before) { before = false; drawStage(); } });
window.addEventListener('keyup', (ev) => { if (ev.key === 'b') { before = false; drawStage(); } });

new ResizeObserver(() => { resizeStage(); drawStage(); }).observe(stage);
resizeStage();
select(0);
samples.forEach((_, i) => drawThumb(i));
// Warm OpenCV in the background so the first Auto is quick.
setTimeout(() => loadCv().catch(() => {}), 500);
window.__proto = { samples, edits, runAuto, select, findStraightChains, image };
