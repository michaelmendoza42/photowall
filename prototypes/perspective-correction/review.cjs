// Per photo: original with detection overlay, and the corrected result.
const { chromium } = require('playwright');
const out = process.argv[2];
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.goto('http://127.0.0.1:5201/');
  await page.waitForFunction(() => window.__proto);
  await page.click('#autoAll');
  await page.waitForFunction(() => document.querySelector('#autoAll').textContent === 'Auto all', null, { timeout: 180000 });
  await page.evaluate(() => { document.getElementById('more').open = true; });
  await page.check('#debug');
  const n = await page.evaluate(() => window.__proto.samples.length);
  const only = process.argv[3] ? process.argv[3].split(',') : null;
  for (let i = 0; i < n; i++) {
    const name = await page.evaluate((i) => window.__proto.samples[i].name, i);
    if (only && !only.includes(name)) continue;
    await page.evaluate((i) => window.__proto.select(i), i);
    await page.keyboard.down('b'); await page.waitForTimeout(250);
    await page.locator('#stage').screenshot({ path: `${out}/${name}-a.png` });
    await page.keyboard.up('b');
    if (!(await page.locator('#crop [data-crop="frame"]').isDisabled())) await page.click('#crop [data-crop="frame"]');
    await page.waitForTimeout(250);
    await page.locator('#stage').screenshot({ path: `${out}/${name}-b.png` });
  }
  await browser.close();
})();
