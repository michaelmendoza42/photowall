import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

const here = path.dirname(fileURLToPath(import.meta.url));

// In production `here` is `<root>/dist/server/services` -> `<root>/dist/client`.
// In dev (tsx) `here` is `<root>/src/server/services` -> `<root>/dist/client`
// once a build has run. If no built client exists we skip mounting and let
// the Vite dev server serve the frontend on its own port.
function resolveClientRoot(): string | null {
  const productionCandidate = path.resolve(here, '..', '..', 'client');
  if (existsSync(path.join(productionCandidate, 'index.html'))) {
    return productionCandidate;
  }
  const devCandidate = path.resolve(here, '..', '..', '..', 'dist', 'client');
  if (existsSync(path.join(devCandidate, 'index.html'))) {
    return devCandidate;
  }
  return null;
}

export async function mountClientStatic(app: FastifyInstance, root: string): Promise<void> {
  await app.register(fastifyStatic, {
    root,
    prefix: '/',
    index: ['index.html'],
  });
  app.setNotFoundHandler(async (request, reply) => {
    if (request.method !== 'GET') {
      return reply.code(404).send({ error: 'not_found' });
    }
    if (request.url.startsWith('/api') || request.url === '/healthz') {
      return reply.code(404).send({ error: 'not_found' });
    }
    return reply.sendFile('index.html');
  });
}

export async function registerClientStatic(
  app: FastifyInstance,
): Promise<{ mounted: boolean; root: string | null }> {
  const root = resolveClientRoot();
  if (!root) {
    return { mounted: false, root: null };
  }
  await mountClientStatic(app, root);
  return { mounted: true, root };
}
