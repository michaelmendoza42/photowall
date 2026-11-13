import { describe, expect, it } from 'vitest';
import { NEUTRAL_EDIT, turnedSize, type PhotoEdit } from '../../../../../shared/api/edits.js';
import { frameWarp, turnPoint } from '../../../../../shared/api/editWarp.js';
import { warpMeshData, warpMeshKey } from '../warpMesh.js';

describe('warpMeshData', () => {
  it.each<[string, Partial<PhotoEdit>]>([
    ['perspective', { perspectiveVertical: 9, perspectiveHorizontal: -5, focal35: 24 }],
    ['quarter turn + lens', { rotation: 90, lensDistortion: 50 }],
  ])('%s: each vertex sits where the shared warp puts its photo point', (_name, patch) => {
    const edit = { ...NEUTRAL_EDIT, ...patch };
    const width = 300;
    const height = 200;
    const cells = 4;
    const { positions, uvs, indices } = warpMeshData(width, height, edit, cells);
    const turned = turnedSize(width, height, edit.rotation);
    const warp = frameWarp(turned.width, turned.height, edit);
    expect(positions.length).toBe((cells + 1) ** 2 * 2);
    expect(indices.length).toBe(cells * cells * 6);
    for (let k = 0; k < positions.length; k += 2) {
      const [x, y] = warp.toFrame(turnPoint(width, height, edit.rotation, [uvs[k]! * width, uvs[k + 1]! * height]));
      expect(positions[k]).toBeCloseTo(x - turned.width / 2, 3);
      expect(positions[k + 1]).toBeCloseTo(y - turned.height / 2, 3);
    }
  });

  it('rebuilds only when something that moves vertices changes', () => {
    const base = { ...NEUTRAL_EDIT, perspectiveVertical: 5 };
    expect(warpMeshKey({ ...base, brightness: 0.4, crop: { x: 0.1, y: 0, w: 0.5, h: 1 } })).toBe(warpMeshKey(base));
    expect(warpMeshKey({ ...base, perspectiveVertical: 6 })).not.toBe(warpMeshKey(base));
  });
});
