// Copies a handful of framed-art photos into ./samples at display size,
// with the 35mm-equivalent focal length and lens model from EXIF.
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const SRC = '/mnt/hateno/Files/users/michael/Projects/Photography/2022/New York - Edited Timezone/June 24';
const PICKS = [5016, 5018, 5024, 5031, 5034, 5035, 5037, 5040, 5088, 5094, 5097, 5099, 5112, 5124, 5131, 5134, 5143, 5145, 5176, 5183, 5184];
const LONG_EDGE = 2000;

function exifFocal(buf) {
  if (!buf) return {};
  let o = buf.indexOf('Exif\0\0') === 0 ? 6 : 0;
  const le = buf.toString('ascii', o, o + 2) === 'II';
  const u16 = (p) => (le ? buf.readUInt16LE(o + p) : buf.readUInt16BE(o + p));
  const u32 = (p) => (le ? buf.readUInt32LE(o + p) : buf.readUInt32BE(o + p));
  const entries = (ifd) => {
    const n = u16(ifd), out = {};
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      out[u16(e)] = { type: u16(e + 2), count: u32(e + 4), at: e + 8 };
    }
    return out;
  };
  const ifd0 = entries(u32(4));
  if (!ifd0[0x8769]) return {};
  const ex = entries(u32(ifd0[0x8769].at));
  const res = {};
  if (ex[0xa405]) res.focal35 = u16(ex[0xa405].at);
  if (ex[0x920a]) { const p = u32(ex[0x920a].at); res.focal = u32(p) / u32(p + 4); }
  if (ex[0xa434]) {
    const t = ex[0xa434], p = t.count > 4 ? u32(t.at) : t.at;
    res.lens = buf.toString('ascii', o + p, o + p + t.count).replace(/\0+$/, '');
  }
  return res;
}

const manifest = [];
for (const n of PICKS) {
  const name = `DSC0${n}`;
  const input = path.join(SRC, `${name}.JPG`);
  const meta = await sharp(input).metadata();
  const info = await sharp(input).rotate().resize(LONG_EDGE, LONG_EDGE, { fit: 'inside' })
    .jpeg({ quality: 86 }).toFile(`samples/${name}.jpg`);
  manifest.push({ name, file: `samples/${name}.jpg`, width: info.width, height: info.height, ...exifFocal(meta.exif) });
  console.log(manifest.at(-1));
}
fs.writeFileSync('samples/samples.json', JSON.stringify(manifest, null, 2));
