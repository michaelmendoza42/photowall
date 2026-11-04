import { describe, expect, it } from 'vitest';
import {
  NEUTRAL_EDIT,
  applyColorMatrixToRgb,
  editColorMatrix,
  editVersion,
  editedSize,
  isNeutralEdit,
  multiplyColorMatrices,
  normalizeEdit,
  straightenCover,
  type PhotoEdit,
} from './edits.js';

describe('light edits', () => {
  it('a neutral edit changes nothing', () => {
    expect(isNeutralEdit(NEUTRAL_EDIT)).toBe(true);
    expect(editColorMatrix(NEUTRAL_EDIT)).toBeNull();
    expect(editedSize(4000, 3000, NEUTRAL_EDIT)).toEqual({ width: 4000, height: 3000 });
    expect(isNeutralEdit({ ...NEUTRAL_EDIT, grain: 1 })).toBe(false);
  });

  it('sizes the edited photo after its quarter turn and crop', () => {
    const edit: PhotoEdit = { ...NEUTRAL_EDIT, rotation: 270, crop: { x: 0.1, y: 0, w: 0.5, h: 1 } };
    expect(editedSize(4000, 3000, edit)).toEqual({ width: 1500, height: 4000 });
  });

  it('versions equal edits identically, despite float noise', () => {
    const a: PhotoEdit = { ...NEUTRAL_EDIT, brightness: 0.1 + 0.2 };
    const b: PhotoEdit = { ...NEUTRAL_EDIT, brightness: 0.3 };
    expect(editVersion(a)).toBe(editVersion(b));
    expect(editVersion(a)).not.toBe(editVersion({ ...b, contrast: 0.1 }));
  });

  it('normalizes into range', () => {
    const wild = normalizeEdit({
      ...NEUTRAL_EDIT,
      straighten: 90,
      crop: { x: 0.9, y: -1, w: 0.5, h: 0 },
      blur: 500,
    });
    expect(wild.straighten).toBe(45);
    expect(wild.crop).toEqual({ x: 0.5, y: 0, w: 0.5, h: 0.02 });
    expect(wild.blur).toBe(100);
  });

  it('zooms a straightened photo just enough to cover its frame', () => {
    expect(straightenCover(300, 200, 0)).toBe(1);
    const cover = straightenCover(300, 200, 10);
    // The rotated photo's inscribed frame must contain the original frame.
    const t = (10 * Math.PI) / 180;
    expect(cover * 300).toBeGreaterThanOrEqual(300 * Math.cos(t) + 200 * Math.sin(t) - 1e-9);
    expect(cover * 200).toBeGreaterThanOrEqual(300 * Math.sin(t) + 200 * Math.cos(t) - 1e-9);
  });

  it('composes colors the way Pixi does: later steps wrap earlier ones', () => {
    const brighter = editColorMatrix({ ...NEUTRAL_EDIT, brightness: 1 })!;
    // Brightness 1 doubles each channel.
    expect(brighter.slice(0, 5)).toEqual([2, 0, 0, 0, 0]);
    const both = editColorMatrix({ ...NEUTRAL_EDIT, brightness: 1, look: 'negative' })!;
    // Negative after doubling: 1 - 2x.
    const pixel = new Uint8Array([50, 100, 200]);
    applyColorMatrixToRgb(pixel, 3, both);
    expect([...pixel]).toEqual([155, 55, 0]);
    // Identity is neutral for multiplication.
    const identity = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
    expect(multiplyColorMatrices(identity, both)).toEqual(both);
  });

  it('applies contrast offsets without clipping in between', () => {
    const pixel = new Uint8Array([128, 255, 0]);
    applyColorMatrixToRgb(pixel, 3, editColorMatrix({ ...NEUTRAL_EDIT, contrast: 1 })!);
    // v = 2, offset -0.5: mid grey stays, white and black stay at the ends.
    expect([...pixel]).toEqual([129, 255, 0]);
  });
});
