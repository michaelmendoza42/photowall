import { z } from 'zod';

/**
 * Persisted playlist schema. Playlists are narrow saved-filter
 * presets: id, display name, the saved (years, folders) filter set,
 * and timestamps. Schema is validated on both read and write so a
 * hand-edited or corrupt file cannot poison the runtime.
 */

export const PLAYLIST_SCHEMA_VERSION = 1;

const FolderPathSchema = z
  .string()
  // Forward-slash, root-relative; empty string means root.
  .regex(/^([^/]+(\/[^/]+)*)?$/u, {
    message:
      'folder must be forward-slash, root-relative, with no leading or trailing slash',
  });

export const PlaylistFiltersSchema = z.object({
  years: z.array(z.number().int()).max(64),
  folders: z.array(FolderPathSchema).max(64),
});

export const PlaylistRecordSchema = z.object({
  schemaVersion: z.literal(PLAYLIST_SCHEMA_VERSION),
  id: z.string().min(1),
  name: z.string().min(1).max(128),
  filters: PlaylistFiltersSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export type PersistedPlaylist = z.infer<typeof PlaylistRecordSchema>;
export type PersistedPlaylistFilters = z.infer<typeof PlaylistFiltersSchema>;

export const PlaylistCreateInputSchema = z.object({
  name: z.string().min(1).max(128),
  filters: PlaylistFiltersSchema,
});

export const PlaylistUpdateInputSchema = z
  .object({
    name: z.string().min(1).max(128).optional(),
    filters: PlaylistFiltersSchema.optional(),
  })
  .refine(
    (v) => v.name !== undefined || v.filters !== undefined,
    { message: 'at least one of `name` or `filters` is required' },
  );

export type PlaylistCreateInput = z.infer<typeof PlaylistCreateInputSchema>;
export type PlaylistUpdateInput = z.infer<typeof PlaylistUpdateInputSchema>;
