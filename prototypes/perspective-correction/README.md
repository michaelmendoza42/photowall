# Perspective correction prototype

Standalone prototype of perspective ("keystone") and lens correction for the
photo editor, with Auto detection tuned for photos of framed art. Not part
of the app build; nothing here changes the product contract yet.

## Setup

```bash
npm install            # OpenCV.js
node prep-samples.mjs  # copies 21 MoMA shots from the library into samples/ (needs the library mount)
npm start              # http://<host>:5201
```

The sample JPEGs are not committed (`samples/samples.json` is); the goldens
depend on them, so re-run `prep-samples.mjs` on a fresh checkout. Scripts use
`sharp` and `playwright` from the repo root's `node_modules`.

## Tests

```bash
npm test          # math + detector logic, no browser (~1s)
npm run test:e2e  # headless Chromium on :5299: page smoke, shader parity, per-photo goldens
npm run test:all  # both
npm run goldens   # re-record goldens.json — only after checking results by eye
```

| Test | Protects |
|---|---|
| `geometry.test.mjs` | Camera model round-trips (sliders ⇄ rotation ⇄ quad), lens distort/undistort, crop fit on bowed outlines, profile on/off decision |
| `detect.test.mjs` | Snapping hybrid outlines onto real edges (DSC05176), rebuilding a canvas split by a painted horizon (DSC05112), outlier-proof vanishing points, the "trust" rules for line-only corrections |
| `e2e.test.cjs` shader parity | The WebGL warp samples exactly where `geometry.js` says (perspective + lens), to ~0.1 px at photo size |
| `e2e.test.cjs` goldens | Auto (Framed art and General) on all 21 samples: method, crop, angles within ±0.75° |

Each detector and shader test was checked by planting the bug it guards
against and confirming it fails.

## Review tools

`review.cjs` + `compose.mjs` (before/after sheets for all samples),
`one.cjs` (one photo: detected quad + result), `dbg.cjs` (every frame
candidate the detector considered), `shot.cjs` (Auto all, prints results).
