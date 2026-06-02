import Fastify from 'fastify';
import { ConfigValidationError, loadConfig } from './config/env.js';
import { registerHealthRoute } from './routes/health.js';
import { registerClientStatic } from './services/static-client.js';
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
    },
    'photo-wall starting',
  );

  await registerHealthRoute(app, { startedAt });
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

main().catch((error) => {
  console.error('[photo-wall] fatal startup error', error);
  process.exit(1);
});
