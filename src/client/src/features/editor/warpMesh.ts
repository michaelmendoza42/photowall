import { turnedSize, type PhotoEdit } from '../../../../shared/api/edits.js';
import { frameWarp, turnPoint } from '../../../../shared/api/editWarp.js';

/** Grid cells per side: dense enough that the per-triangle (affine) mapping tracks the projective one. */
export const WARP_MESH_CELLS = 40;

export interface WarpMeshData {
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}

/**
 * A grid over the original photo (texture `width` × `height`), each vertex
 * placed where the edit's quarter turn and warp put it in the editor's
 * frame space (origin at the frame's center, before mirroring). Drawn
 * with the photo as its texture, it previews what the server renders.
 */
export function warpMeshData(width: number, height: number, edit: PhotoEdit, cells = WARP_MESH_CELLS): WarpMeshData {
  const turned = turnedSize(width, height, edit.rotation);
  const warp = frameWarp(turned.width, turned.height, edit);
  const n = cells + 1;
  const positions = new Float32Array(n * n * 2);
  const uvs = new Float32Array(n * n * 2);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const u = i / cells;
      const v = j / cells;
      const k = (j * n + i) * 2;
      uvs[k] = u;
      uvs[k + 1] = v;
      const [x, y] = warp.toFrame(turnPoint(width, height, edit.rotation, [u * width, v * height]));
      positions[k] = x - turned.width / 2;
      positions[k + 1] = y - turned.height / 2;
    }
  const indices = new Uint32Array(cells * cells * 6);
  let o = 0;
  for (let j = 0; j < cells; j++)
    for (let i = 0; i < cells; i++) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      indices.set([a, b, c, b, d, c], o);
      o += 6;
    }
  return { positions, uvs, indices };
}

/** Changes when anything that moves the mesh's vertices changes. */
export function warpMeshKey(edit: PhotoEdit): string {
  return [
    edit.rotation,
    edit.straighten,
    edit.perspectiveVertical,
    edit.perspectiveHorizontal,
    edit.lensDistortion,
    edit.focal35,
  ].join('|');
}
