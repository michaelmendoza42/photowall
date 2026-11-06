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

## Production deploy (read before touching Docker)

- Production is the Portainer stack `photo-wall` on mmdebian (host port 8092). It deploys only when the user pushes `main` from mmdebian: a post-push git hook starts project-admin's `portfolio-deploy-sync@photo-wall`, which builds the exact pushed commit, tests a candidate container, then updates the stack through Portainer.
- Committing never ships. Agents commit but never push `main`.
- Never start, rebuild, recreate, `docker rm`, or retag the production container or image by hand, and never run a Compose file under the project name `photo-wall`; doing so replaces production outside Portainer.
- Local Docker previews run as project `photo-wall-local` with image `photo-wall:local` on port 8093 (`compose.yaml`). `deploy/compose.portainer.yaml` is a reference copy of the stack; never run it.
- Policy: `~/Projects/Code/project-admin/docs/standards/app-deployment.md`.

## Local server (LAN contract)
- Docker is for deployment (`Dockerfile`, `deploy/compose.portainer.yaml`). Local dev runs natively; use the `compose.yaml` preview only to debug a container-only problem, and say so first.
- Port: `/home/michael/Projects/Code/pi-mods/bin/dev-ports ensure .` (5176), bound to `0.0.0.0`.
- The LAN Services dashboard manages the server. After implementation work: `npm run build`, then `~/Projects/Code/project-admin/scripts/portfolio-dev stop photo-wall` and `... start photo-wall`, and check `/healthz`. It serves the last build with the real library and `.photo-wall-data/`. Never start it by hand with `nohup`/`npm start`. Docs-only changes skip this.
- Keep `config/lan-services.json` `id` stable; it never stores ports or commands.

## Commits
- Short imperative subject. For behavior changes, name the product doc section in the body.
- Commit only when asked. Don't push unless asked.

## Notes
- Temporary plans go in `work/plans/`; throwaway files in `scratch/` (gitignored). Neither is authoritative.
