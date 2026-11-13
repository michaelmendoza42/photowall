const { chromium } = require('playwright');
(async () => {
  const [out, name] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.goto('http://127.0.0.1:5201/');
  await page.waitForFunction(() => window.__proto);
  const res = await page.evaluate(async (name) => {
    const { detect, debugInfo, loadCv } = await import('./detect.js');
    const s = window.__proto.samples.find((x) => x.name === name);
    const img = await window.__proto.image(s);
    const r = await detect(img);
    // Draw raw outline quads (yellow) and snapped candidates (green, labeled) over the photo.
    const c = document.createElement('canvas'); c.width = s.width; c.height = s.height;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    ctx.lineWidth = 3; ctx.font = '28px sans-serif';
    debugInfo.raw.forEach((q) => { ctx.strokeStyle = 'yellow'; ctx.beginPath(); q.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.closePath(); ctx.stroke(); });
    for (const seg of r.segments) { ctx.strokeStyle = seg.family === 'v' ? 'cyan' : 'magenta'; ctx.beginPath(); ctx.moveTo(...seg.a); ctx.lineTo(...seg.b); ctx.stroke(); }
    return { png: c.toDataURL('image/png'), raw: debugInfo.raw.map((q) => q.map((p) => p.map(Math.round))), cands: debugInfo.candidates.map((x) => ({ q: x.quad.map((p) => p.map(Math.round)), sup: +x.support.toFixed(2), score: +x.score.toFixed(3) })), picked: r.quad && r.quad.map((p) => p.map(Math.round)) };
  }, name);
  require('fs').writeFileSync(`${out}/${name}-dbg.png`, Buffer.from(res.png.split(',')[1], 'base64'));
  console.log('raw', JSON.stringify(res.raw));
  console.log('cands', JSON.stringify(res.cands));
  console.log('picked', JSON.stringify(res.picked));
  await browser.close();
})();
