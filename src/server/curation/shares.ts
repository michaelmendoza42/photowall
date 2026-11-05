import { createHash } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import {
  FOLDER_PATH_PATTERN,
  type ShareCreateRequest,
  type ShareRecord,
} from '../../shared/api/curation.js';
import { readJsonFile, writeFileAtomically } from './storage.js';

const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{10}$/;

const FolderPathSchema = z.string().max(1024).regex(FOLDER_PATH_PATTERN);

export const ShareCreateSchema = z.object({
  folders: z.array(FolderPathSchema).max(256),
  excludeFolders: z.array(FolderPathSchema).max(256),
  anchorPhotoId: z.string().regex(/^[0-9a-f]{1,64}$/).nullable(),
  zoom: z.number().finite().positive().max(100).nullable(),
  starred: z.boolean().optional(),
});

const ShareRecordSchema = ShareCreateSchema.extend({
  id: z.string().regex(SHARE_ID_PATTERN),
  createdAt: z.string().min(1),
});

/**
 * Share links: a short id for an album selection plus the photo the
 * wall centers on. The id is a hash of the content, so sharing the same
 * view twice gives the same link.
 */
export class ShareService {
  constructor(private readonly sharesDir: string) {}

  async create(input: ShareCreateRequest): Promise<ShareRecord> {
    const content: ShareCreateRequest = {
      folders: [...new Set(input.folders)].sort(),
      excludeFolders: [...new Set(input.excludeFolders)].sort(),
      anchorPhotoId: input.anchorPhotoId,
      zoom: input.zoom === null ? null : Math.round(input.zoom * 1000) / 1000,
      // Only views with Starred carry the field, so older links keep their ids.
      ...(input.starred ? { starred: true } : {}),
    };
    const id = createHash('sha256')
      .update(JSON.stringify(content))
      .digest('base64url')
      .slice(0, 10);
    const existing = await this.get(id);
    if (existing) return existing;
    const record: ShareRecord = { id, createdAt: new Date().toISOString(), ...content };
    await writeFileAtomically(this.fileFor(id), JSON.stringify(record));
    return record;
  }

  async get(id: string): Promise<ShareRecord | null> {
    if (!SHARE_ID_PATTERN.test(id)) return null;
    const parsed = ShareRecordSchema.safeParse(await readJsonFile(this.fileFor(id)));
    return parsed.success ? parsed.data : null;
  }

  private fileFor(id: string): string {
    return path.join(this.sharesDir, `${id}.json`);
  }
}
