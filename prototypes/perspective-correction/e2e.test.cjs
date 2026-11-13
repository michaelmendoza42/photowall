// Browser tests: boots serve.mjs on a spare port and drives the page in
// headless Chromium (software WebGL).
//   node --test e2e.test.cjs                      run
//   UPDATE_GOLDENS=1 node --test e2e.test.cjs     re-record goldens.json
//                                                  (only after checking the results by eye)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const PORT = 5299;
const URL = `http://127.0.0.1:${PORT}/`;
const GOLDENS = path.join(__dirname, 'goldens.json');
const ANGLE_TOL = 0.75; // degrees
let server, browser, page;
const errors = [];

before(async () => {
  server = spawn(process.execPath, [path.join(__dirname, 'serve.mjs'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve, reject) => {
    server.stdout.on('data', (d) => String(d).includes(`:${PORT}`) && resolve());
    server.on('exit', (code) => reject(new Error(`server exited ${code}`)));
  });
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.__proto);
});

after(async () => {
  await browser?.close();
  server?.kill();
});

test('page loads clean, with both Auto modes up front and the rest collapsed', async () => {
  assert.equal(await page.isVisible('#auto'), true);
  assert.equal(await page.isVisible('#autoGeneral'), true);
  assert.equal(await page.isVisible('#crop'), true);
  assert.equal(await page.isVisible('#sliders'), false, 'sliders start collapsed under More');
  assert.deepEqual(errors, []);
});

test('the shader samples exactly where geometry.js says (perspective + lens)', async (t) => {
  const res = await page.evaluate(async () => {
    const g = await import('./geometry.js');
    const { WarpRenderer } = await import('./render.js');
    // Photo-sized source whose pixels encode one coordinate: R = coord / 8
    // (coarse), G = (coord mod 32) · 8 (fine, ~1/8 px). One source per axis.
    const N = 2048, PERIOD = 32;
    const source = (axis) => {
      const c = document.createElement('canvas');
      c.width = c.height = N;
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(N, N);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const v = axis === 'x' ? x : y, i = (y * N + x) * 4;
        img.data[i] = Math.floor(v / 8);
        img.data[i + 1] = (v % PERIOD) * 8;
        img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      return c;
    };
    const decode = (coarse, fine) => {
      // Bilinear sampling returns (coordinate − 0.5); the fine ramp pins it
      // down within the coarse estimate's period.
      const f = fine / 8 + 0.5, c = coarse * 8 + 4;
      return f + PERIOD * Math.round((c - f) / PERIOD);
    };

    const edit = { vertical: 7, horizontal: -9, rotate: 2, focal35: 24, lensProfile: true, distortion: 30 };
    const L = g.lensModel(N, N, edit, { a: 0.013, b: -0.039, c: 0.003 });
    const Hm = g.homography(N, N, edit);
    const out = document.createElement('canvas');
    out.width = out.height = 64;
    const r = new WarpRenderer(out);
    const srcs = { x: source('x'), y: source('y') };
    let worst = 0, checked = 0;
    // 1:1 windows across the output (center, edges, corners), so no mipmapping.
    for (const wy of [150, 1000, 1850]) for (const wx of [150, 1000, 1850]) {
      const S = [1, 0, wx, 0, 1, wy, 0, 0, 1];
      const M = g.mul(g.inv(Hm), S);
      const read = (axis) => {
        r.draw(`coords-${axis}`, srcs[axis], M, N, N, [0, 0, 0], L);
        const px = new Uint8Array(64 * 64 * 4);
        r.gl.readPixels(0, 0, 64, 64, r.gl.RGBA, r.gl.UNSIGNED_BYTE, px);
        return px;
      };
      const pxX = read('x'), pxY = read('y');
      for (let y = 2; y < 64; y += 2) for (let x = 2; x < 64; x += 2) {
        const [sx, sy] = g.distort(L, g.project(M, [x + 0.5, y + 0.5]));
        if (sx < 2 || sy < 2 || sx > N - 2 || sy > N - 2) continue;
        // Skip samples straddling the fine ramp's wrap (interpolation blends 248 and 0).
        const nearWrap = (v) => { const m = ((v - 0.5) % PERIOD + PERIOD) % PERIOD; return m < 1.5 || m > PERIOD - 1.5; };
        if (nearWrap(sx) || nearWrap(sy)) continue;
        const i = ((63 - y) * 64 + x) * 4; // readPixels is bottom-up
        const gx = decode(pxX[i], pxX[i + 1]), gy = decode(pxY[i], pxY[i + 1]);
        worst = Math.max(worst, Math.hypot(gx - sx, gy - sy));
        checked++;
      }
    }
    return { worst, checked };
  });
  t.diagnostic(`${res.checked} pixels checked, worst mismatch ${res.worst.toFixed(3)} px`);
  assert.ok(res.checked > 2500, `checked ${res.checked} pixels`);
  assert.ok(res.worst < 0.3, `worst mismatch ${res.worst.toFixed(3)} px`);
});

test('Auto results on the sample photos match the checked goldens', { timeout: 300000 }, async () => {
  const results = await page.evaluate(async () => {
    const { samples, edits, runAuto } = window.__proto;
    const out = {};
    for (const mode of ['framed', 'general']) {
      for (let i = 0; i < samples.length; i++) {
        await runAuto(i, { quiet: true, mode });
        const e = edits[samples[i].name];
        const r1 = (v) => Math.round(v * 10) / 10;
        out[`${mode}:${samples[i].name}`] = { method: e.auto.method, vertical: r1(e.vertical), horizontal: r1(e.horizontal), rotate: r1(e.rotate), crop: e.crop };
      }
    }
    return out;
  });
  if (process.env.UPDATE_GOLDENS) {
    fs.writeFileSync(GOLDENS, `${JSON.stringify(results, null, 1)}\n`);
    return;
  }
  const goldens = JSON.parse(fs.readFileSync(GOLDENS, 'utf8'));
  const problems = [];
  for (const [key, want] of Object.entries(goldens)) {
    const got = results[key];
    if (!got) { problems.push(`${key}: missing`); continue; }
    if (got.method !== want.method) problems.push(`${key}: method ${got.method}, want ${want.method}`);
    if (got.crop !== want.crop) problems.push(`${key}: crop ${got.crop}, want ${want.crop}`);
    for (const k of ['vertical', 'horizontal', 'rotate'])
      if (Math.abs(got[k] - want[k]) > ANGLE_TOL) problems.push(`${key}: ${k} ${got[k]}°, want ${want[k]}°`);
  }
  assert.deepEqual(problems, []);
  assert.deepEqual(errors, []);
});
