# AGENTS.md

Personal photo-wall app for Michael's home LAN. See `README.md` and `CLAUDE.md` for commands and architecture.

## Behavior
- `docs/product/photo-wall-experience.md` is the product contract. Don't add, remove or change user-facing behavior unless Michael asks for it in his own words. If code and doc disagree, ask.
- Never record approval on Michael's behalf. When he approves a behavior change, update the doc and quote him with the date.
- Update the doc and the tests together. Don't weaken or delete a behavior test to make a change pass.
- Build what was asked. Propose extras, sandboxes or tooling in chat first; don't build them.

## Code
- Frontend is React + Pixi; backend is Fastify. Reuse existing helpers before adding new ones.
- Fix root causes; if you only contain a symptom, say so.
- Before calling work done: `npm run typecheck`, `npm test`, and the relevant Playwright specs. Report failures honestly, including pre-existing ones.

## Local server (LAN contract)
- Docker is for deployment (`Dockerfile`, `docker-compose.yml`). Local dev runs natively; use a local container only to debug a container-only problem, and say so first.
- Port: `/home/michael/Projects/Code/pi-mods/bin/dev-ports ensure .` (5176), bound to `0.0.0.0`.
- The LAN Services dashboard manages the server. After implementation work: `npm run build`, then `~/Projects/Code/project-admin/scripts/portfolio-dev stop photo-wall` and `... start photo-wall`, and check `/healthz`. It serves the last build with the real library and `.photo-wall-data/`. Never start it by hand with `nohup`/`npm start`. Docs-only changes skip this.
- Keep `config/lan-services.json` `id` stable; it never stores ports or commands.

## Commits
- Short imperative subject. For behavior changes, name the product doc section in the body.
- Commit only when asked. Don't push unless asked.

## Notes
- Temporary plans go in `work/plans/`; throwaway files in `scratch/` (gitignored). Neither is authoritative.
