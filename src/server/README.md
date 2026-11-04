# `src/server/`
Last edited: 2026-07-30

Current Fastify + TypeScript backend.

- `index.ts` — server bootstrap, startup logging, service wiring, and bind/listen lifecycle
- `config/` — environment loading and validation
- `scanner/` — recursive library walk, supported-file filtering, metadata extraction, and year inference helpers
- `snapshots/` — library snapshot lifecycle and persisted scan state
- `query/` — paginated photo-query filtering and cursor helpers
- `playlists/` — saved-filter playlist schema, storage, and service layer
- `media/` — media source resolution, derivative-image generation/cache helpers, and rendering light edits
- `routes/` — HTTP routes for health, library status/facets, photos, playlists, and media
- `services/` — production static-client mounting
- `version.ts` — service version metadata

## Changelog

### 2026-07-30
- Aligned this server reference with the repository documentation schema.
