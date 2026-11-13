// Usage: node one.cjs <outdir> <name>  — auto one photo, shoot before (with quad) and after (grid).
const { chromium } = require('playwright');
(async () => {
  const [out, name] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.goto('http://127.0.0.1:5201/');
  await page.waitForFunction(() => window.__proto);
  const i = await page.evaluate((n) => window.__proto.samples.findIndex((s) => s.name === n), name);
  await page.evaluate((i) => window.__proto.select(i), i);
  await page.evaluate(() => { document.getElementById('more').open = true; });
  await page.click('#auto');
  await page.waitForFunction((n) => window.__proto.edits[n]?.auto, name, { timeout: 30000 });
  await page.check('#debug');
  await page.keyboard.down('b'); await page.waitForTimeout(300);
  await page.locator('#stage').screenshot({ path: `${out}/${name}-quad.png` });
  await page.keyboard.up('b');
  await page.uncheck('#debug'); await page.check('#grid');
  await page.click('#crop [data-crop="frame"]'); await page.waitForTimeout(300);
  await page.locator('#stage').screenshot({ path: `${out}/${name}-after.png` });
  console.log(await page.evaluate((n) => JSON.stringify(window.__proto.edits[n].quad.map((p) => p.map(Math.round))), name));
  await browser.close();
})();
