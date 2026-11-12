import { createHmac, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import type { FastifyRequest } from 'fastify';
import {
  isInHiddenFolder,
  VIEW_AS_GUEST,
  VIEW_AS_HEADER,
  type FrameChoice,
  type FrameMat,
  type PhotoFrame,
  type WallDisplaySettings,
} from '../../shared/api/curation.js';
import type { LibraryService } from '../snapshots/library-service.js';
import type { PhotoRecord } from '../scanner/types.js';
import type { PersistedSnapshot } from '../snapshots/schema.js';
import { isNeutralEdit, normalizeEdit, type PhotoEdit } from '../../shared/api/edits.js';
import {
  appendEditLog,
  readEdits,
  withEdit,
  writeEdits,
  type EditedPhotoRecord,
} from './edits.js';
import { buildCatalog, updateDisplay, type Catalog, type CurationRole } from './catalog.js';
import {
  hiddenDestinationDir,
  movePhoto,
  PhotoMoveError,
  restoreDestinationDir,
} from './mover.js';
import {
  appendMoveLog,
  ensureCurationPaths,
  createSetupCode,
  pinMatchesHash,
  readPinHash,
  removeVipPin,
  removeSetupCode,
  writePinHash,
  readAlbumSettings,
  readOrCreateSessionSecret,
  readPhotoFlag,
  readPhotoFrames,
  writePhotoFrames,
  photoFlagFile,
  writePhotoFlag,
  type PhotoFlag,
  writeAlbumSettings,
  type AlbumSettings,
  type CurationPaths,
} from './storage.js';

export const CURATOR_COOKIE = 'photo_wall_curator';
/** Marks an authorized guest's browser; valid until the VIP PIN changes. */
export const VIP_COOKIE = 'photo_wall_vip';
const PHOTO_FLAGS: readonly PhotoFlag[] = ['starred', 'private', 'featured'];
/** How often, at most, a request checks albums.json for changes from another server. */
const SETTINGS_CHECK_MS = 1000;
const SESSION_MAX_AGE_S = 60 * 60 * 24 * 365;

export class CurationActionError extends Error {
  constructor(
    public readonly code:
      | 'library_writes_disabled'
      | 'photo_not_found'
      | 'photo_not_hidden'
      | 'photo_already_hidden',
    message: string,
  ) {
    super(message);
    this.name = 'CurationActionError';
  }
}

export interface CurationServiceOptions {
  library: LibraryService;
  curationRoot: string;
  /**
   * A PIN from the environment. Without one, the curator chooses a PIN on
   * /curate; until then curation is off and everything outside `_hidden`
   * is visible.
   */
  curatorPin: string | null;
  /** Allow moving photos; still off when the library isn't writable. */
  libraryWrites: boolean;
}

/**
 * Owns curation settings, curator sessions and photo moves. Routes ask
 * it for the catalog a request may see.
 */
export class CurationService {
  private paths: CurationPaths | null = null;
  private settings: AlbumSettings | null = null;
  private secret = '';
  private queue: Promise<unknown> = Promise.resolve();
  private catalogCache = new Map<string, Catalog>();
  private settingsMtimeMs: number | null = null;
  private pinHash: string | null = null;
  private vipPinHash: string | null = null;
  private vipPinMtimeMs: number | null = null;
  private libraryWritable = false;
  private setupCode: string | null = null;
  private lastSettingsCheck = 0;
  private edits = new Map<string, PhotoEdit>();
  private editsMtimeMs: number | null = null;
  /**
   * Photo paths per flag: starred (Favorites), private (never for guests)
   * and featured (an album's centerpiece, at most one per folder).
   */
  private flags: Record<PhotoFlag, Set<string>> = {
    starred: new Set(),
    private: new Set(),
    featured: new Set(),
  };
  private flagMtimes: Record<PhotoFlag, number | null> = {
    starred: null,
    private: null,
    featured: null,
  };
  /** The frame and mat the curator picked for a photo, by path. */
  private photoFrames = new Map<string, PhotoFrame>();
  private photoFramesMtimeMs: number | null = null;

  constructor(private readonly options: CurationServiceOptions) {}

  async initialize(): Promise<void> {
    this.paths = await ensureCurationPaths(this.options.curationRoot);
    await this.reloadSettings();
    await this.reloadEdits();
    for (const flag of PHOTO_FLAGS) await this.reloadFlag(flag);
    await this.reloadPhotoFrames();
    this.secret = await readOrCreateSessionSecret(this.paths);
    this.pinHash = await readPinHash(this.paths);
    await this.reloadVipPin();
    // No PIN yet: whoever chooses it must show this code, which only
    // someone with access to the server's log or files can read.
    this.setupCode = this.enabled ? null : await createSetupCode(this.paths);
    this.libraryWritable = await fs
      .access(this.options.library.getLibraryRoot(), fs.constants.W_OK)
      .then(() => true, () => false);
  }

  /**
   * Pick up albums.json changes another server (dev or prod sharing this
   * curation folder) made since we last read it. Cheap: one stat, at
   * most once a second.
   */
  async refreshIfChanged(): Promise<void> {
    const now = Date.now();
    if (now - this.lastSettingsCheck < SETTINGS_CHECK_MS) return;
    this.lastSettingsCheck = now;
    if ((await this.statSettings()) !== this.settingsMtimeMs) await this.reloadSettings();
    if ((await statMtime(this.getPaths().editsFile)) !== this.editsMtimeMs) await this.reloadEdits();
    for (const flag of PHOTO_FLAGS) {
      if ((await statMtime(photoFlagFile(this.getPaths(), flag))) !== this.flagMtimes[flag]) {
        await this.reloadFlag(flag);
      }
    }
    if ((await statMtime(this.getPaths().framesFile)) !== this.photoFramesMtimeMs) {
      await this.reloadPhotoFrames();
    }
    if ((await statMtime(this.getPaths().vipPinFile)) !== this.vipPinMtimeMs) {
      await this.reloadVipPin();
    }
  }

  get enabled(): boolean {
    return this.options.curatorPin !== null || this.pinHash !== null;
  }

  get libraryWrites(): boolean {
    return this.enabled && this.options.libraryWrites && this.libraryWritable;
  }

  /** The one-time setup code while no PIN exists, else null. */
  getSetupCode(): string | null {
    return this.enabled ? null : this.setupCode;
  }

  /**
   * Choose the curator PIN on a server that has none yet, proving access
   * with the setup code. Returns the session cookie, 'already_set', or
   * 'code_invalid'.
   */
  async choosePin(
    pin: string,
    code: string,
  ): Promise<string | 'already_set' | 'code_invalid'> {
    return this.serialize(async () => {
      this.pinHash = await readPinHash(this.getPaths());
      if (this.enabled) return 'already_set';
      if (!this.setupCode || !safeEqual(code.trim(), this.setupCode)) return 'code_invalid';
      this.pinHash = await writePinHash(this.getPaths(), pin.trim());
      this.setupCode = null;
      await removeSetupCode(this.getPaths());
      this.catalogCache.clear();
      return serializeCookie(CURATOR_COOKIE, this.sessionToken(), SESSION_MAX_AGE_S);
    });
  }

  /** A VIP PIN is set, so guests can become authorized. */
  get vipPinSet(): boolean {
    return this.enabled && this.vipPinHash !== null;
  }

  /**
   * Set or change the VIP PIN. Every browser authorized with the old
   * one is signed out, since its cookie was signed with the old hash.
   */
  setVipPin(pin: string): Promise<'ok' | 'same_as_curator'> {
    return this.serialize(async () => {
      const entered = pin.trim();
      if (await this.matchesCuratorPin(entered)) return 'same_as_curator';
      this.vipPinHash = await writePinHash(this.getPaths(), entered, this.getPaths().vipPinFile);
      this.vipPinMtimeMs = await statMtime(this.getPaths().vipPinFile);
      this.catalogCache.clear();
      return 'ok';
    });
  }

  /** Turn authorized guests off, signing every one of them out. */
  clearVipPin(): Promise<void> {
    return this.serialize(async () => {
      await removeVipPin(this.getPaths());
      this.vipPinHash = null;
      this.vipPinMtimeMs = null;
      this.catalogCache.clear();
    });
  }

  private async reloadVipPin(): Promise<void> {
    const paths = this.getPaths();
    this.vipPinMtimeMs = await statMtime(paths.vipPinFile);
    this.vipPinHash = await readPinHash(paths, paths.vipPinFile);
  }

  getPaths(): CurationPaths {
    if (!this.paths) throw new Error('CurationService.initialize must be called first');
    return this.paths;
  }

  /** Album settings while curation is on, else null. */
  getSettings(): AlbumSettings | null {
    return this.enabled ? this.settings : null;
  }

  roleOf(request: FastifyRequest): CurationRole {
    if (!this.enabled) return 'viewer';
    const token = readCookie(request.headers.cookie, CURATOR_COOKIE);
    if (token !== null && safeEqual(token, this.sessionToken())) return 'curator';
    const vipToken = this.vipToken();
    const vip = readCookie(request.headers.cookie, VIP_COOKIE);
    return vipToken !== null && vip !== null && safeEqual(vip, vipToken)
      ? 'vip'
      : 'viewer';
  }

  /**
   * Whose view of the library a request gets: a curator previewing as a
   * guest sees the guest catalog, with curator permissions unchanged.
   */
  viewRoleOf(request: FastifyRequest): CurationRole {
    const role = this.roleOf(request);
    return role === 'curator' && request.headers[VIEW_AS_HEADER] === VIEW_AS_GUEST
      ? 'viewer'
      : role;
  }

  /**
   * The role and session cookie a PIN earns: the curator PIN makes a
   * curator, the VIP PIN an authorized guest. Null for a wrong PIN.
   */
  async login(pin: string): Promise<{ role: 'curator' | 'vip'; cookie: string } | null> {
    const entered = pin.trim();
    if (await this.matchesCuratorPin(entered)) {
      return {
        role: 'curator',
        cookie: serializeCookie(CURATOR_COOKIE, this.sessionToken(), SESSION_MAX_AGE_S),
      };
    }
    const vipToken = this.vipToken();
    if (vipToken !== null && (await pinMatchesHash(entered, this.vipPinHash!))) {
      return {
        role: 'vip',
        cookie: serializeCookie(VIP_COOKIE, vipToken, SESSION_MAX_AGE_S),
      };
    }
    return null;
  }

  /** Clears both sessions: Lock and Sign out end whichever this browser has. */
  logoutCookies(): string[] {
    return [serializeCookie(CURATOR_COOKIE, '', 0), serializeCookie(VIP_COOKIE, '', 0)];
  }

  private async matchesCuratorPin(entered: string): Promise<boolean> {
    const envPin = this.options.curatorPin;
    return envPin !== null
      ? safeEqual(entered, envPin)
      : this.pinHash !== null && (await pinMatchesHash(entered, this.pinHash));
  }

  catalogFor(role: CurationRole): Catalog | null {
    const snapshot = this.options.library.getActiveSnapshot();
    if (!snapshot) return null;
    const settings = this.getSettings();
    const key = `${snapshot.snapshotId}:${role}`;
    const cached = this.catalogCache.get(key);
    if (cached) return cached;
    const edited =
      this.edits.size === 0
        ? snapshot
        : {
            ...snapshot,
            photos: snapshot.photos.map((photo) =>
              withEdit(photo, this.edits.get(photo.relativePath)),
            ),
          };
    const catalog = buildCatalog({
      snapshot: edited,
      settings,
      role,
      starredPaths: this.flags.starred,
      privatePaths: this.flags.private,
      featuredPaths: this.flags.featured,
      photoFrames: this.photoFrames,
    });
    // One snapshot at a time; settings changes clear the cache.
    if (this.catalogCache.size > 4) this.catalogCache.clear();
    this.catalogCache.set(key, catalog);
    return catalog;
  }

  setDisplay(folder: string, onDisplay: boolean): Promise<AlbumSettings> {
    return this.serialize(async () => {
      await this.reloadSettings();
      const snapshot = this.requireSnapshot();
      const next = updateDisplay({
        settings: this.requireSettings(),
        folders: snapshot.folders,
        folder,
        onDisplay,
      });
      return this.saveSettings(next);
    });
  }

  setDefaultView(folders: readonly string[], starred?: boolean): Promise<AlbumSettings> {
    return this.serialize(async () => {
      await this.reloadSettings();
      const current = this.requireSettings();
      return this.saveSettings({
        ...current,
        defaultView: [...new Set(folders)].sort(),
        defaultStarred: starred ?? current.defaultStarred,
      });
    });
  }

  /**
   * Set a photo flag: `starred` puts it in Favorites, `private` keeps it
   * from guests. Only a list of paths changes; the file is untouched.
   */
  setPhotoFlag(photoId: string, flag: PhotoFlag, on: boolean): Promise<PhotoRecord> {
    return this.serialize(async () => {
      await this.reloadFlag(flag);
      const photo = this.requirePhoto(photoId);
      const set = this.flags[flag];
      if (set.has(photo.relativePath) !== on) {
        if (on) set.add(photo.relativePath);
        else set.delete(photo.relativePath);
        await this.saveFlag(flag);
      }
      return photo;
    });
  }

  /**
   * Feature a photo, making it its album's centerpiece, or stop featuring
   * it. An album (one folder) has at most one featured photo: featuring
   * another replaces the current one only with `replace`; otherwise
   * nothing changes and the current one comes back as `current`. `frame`
   * and `mat` set the frame it hangs in (a left-out mat is kept); left
   * out, the photo keeps whatever frame it has.
   */
  setFeatured(
    photoId: string,
    featured: boolean,
    replace: boolean,
    frame?: FrameChoice,
    mat?: FrameMat,
  ): Promise<{ photo: PhotoRecord } | { current: PhotoRecord }> {
    return this.serialize(async () => {
      await this.reloadFlag('featured');
      const photo = this.requirePhoto(photoId);
      const set = this.flags.featured;
      if (featured && isInHiddenFolder(photo.directoryPath)) {
        throw new CurationActionError('photo_already_hidden', 'a hidden photo cannot be featured');
      }
      if (!featured) {
        if (set.delete(photo.relativePath)) await this.saveFlag('featured');
        return { photo };
      }
      if (set.has(photo.relativePath)) {
        if (frame) await this.storeFrame(photo, frame, mat);
        return { photo };
      }
      // Paths of photos no longer in the library still hold their folder's
      // place, so they count (and are replaced) like any other.
      const others = [...set].filter(
        (relativePath) => folderOf(relativePath) === photo.directoryPath,
      );
      if (others.length > 0 && !replace) {
        const current = this.requireSnapshot().photos.find(
          (candidate) => candidate.relativePath === others[0],
        );
        if (current) return { current };
      }
      for (const relativePath of others) set.delete(relativePath);
      set.add(photo.relativePath);
      await this.saveFlag('featured');
      if (frame) await this.storeFrame(photo, frame, mat);
      return { photo };
    });
  }

  /**
   * Pick the frame and mat a photo hangs in. `random` with the frame's own
   * mat is what an unpicked photo gets, so it clears the pick.
   */
  setPhotoFrame(photoId: string, frame: FrameChoice, mat: FrameMat): Promise<PhotoRecord> {
    return this.serialize(async () => {
      const photo = this.requirePhoto(photoId);
      await this.storeFrame(photo, frame, mat);
      return photo;
    });
  }

  /** Inside `serialize`. A left-out mat keeps the photo's current one. */
  private async storeFrame(photo: PhotoRecord, frame: FrameChoice, mat?: FrameMat): Promise<void> {
    await this.reloadPhotoFrames();
    const next = { frame, mat: mat ?? this.photoFrames.get(photo.relativePath)?.mat ?? 'frame' };
    const current = this.photoFrames.get(photo.relativePath);
    if (current?.frame === next.frame && current.mat === next.mat) return;
    if (next.frame === 'random' && next.mat === 'frame') this.photoFrames.delete(photo.relativePath);
    else this.photoFrames.set(photo.relativePath, next);
    await this.savePhotoFrames();
  }

  /** The curator's defaults for wall spacing and photo-view frames. */
  setDisplayDefaults(display: Partial<WallDisplaySettings>): Promise<AlbumSettings> {
    return this.serialize(async () => {
      await this.reloadSettings();
      const current = this.requireSettings();
      return this.saveSettings({ ...current, display: { ...current.display, ...display } });
    });
  }

  private async savePhotoFrames(): Promise<void> {
    await writePhotoFrames(this.getPaths(), this.photoFrames);
    this.photoFramesMtimeMs = await statMtime(this.getPaths().framesFile);
    this.catalogCache.clear();
  }

  private async reloadPhotoFrames(): Promise<void> {
    const paths = this.getPaths();
    this.photoFramesMtimeMs = await statMtime(paths.framesFile);
    this.photoFrames = await readPhotoFrames(paths);
    this.catalogCache.clear();
  }

  private async saveFlag(flag: PhotoFlag): Promise<void> {
    await writePhotoFlag(this.getPaths(), flag, this.flags[flag]);
    this.flagMtimes[flag] = await statMtime(photoFlagFile(this.getPaths(), flag));
    this.catalogCache.clear();
  }

  private async reloadFlag(flag: PhotoFlag): Promise<void> {
    const paths = this.getPaths();
    this.flagMtimes[flag] = await statMtime(photoFlagFile(paths, flag));
    this.flags[flag] = await readPhotoFlag(paths, flag);
    this.catalogCache.clear();
  }

  /** The light edit for a photo path, if the curator made one. */
  editFor(relativePath: string): PhotoEdit | undefined {
    return this.edits.get(relativePath);
  }

  /**
   * Save the curator's edit for a photo. Only the recipe is stored; the
   * original file is never touched. A neutral edit reverts.
   */
  saveEdit(photoId: string, edit: PhotoEdit): Promise<EditedPhotoRecord> {
    return this.serialize(async () => {
      await this.reloadEdits();
      const photo = this.requirePhoto(photoId);
      const normalized = normalizeEdit(edit);
      if (isNeutralEdit(normalized)) return this.dropEdit(photo);
      this.edits.set(photo.relativePath, normalized);
      await this.saveEdits();
      await appendEditLog(this.getPaths(), {
        at: new Date().toISOString(),
        action: 'edit',
        path: photo.relativePath,
        edit: normalized,
      });
      return withEdit(photo, normalized);
    });
  }

  /** Forget a photo's edit, so it shows as the original again. */
  revertEdit(photoId: string): Promise<EditedPhotoRecord> {
    return this.serialize(async () => {
      await this.reloadEdits();
      return this.dropEdit(this.requirePhoto(photoId));
    });
  }

  private async dropEdit(photo: PhotoRecord): Promise<EditedPhotoRecord> {
    if (this.edits.delete(photo.relativePath)) {
      await this.saveEdits();
      await appendEditLog(this.getPaths(), {
        at: new Date().toISOString(),
        action: 'revert',
        path: photo.relativePath,
      });
    }
    return photo;
  }

  private async saveEdits(): Promise<void> {
    await writeEdits(this.getPaths(), this.edits);
    this.editsMtimeMs = await statMtime(this.getPaths().editsFile);
    this.catalogCache.clear();
  }

  private async reloadEdits(): Promise<void> {
    const paths = this.getPaths();
    this.editsMtimeMs = await statMtime(paths.editsFile);
    this.edits = await readEdits(paths);
    this.catalogCache.clear();
  }

  hidePhoto(photoId: string): Promise<{ snapshot: PersistedSnapshot; photo: EditedPhotoRecord }> {
    return this.serialize(async () => {
      const photo = this.requireWritablePhoto(photoId);
      if (restoreDestinationDir(photo.directoryPath) !== null) {
        throw new CurationActionError('photo_already_hidden', 'photo is already hidden');
      }
      return this.move(photo, hiddenDestinationDir(photo.directoryPath), 'hide');
    });
  }

  restorePhoto(photoId: string): Promise<{ snapshot: PersistedSnapshot; photo: EditedPhotoRecord }> {
    return this.serialize(async () => {
      const photo = this.requireWritablePhoto(photoId);
      const destination = restoreDestinationDir(photo.directoryPath);
      if (destination === null) {
        throw new CurationActionError('photo_not_hidden', 'photo is not in a _hidden folder');
      }
      return this.move(photo, destination, 'restore');
    });
  }

  private async move(
    photo: PhotoRecord,
    toDirectory: string,
    action: 'hide' | 'restore',
  ): Promise<{ snapshot: PersistedSnapshot; photo: EditedPhotoRecord }> {
    const planned = await movePhoto({
      libraryRoot: this.options.library.getLibraryRoot(),
      relativePath: photo.relativePath,
      toDirectory,
    });
    // The files have moved; record that before anything else can fail.
    await appendMoveLog(this.getPaths(), {
      at: new Date().toISOString(),
      action,
      files: planned.files,
    });
    const { snapshot, moved } = await this.options.library.applyPhotoMoves([
      { photoId: photo.id, relativePath: planned.photoPath },
    ]);
    // The edit follows the photo to its new path.
    const movedPhoto = moved[0]!;
    await this.reloadEdits();
    const edit = this.edits.get(photo.relativePath);
    if (edit && movedPhoto.relativePath !== photo.relativePath) {
      this.edits.delete(photo.relativePath);
      this.edits.set(movedPhoto.relativePath, edit);
      await this.saveEdits();
    }
    // So do its star and privacy (a rejected photo stays out of Favorites
    // until restored). Hiding unfeatures it, and restoring doesn't feature
    // it again: its album may have a new featured photo by then.
    for (const flag of PHOTO_FLAGS) {
      await this.reloadFlag(flag);
      if (this.flags[flag].delete(photo.relativePath)) {
        if (flag !== 'featured') this.flags[flag].add(movedPhoto.relativePath);
        await this.saveFlag(flag);
      }
    }
    // Its frame follows it too.
    await this.reloadPhotoFrames();
    const frame = this.photoFrames.get(photo.relativePath);
    if (frame && movedPhoto.relativePath !== photo.relativePath) {
      this.photoFrames.delete(photo.relativePath);
      this.photoFrames.set(movedPhoto.relativePath, frame);
      await this.savePhotoFrames();
    }
    this.catalogCache.clear();
    return { snapshot, photo: withEdit(movedPhoto, this.edits.get(movedPhoto.relativePath)) };
  }

  private requireWritablePhoto(photoId: string): PhotoRecord {
    if (!this.libraryWrites) {
      throw new CurationActionError(
        'library_writes_disabled',
        'this server is not allowed to move photos (PHOTO_WALL_LIBRARY_WRITES)',
      );
    }
    return this.requirePhoto(photoId);
  }

  private requirePhoto(photoId: string): PhotoRecord {
    const photo = this.requireSnapshot().photos.find((p) => p.id === photoId);
    if (!photo) throw new CurationActionError('photo_not_found', 'photo not found');
    return photo;
  }

  private requireSnapshot(): PersistedSnapshot {
    const snapshot = this.options.library.getActiveSnapshot();
    if (!snapshot) throw new Error('library snapshot not yet available');
    return snapshot;
  }

  private requireSettings(): AlbumSettings {
    if (!this.settings) throw new Error('CurationService.initialize must be called first');
    return this.settings;
  }

  private async saveSettings(next: AlbumSettings): Promise<AlbumSettings> {
    await writeAlbumSettings(this.getPaths(), next);
    this.settings = next;
    this.settingsMtimeMs = await this.statSettings();
    this.catalogCache.clear();
    return next;
  }

  /** Read albums.json fresh, so a change starts from the other server's latest. */
  private async reloadSettings(): Promise<void> {
    const paths = this.getPaths();
    this.settingsMtimeMs = await this.statSettings();
    this.settings = await readAlbumSettings(paths);
    this.catalogCache.clear();
  }

  private statSettings(): Promise<number | null> {
    return statMtime(this.getPaths().albumsFile);
  }

  /** Curation writes run one at a time. */
  private serialize<T>(run: () => Promise<T>): Promise<T> {
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private sessionToken(): string {
    return createHmac('sha256', this.secret)
      .update(this.options.curatorPin ?? this.pinHash ?? '')
      .digest('base64url');
  }

  /** Signed with the VIP PIN's hash, so changing the PIN revokes it. */
  private vipToken(): string | null {
    if (!this.vipPinSet) return null;
    return createHmac('sha256', this.secret)
      .update(`vip:${this.vipPinHash}`)
      .digest('base64url');
  }
}

export { PhotoMoveError };

/** The folder of a root-relative photo path ('' at the library root). */
function folderOf(relativePath: string): string {
  const slash = relativePath.lastIndexOf('/');
  return slash < 0 ? '' : relativePath.slice(0, slash);
}

async function statMtime(file: string): Promise<number | null> {
  try {
    return (await fs.stat(file)).mtimeMs;
  } catch {
    return null;
  }
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function serializeCookie(name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}
