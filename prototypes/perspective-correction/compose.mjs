import sharp from 'sharp';
import fs from 'node:fs';
const dir = process.argv[2];
const names = [...new Set(fs.readdirSync(dir).filter((f) => f.endsWith('-a.png')).map((f) => f.slice(0, -6)))].sort();
const TW = 420, TH = 240, perSheet = 6;
for (let s = 0; s * perSheet < names.length; s++) {
  const chunk = names.slice(s * perSheet, (s + 1) * perSheet);
  const comps = [];
  for (const [j, n] of chunk.entries()) {
    for (const [k, suf] of ['a', 'b'].entries()) {
      const buf = await sharp(`${dir}/${n}-${suf}.png`).resize(TW, TH, { fit: 'contain', background: '#000' }).toBuffer();
      comps.push({ input: buf, left: k * TW, top: j * (TH + 20) + 20 });
    }
    comps.push({ input: Buffer.from(`<svg width="${2 * TW}" height="20"><text x="4" y="15" font-size="14" fill="#ff0" font-family="sans-serif">${n}  (left: detected, right: corrected)</text></svg>`), left: 0, top: j * (TH + 20) });
  }
  await sharp({ create: { width: 2 * TW, height: chunk.length * (TH + 20), channels: 3, background: '#222' } }).composite(comps).png().toFile(`${dir}/../review-${s}.png`);
}
