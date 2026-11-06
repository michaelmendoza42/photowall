import type { FolderFacet, YearFacet } from '../../shared/api/library.js';
import { isInHiddenFolder } from '../../shared/api/curation.js';
import { buildFolderFacets, buildYearFacets } from '../scanner/walk.js';
import type { PersistedSnapshot } from '../snapshots/schema.js';
import type { AlbumSettings } from './storage.js';
import type { EditedPhotoRecord } from './edits.js';

/** `vip` is an authorized guest: a viewer who also sees private photos. */
export type CurationRole = 'curator' | 'vip' | 'viewer';

/**
 * The part of the library one kind of visitor can see. Viewers never
 * see `_hidden` folders, and with curation on they only see folders
 * the curator put on display. Authorized guests see the same, private
 * photos included. The curator sees everything.
 */
/** A photo as a visitor sees it: with its edit, star and privacy. */
export type CatalogPhoto = EditedPhotoRecord & { starred?: boolean; private?: boolean };

export interface Catalog {
  /** Photos folder selections draw from. */
  photos: readonly CatalogPhoto[];
  /**
   * Favorites: starred photos outside `_hidden` folders. Viewers see these
   * even when their album is in storage (starring a photo is the curator
   * putting it on display), but never private ones.
   */
  starred: readonly CatalogPhoto[];
  /** Every photo this visitor may load: `photos` plus `starred`. */
  ids: ReadonlySet<string>;
  /** Visible photos by id, with their edits. */
  byId: ReadonlyMap<string, CatalogPhoto>;
  folders: FolderFacet[];
  years: YearFacet[];
}

export function buildCatalog(input: {
  snapshot: PersistedSnapshot;
  /** null when curation is off. */
  settings: AlbumSettings | null;
  role: CurationRole;
  /** Paths of starred photos; ignored when curation is off. */
  starredPaths?: ReadonlySet<string>;
  /** Paths of private photos, which guests never see; ignored when curation is off. */
  privatePaths?: ReadonlySet<string>;
}): Catalog {
  const { settings, role } = input;
  const none = new Set<string>();
  const starredPaths = settings ? (input.starredPaths ?? none) : none;
  const privatePaths = settings ? (input.privatePaths ?? none) : none;
  const all: readonly CatalogPhoto[] =
    starredPaths.size === 0 && privatePaths.size === 0
      ? input.snapshot.photos
      : input.snapshot.photos.map((photo) => {
          const starred = starredPaths.has(photo.relativePath);
          const isPrivate = privatePaths.has(photo.relativePath);
          if (!starred && !isPrivate) return photo;
          return {
            ...photo,
            ...(starred ? { starred: true } : {}),
            ...(isPrivate ? { private: true } : {}),
          };
        });
  const curator = settings !== null && role === 'curator';
  const seesPrivate = curator || role === 'vip';
  const starred = all.filter(
    (photo) =>
      photo.starred === true &&
      !isInHiddenFolder(photo.directoryPath) &&
      (seesPrivate || photo.private !== true),
  );
  if (curator) {
    return {
      photos: all,
      starred,
      ids: new Set(all.map((photo) => photo.id)),
      byId: new Map(all.map((photo) => [photo.id, photo])),
      folders: input.snapshot.folders,
      years: input.snapshot.years,
    };
  }
  const onDisplay = settings ? new Set(settings.onDisplay) : null;
  const photos = all.filter(
    (photo) =>
      !isInHiddenFolder(photo.directoryPath) &&
      (seesPrivate || photo.private !== true) &&
      (onDisplay === null || onDisplay.has(photo.directoryPath)),
  );
  const byId = new Map<string, CatalogPhoto>(photos.map((photo) => [photo.id, photo]));
  for (const photo of starred) byId.set(photo.id, photo);
  return {
    photos,
    starred,
    ids: new Set(byId.keys()),
    byId,
    folders: buildFolderFacets(photos),
    years: buildYearFacets(photos),
  };
}

/**
 * The folder rules a wall with nothing picked uses: the curator's
 * default view, limited to folders this visitor can see. Empty means
 * the whole catalog.
 */
export function defaultViewFolders(
  settings: AlbumSettings | null,
  catalog: Catalog,
): string[] {
  if (!settings || settings.defaultView.length === 0) return [];
  const visible = new Set(
    catalog.folders.filter((facet) => facet.photoCount > 0).map((facet) => facet.path),
  );
  return settings.defaultView.filter((folder) => visible.has(folder));
}

/**
 * Put `folder` and every folder beneath it on display, or in storage.
 * `_hidden` folders are never put on display. Folders added to the
 * library later start in storage.
 */
export function updateDisplay(input: {
  settings: AlbumSettings;
  folders: readonly FolderFacet[];
  folder: string;
  onDisplay: boolean;
}): AlbumSettings {
  const { settings, folder, onDisplay } = input;
  const covered = (path: string) =>
    folder === '' || path === folder || path.startsWith(`${folder}/`);
  const subtree = input.folders
    .map((facet) => facet.path)
    .filter((path) => covered(path) && !isInHiddenFolder(path));
  const next = new Set(settings.onDisplay);
  for (const path of subtree) {
    if (onDisplay) next.add(path);
    else next.delete(path);
  }
  // Storage also drops stale entries for folders that no longer exist.
  if (!onDisplay) for (const path of [...next]) if (covered(path)) next.delete(path);
  return { ...settings, onDisplay: [...next].sort() };
}
