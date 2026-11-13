// Headless check: run Auto all, screenshot, dump per-photo results.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  page.on('console', (m) => console.log('console:', m.text()));
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.goto('http://127.0.0.1:5201/');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: process.argv[2] + '/initial.png' });
  await page.click('#autoAll');
  await page.waitForFunction(() => document.querySelector('#autoAll').textContent === 'Auto all', null, { timeout: 180000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: process.argv[2] + '/after-auto.png' });
  const res = await page.evaluate(() => window.__proto.samples.map((s) => {
    const e = window.__proto.edits[s.name];
    return `${s.name} ${e.auto?.method} v=${e.vertical.toFixed(1)} h=${e.horizontal.toFixed(1)} r=${e.rotate.toFixed(1)} | ${e.auto?.note?.replace(/\n/g, ' ')}`;
  }));
  console.log(res.join('\n'));
  await browser.close();
})();
