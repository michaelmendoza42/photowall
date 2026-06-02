# `src/server/`

Fastify + TypeScript backend. Scope of this directory:

- `config/` — env loading and validation
- `routes/` — HTTP route registration (`/healthz` today, query/playlist/media in later phases)
- `services/` — cross-cutting service wiring (static client mounting today)
- `index.ts` — entrypoint: configure logger, register routes, bind on the
  configured host/port, serve the built client in production

Later phases will add `scanner/`, `snapshots/`, `playlists/`, `media/`, and
`utils/` as outlined in `01-architecture.md`.
