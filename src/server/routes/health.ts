import type { FastifyInstance } from 'fastify';
import { HEALTHZ_PATH, type HealthResponse } from '../../shared/api/health.js';
import { SERVICE_VERSION } from '../version.js';

interface HealthRouteOptions {
  startedAt: Date;
}

export async function registerHealthRoute(
  app: FastifyInstance,
  options: HealthRouteOptions,
): Promise<void> {
  app.get(HEALTHZ_PATH, async (): Promise<HealthResponse> => {
    const now = Date.now();
    const uptimeSeconds = Math.max(
      0,
      Math.round((now - options.startedAt.getTime()) / 1000),
    );
    return {
      status: 'ok',
      service: 'photo-wall',
      startedAt: options.startedAt.toISOString(),
      uptimeSeconds,
      version: SERVICE_VERSION,
    };
  });
}
