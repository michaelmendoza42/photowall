import path from 'node:path';
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { ScanState } from '../../shared/api/library.js';
import { scanLibrary } from '../scanner/walk.js';
import { buildSnapshot, type PersistedSnapshot } from './schema.js';
import {
  DataRootError,
  ensureDataPaths,
  readSnapshotIfPresent,
  resolveSnapshotPaths,
  writeSnapshotAtomically,
  type SnapshotPaths,
} from './storage.js';
import {
  readLibraryRootOverride,
  writeLibraryRootOverride,
} from '../config/library-root-override.js';

export interface LibraryServiceLogger {
  debug?: (obj: unknown, msg?: string) => void;
  info?: (obj: unknown, msg?: string) => void;
  warn?: (obj: unknown, msg?: string) => void;
  error?: (obj: unknown, msg?: string) => void;
}

export interface LibraryServiceOptions {
  libraryRoot: string;
  dataRoot: string;
  scanTopLevelYearsOnly?: boolean;
  logger?: LibraryServiceLogger;
}

export class LibraryRootError extends Error {
  constructor(message: string, public readonly path: string) {
    super(message);
    this.name = 'LibraryRootError';
  }
}

interface ServiceState {
  active: PersistedSnapshot | null;
  state: ScanState;
  warmLoaded: boolean;
  lastError: { message: string; at: string } | null;
  lastRescanStartedAt: string | null;
  lastRescanCompletedAt: string | null;
}

/**
 * The LibraryService is the single owner of the active snapshot in
 * memory. Routes read from it; nobody else mutates it.
 *
 * Lifecycle:
 *  - `initialize()` validates roots, warm-loads any prior snapshot.
 *  - `rescan()` runs a fresh scan. Concurrent callers receive the
 *    same in-flight promise (coalescing) so a manual rescan can never
 *    overlap with the startup rescan.
 */
export class LibraryService {
  private readonly logger?: LibraryServiceLogger;
  private configuredLibraryRoot: string;
  private resolvedLibraryRoot: string | null = null;
  private snapshotPaths: SnapshotPaths;
  private inflight: Promise<PersistedSnapshot> | null = null;
  private snapshot: ServiceState = {
    active: null,
    state: 'idle',
    warmLoaded: false,
    lastError: null,
    lastRescanStartedAt: null,
    lastRescanCompletedAt: null,
  };

  constructor(private readonly options: LibraryServiceOptions) {
    this.logger = options.logger;
    this.configuredLibraryRoot = options.libraryRoot;
    this.snapshotPaths = resolveSnapshotPaths(options.dataRoot);
  }

  /**
   * Validate roots, prepare the data dir + cache dir, and warm-load any
   * existing snapshot from disk.
   */
  async initialize(): Promise<void> {
    this.snapshotPaths = await ensureDataPaths(this.options.dataRoot);
    const overrideLibraryRoot = await readLibraryRootOverride(
      this.snapshotPaths.dataRoot,
    );
    this.configuredLibraryRoot = overrideLibraryRoot ?? this.options.libraryRoot;
    this.resolvedLibraryRoot = await this.validateLibraryRoot(
      this.configuredLibraryRoot,
    );
    this.assertMountDiscipline(
      this.resolvedLibraryRoot,
      this.snapshotPaths.dataRoot,
    );

    const prior = await readSnapshotIfPresent(this.snapshotPaths.snapshotFile);
    if (prior && prior.libraryRoot === this.resolvedLibraryRoot) {
      this.snapshot.active = prior;
      this.snapshot.warmLoaded = true;
      this.snapshot.state = 'ready';
      this.logger?.info?.(
        {
          snapshotId: prior.snapshotId,
          schemaVersion: prior.schemaVersion,
          photoCount: prior.photoCount,
          warningCount: prior.warnings.length,
          folderCount: prior.folders.length,
          yearCount: prior.years.length,
          scannedAt: prior.scannedAt,
        },
        'warm-loaded prior snapshot',
      );
    } else {
      this.logger?.debug?.(
        { hasPriorSnapshot: Boolean(prior) },
        'no compatible prior snapshot on disk — will scan from cold',
      );
    }
  }

  getLibraryRoot(): string {
    if (!this.resolvedLibraryRoot) {
      throw new Error('LibraryService.initialize must be called before getLibraryRoot');
    }
    return this.resolvedLibraryRoot;
  }

  getConfiguredLibraryRoot(): string {
    return this.configuredLibraryRoot;
  }

  getDataRoot(): string {
    return this.snapshotPaths.dataRoot;
  }

  getCacheDir(): string {
    return this.snapshotPaths.cacheDir;
  }

  getActiveSnapshot(): PersistedSnapshot | null {
    return this.snapshot.active;
  }

  getStateView(): ServiceState {
    return { ...this.snapshot };
  }

  async updateLibraryRoot(input: string): Promise<PersistedSnapshot> {
    const nextConfiguredRoot = input.trim();
    const nextResolvedRoot = await this.validateLibraryRoot(nextConfiguredRoot);
    this.assertMountDiscipline(nextResolvedRoot, this.snapshotPaths.dataRoot);
    await writeLibraryRootOverride(this.snapshotPaths.dataRoot, nextResolvedRoot);
    this.configuredLibraryRoot = nextResolvedRoot;
    this.resolvedLibraryRoot = nextResolvedRoot;
    this.snapshot.active = null;
    this.snapshot.state = 'idle';
    this.snapshot.warmLoaded = false;
    this.snapshot.lastError = null;
    return this.rescan();
  }

  /**
   * Run a scan and atomically replace the persisted snapshot.
   * Coalesces concurrent callers onto a single in-flight scan.
   */
  rescan(): Promise<PersistedSnapshot> {
    if (this.inflight) {
      return this.inflight;
    }
    const promise = this.doRescan();
    this.inflight = promise;
    promise.finally(() => {
      if (this.inflight === promise) {
        this.inflight = null;
      }
    });
    return promise;
  }

  private async doRescan(): Promise<PersistedSnapshot> {
    if (!this.resolvedLibraryRoot) {
      throw new Error('LibraryService.initialize must be called before rescan');
    }
    const startedAt = new Date().toISOString();
    this.snapshot.state = 'scanning';
    this.snapshot.lastRescanStartedAt = startedAt;
    this.logger?.info?.(
      { libraryRoot: this.resolvedLibraryRoot },
      'starting library scan',
    );

    try {
      const scan = await scanLibrary(this.resolvedLibraryRoot, {
        logger: this.logger,
        topLevelYearsOnly: this.options.scanTopLevelYearsOnly ?? false,
      });
      const snapshot = buildSnapshot(scan, randomUUID());
      await writeSnapshotAtomically(this.snapshotPaths.snapshotFile, snapshot);
      this.snapshot.active = snapshot;
      this.snapshot.state = 'ready';
      this.snapshot.lastRescanCompletedAt = new Date().toISOString();
      this.snapshot.lastError = null;
      this.logger?.info?.(
        {
          snapshotId: snapshot.snapshotId,
          schemaVersion: snapshot.schemaVersion,
          photoCount: snapshot.photoCount,
          warningCount: snapshot.warnings.length,
          folderCount: snapshot.folders.length,
          yearCount: snapshot.years.length,
          durationMs: snapshot.scanDurationMs,
        },
        'library scan completed',
      );
      return snapshot;
    } catch (err) {
      this.snapshot.state = 'error';
      this.snapshot.lastError = {
        message: err instanceof Error ? err.message : String(err),
        at: new Date().toISOString(),
      };
      this.logger?.error?.({ err }, 'library scan failed');
      throw err;
    }
  }

  private async validateLibraryRoot(input: string): Promise<string> {
    let real: string;
    try {
      real = await fs.realpath(input);
    } catch (err) {
      throw new LibraryRootError(
        `library root not found or unreadable: ${input} (${errMessage(err)})`,
        input,
      );
    }
    let stat;
    try {
      stat = await fs.stat(real);
    } catch (err) {
      throw new LibraryRootError(
        `library root could not be stat'd: ${real} (${errMessage(err)})`,
        real,
      );
    }
    if (!stat.isDirectory()) {
      throw new LibraryRootError(
        `library root is not a directory: ${real}`,
        real,
      );
    }
    try {
      // R_OK probe — fails clearly when the mount is unreadable.
      await fs.access(real, fs.constants.R_OK);
    } catch (err) {
      throw new LibraryRootError(
        `library root not readable: ${real} (${errMessage(err)})`,
        real,
      );
    }
    return real;
  }

  private assertMountDiscipline(
    libraryRoot: string,
    dataRoot: string,
  ): void {
    if (pathsOverlap(libraryRoot, dataRoot)) {
      throw new DataRootError(
        `data root must stay separate from the library root to preserve read-only source and writable app-state discipline: library=${libraryRoot} data=${dataRoot}`,
        dataRoot,
      );
    }
  }
}

function pathsOverlap(a: string, b: string): boolean {
  return isWithin(a, b) || isWithin(b, a);
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
