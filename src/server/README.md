# `src/server/`
Last edited: 2026-10-22

Current Fastify + TypeScript backend.

- `index.ts` — server bootstrap, startup logging, service wiring, and bind/listen lifecycle
- `config/` — environment loading and validation
- `scanner/` — recursive library walk, supported-file filtering, metadata extraction, and year inference helpers
- `snapshots/` — library snapshot lifecycle and persisted scan state
- `query/` — paginated photo-query filtering and cursor helpers
- `curation/` — curator sessions, album display settings, the per-visitor catalog, photo moves into `_hidden`, light-edit recipes, and share links
- `playlists/` — retired; no longer wired into the server
- `media/` — media source resolution, derivative-image generation/cache helpers, and rendering light edits
- `routes/` — HTTP routes for health, library status/facets, photos, curation and share links, and media
- `services/` — production static-client mounting
- `version.ts` — service version metadata

## Changelog

### 2026-07-30
- Aligned this server reference with the repository documentation schema.
