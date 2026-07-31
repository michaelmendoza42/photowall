import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { mountClientStatic } from '../static-client.js';

describe('mountClientStatic', () => {
  let clientRoot: string;

  beforeEach(async () => {
    clientRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'photo-wall-static-client-'));
    await fs.mkdir(path.join(clientRoot, 'assets'), { recursive: true });
    await fs.writeFile(
      path.join(clientRoot, 'index.html'),
      [
        '<!doctype html>',
        '<html lang="en">',
        '  <head>',
        '    <meta charset="UTF-8" />',
        '    <title>static client test</title>',
        '    <script type="module" src="/assets/app.js"></script>',
        '  </head>',
        '  <body>',
        '    <div id="root"></div>',
        '  </body>',
        '</html>',
      ].join('\n'),
    );
    await fs.writeFile(path.join(clientRoot, 'assets', 'app.js'), 'console.log("static-client-ok");\n');
  });

  afterEach(async () => {
    await fs.rm(clientRoot, { recursive: true, force: true });
  });

  it('serves nested asset paths and preserves SPA fallback behavior', async () => {
    const app = Fastify({ logger: false });
    await mountClientStatic(app, clientRoot);

    const assetRes = await app.inject({ method: 'GET', url: '/assets/app.js' });
    expect(assetRes.statusCode).toBe(200);
    expect(assetRes.headers['content-type']).toMatch(/javascript/);
    expect(assetRes.body).toContain('static-client-ok');

    const fallbackRes = await app.inject({ method: 'GET', url: '/albums/favorites' });
    expect(fallbackRes.statusCode).toBe(200);
    expect(fallbackRes.headers['content-type']).toMatch(/text\/html/);
    expect(fallbackRes.body).toContain('<div id="root"></div>');

    const healthRes = await app.inject({ method: 'GET', url: '/healthz' });
    expect(healthRes.statusCode).toBe(404);
    expect(healthRes.json()).toEqual({ error: 'not_found' });

    const apiRes = await app.inject({ method: 'GET', url: '/api/missing' });
    expect(apiRes.statusCode).toBe(404);
    expect(apiRes.json()).toEqual({ error: 'not_found' });

    await app.close();
  });
});
