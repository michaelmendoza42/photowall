import { promises as fs } from 'node:fs';
import Fastify from 'fastify';
import { ConfigValidationError, loadConfig } from './config/env.js';
import { registerHealthRoute } from './routes/health.js';
import { registerLibraryRoutes } from './routes/library.js';
import { registerMediaRoutes } from './routes/media.js';
import { registerPhotoRoutes } from './routes/photos.js';
import { registerPlaylistRoutes } from './routes/playlists.js';
import { registerClientStatic } from './services/static-client.js';
import { DerivativeService } from './media/derivative-service.js';
import { DerivativeWarmer } from './media/derivative-warmer.js';
import { PlaylistService } from './playlists/service.js';
import {
  LibraryRootError,
  LibraryService,
} from './snapshots/library-service.js';
import type { PersistedSnapshot } from './snapshots/schema.js';
import { DataRootError } from './snapshots/storage.js';
import { SERVICE_VERSION } from './version.js';

async function main(): Promise<void> {
  const startedAt = new Date();

  let config;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      // Surface config errors clearly so Docker logs are intelligible.
      console.error('[photo-wall] startup failed: invalid configuration');
      for (const issue of error.issues) {
        console.error(`  - ${issue}`);
      }
      process.exit(1);
    }
    throw error;
  }

  const app = Fastify({
    logger: {
      level: config.logLevel,
    },
    disableRequestLogging: false,
  });

  app.log.info(
    {
      service: 'photo-wall',
      version: SERVICE_VERSION,
      nodeEnv: config.nodeEnv,
      libraryRoot: config.libraryRoot,
      dataRoot: config.dataRoot,
      scanTopLevelYearsOnly: config.scanTopLevelYearsOnly,
    },
    'photo-wall starting',
  );

  await registerHealthRoute(app, { startedAt });

  const libraryService = new LibraryService({
    libraryRoot: config.libraryRoot,
    dataRoot: config.dataRoot,
    scanTopLevelYearsOnly: config.scanTopLevelYearsOnly,
    logger: app.log,
  });
  try {
    await libraryService.initialize();
  } catch (error) {
    if (error instanceof LibraryRootError) {
      app.log.error(
        { libraryRoot: error.path, err: error.message },
        'startup failed: library root invalid',
      );
      process.exit(1);
    }
    if (error instanceof DataRootError) {
      app.log.error(
        { dataRoot: error.path, err: error.message },
        'startup failed: data root invalid',
      );
      process.exit(1);
    }
    throw error;
  }
  await registerLibraryRoutes(app, libraryService);

  const playlistService = new PlaylistService(libraryService.getDataRoot());
  await playlistService.initialize();
  await registerPlaylistRoutes(app, playlistService);
  await registerPhotoRoutes(app, {
    library: libraryService,
    playlists: playlistService,
  });

  const derivativeService = new DerivativeService({
    cacheRoot: libraryService.getCacheDir(),
    logger: app.log,
  });
  await registerMediaRoutes(app, {
    library: libraryService,
    derivatives: derivativeService,
  });

  // Pre-generate overview thumbnails in the background so panning hits the
  // cache instead of decoding full-size originals on demand.
  const derivativeWarmer = new DerivativeWarmer({
    derivatives: derivativeService,
    logger: app.log,
  });
  const startWarmUp = (snapshot: PersistedSnapshot) => {
    if (!config.prewarmDerivatives) return;
    derivativeWarmer.warm(snapshot).catch((err) => {
      app.log.error({ err }, 'derivative warm-up failed');
    });
  };
  libraryService.onSnapshotActivated(startWarmUp);

  const libraryRootWritable = await isWritable(libraryService.getLibraryRoot());
  if (config.nodeEnv === 'production' && libraryRootWritable) {
    app.log.warn(
      { libraryRoot: libraryService.getLibraryRoot() },
      'library root is writable — expected a read-only mount for production/trusted-LAN runtime',
    );
  }

  const startupState = libraryService.getStateView();
  const activeSnapshot = libraryService.getActiveSnapshot();
  app.log.info(
    {
      libraryRoot: libraryService.getLibraryRoot(),
      dataRoot: libraryService.getDataRoot(),
      cacheDir: libraryService.getCacheDir(),
      playlistsDir: playlistService.getPaths().playlistsDir,
      libraryRootWritable,
      scanState: startupState.state,
      warmLoaded: startupState.warmLoaded,
      snapshotId: activeSnapshot?.snapshotId ?? null,
      snapshotSchemaVersion: activeSnapshot?.schemaVersion ?? null,
      photoCount: activeSnapshot?.photoCount ?? 0,
      warningCount: activeSnapshot?.warnings.length ?? 0,
      scanTopLevelYearsOnly: config.scanTopLevelYearsOnly,
    },
    'startup summary',
  );

  // Kick off the initial scan in the background. We do not block the
  // listen() call so a warm-loaded snapshot can serve traffic immediately
  // and a cold start still surfaces a working health endpoint while the
  // scan progresses. Errors are already captured by the service state.
  const warmLoadedSnapshot = libraryService.getActiveSnapshot();
  if (warmLoadedSnapshot) startWarmUp(warmLoadedSnapshot);
  libraryService.rescan().catch((err) => {
    app.log.error({ err }, 'background library scan failed');
  });

  const staticResult = await registerClientStatic(app);
  app.log.info(
    {
      mounted: staticResult.mounted,
      root: staticResult.root,
    },
    staticResult.mounted
      ? 'serving built client assets'
      : 'client assets not found — frontend served by Vite dev server',
  );

  try {
    const address = await app.listen({
      host: config.bindHost,
      port: config.port,
    });
    app.log.info({ address }, 'photo-wall listening');
  } catch (error) {
    app.log.error({ err: error }, 'photo-wall failed to bind');
    process.exit(1);
  }

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, 'error during shutdown');
      process.exit(1);
    }
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

async function isWritable(target: string): Promise<boolean> {
  try {
    await fs.access(target, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

main().catch((error) => {
  console.error('[photo-wall] fatal startup error', error);
  process.exit(1);
});
