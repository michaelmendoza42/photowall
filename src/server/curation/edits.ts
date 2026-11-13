import { promises as fs } from 'node:fs';
import { z } from 'zod';
import {
  EDIT_LIMITS,
  EDIT_LOOKS,
  editedSize,
  editVersion,
  normalizeEdit,
  type PhotoEdit,
} from '../../shared/api/edits.js';
import { DEFAULT_FOCAL35 } from '../../shared/api/editWarp.js';
import type { PhotoRecord } from '../scanner/types.js';
import {
  CURATION_SCHEMA_VERSION,
  CurationRootError,
  readJsonFile,
  writeFileAtomically,
  type CurationPaths,
} from './storage.js';

const unit = (limit: number) => z.number().finite().min(-limit).max(limit);

export const PhotoEditSchema = z.object({
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  straighten: unit(EDIT_LIMITS.straighten),
  // Added with perspective correction; older recipes read as neutral.
  perspectiveVertical: unit(EDIT_LIMITS.perspective).default(0),
  perspectiveHorizontal: unit(EDIT_LIMITS.perspective).default(0),
  lensDistortion: unit(EDIT_LIMITS.lensDistortion).default(0),
  focal35: z.number().finite().min(EDIT_LIMITS.focal35Min).max(EDIT_LIMITS.focal35Max).default(DEFAULT_FOCAL35),
  flipX: z.boolean(),
  flipY: z.boolean(),
  crop: z.object({
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
    w: z.number().finite().min(EDIT_LIMITS.minCrop).max(1),
    h: z.number().finite().min(EDIT_LIMITS.minCrop).max(1),
  }),
  // Added after the first edits were saved; older recipes read as neutral.
  temperature: unit(EDIT_LIMITS.temperature).default(0),
  exposure: unit(EDIT_LIMITS.exposure).default(0),
  brightness: unit(EDIT_LIMITS.brightness),
  contrast: unit(EDIT_LIMITS.contrast),
  saturation: unit(EDIT_LIMITS.saturation),
  hue: unit(EDIT_LIMITS.hue),
  blur: z.number().finite().min(0).max(EDIT_LIMITS.blur),
  grain: z.number().finite().min(0).max(EDIT_LIMITS.grain),
  look: z.enum(EDIT_LOOKS),
});

/**
 * edits.json: each edited photo's recipe, keyed by its root-relative
 * path (a photo's id is derived from that path).
 */
const EditsFileSchema = z.object({
  schemaVersion: z.literal(CURATION_SCHEMA_VERSION),
  edits: z.record(z.string(), PhotoEditSchema),
});

export type EditMap = ReadonlyMap<string, PhotoEdit>;

export async function readEdits(paths: CurationPaths): Promise<Map<string, PhotoEdit>> {
  const parsed = await readJsonFile(paths.editsFile);
  if (parsed === null) return new Map();
  const result = EditsFileSchema.safeParse(parsed);
  if (!result.success) {
    // Never start over silently: that would drop every edit.
    throw new CurationRootError(
      `edits.json is not valid: ${result.error.message}`,
      paths.editsFile,
    );
  }
  return new Map(
    Object.entries(result.data.edits).map(([relativePath, edit]) => [
      relativePath,
      normalizeEdit(edit),
    ]),
  );
}

export async function writeEdits(paths: CurationPaths, edits: EditMap): Promise<void> {
  const sorted = [...edits.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const body = { schemaVersion: CURATION_SCHEMA_VERSION, edits: Object.fromEntries(sorted) };
  await writeFileAtomically(paths.editsFile, `${JSON.stringify(body, null, 2)}\n`);
}

export interface EditLogEntry {
  at: string;
  action: 'edit' | 'revert';
  path: string;
  edit?: PhotoEdit;
}

export async function appendEditLog(paths: CurationPaths, entry: EditLogEntry): Promise<void> {
  await fs.appendFile(paths.editsLog, `${JSON.stringify(entry)}\n`, 'utf8');
}

/** A photo as visitors see it: edited size, plus the recipe when there is one. */
export type EditedPhotoRecord = PhotoRecord & { edit?: PhotoEdit; editVersion?: string };

export function withEdit(photo: PhotoRecord, edit: PhotoEdit | undefined): EditedPhotoRecord {
  if (!edit) return photo;
  const { width, height } = editedSize(photo.width, photo.height, edit);
  return {
    ...photo,
    width,
    height,
    aspectRatio: width / height,
    edit,
    editVersion: editVersion(edit),
  };
}
