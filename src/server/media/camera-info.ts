import sharp from 'sharp';

/**
 * The 35mm-equivalent focal length a photo was taken at, from its EXIF
 * (FocalLengthIn35mmFilm), or null when the file doesn't record it. The
 * editor's perspective correction models the lens with it.
 */
export async function readFocal35(absolutePath: string): Promise<number | null> {
  const { exif } = await sharp(absolutePath).metadata();
  return exif ? focal35FromExif(exif) : null;
}

/** Parse FocalLengthIn35mmFilm (tag 0xA405) out of a raw EXIF block. */
export function focal35FromExif(buf: Buffer): number | null {
  try {
    const o = buf.toString('ascii', 0, 6) === 'Exif\0\0' ? 6 : 0;
    const order = buf.toString('ascii', o, o + 2);
    if (order !== 'II' && order !== 'MM') return null;
    const le = order === 'II';
    const u16 = (p: number) => (le ? buf.readUInt16LE(o + p) : buf.readUInt16BE(o + p));
    const u32 = (p: number) => (le ? buf.readUInt32LE(o + p) : buf.readUInt32BE(o + p));
    const find = (ifd: number, tag: number): number | null => {
      const count = u16(ifd);
      for (let i = 0; i < count; i++) {
        const entry = ifd + 2 + i * 12;
        if (u16(entry) === tag) return entry;
      }
      return null;
    };
    const exifPointer = find(u32(4), 0x8769);
    if (exifPointer === null) return null;
    const focal = find(u32(exifPointer + 8), 0xa405);
    if (focal === null) return null;
    const value = u16(focal + 8);
    return value > 0 ? value : null;
  } catch {
    // Truncated or odd EXIF: treat as unknown.
    return null;
  }
}
