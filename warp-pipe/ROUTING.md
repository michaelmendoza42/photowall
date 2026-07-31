# Warp Pipe Routing
Last edited: 2026-05-21
Status: Active
Scope: First-pass routing policy for assets dropped into `warp-pipe/`
Related files: `README.md`, `AGENTS.md`, `processed-log.md`

This file gives the AI a default routing policy when the user asks it to process `warp-pipe/`.

## Default destinations

### Documentation-like assets

Move to:

- `docs/` when the asset is durable reference material
- `work/plans/` when the asset supports in-progress planning
- `work/tasks/` when the asset is task-specific and temporary
- `scratch/` when the asset is exploratory or disposable

### Images and visual assets

Prefer a destination near the work they support.

Examples:

- implementation-specific UI assets: place near the relevant app or feature subtree
- documentation screenshots: place in a docs-adjacent asset folder if one exists, otherwise ask before creating a new durable asset convention
- temporary visual references: `scratch/`

### Structured exports or data dumps

Move to the narrowest existing area that already owns that data.

If no obvious owner exists:

- temporary analysis inputs: `scratch/`
- durable operational or domain material: ask before creating a new canonical home

### Mixed bundles

If several files clearly belong together, keep the bundle intact and move it as one unit into the most appropriate existing destination.

## Decision rule

When in doubt, prefer the smallest reversible move into an existing folder.

Ask the user before:

- creating a new durable folder convention
- choosing between two equally plausible long-term homes
- interpreting an asset as canonical documentation without enough evidence

## Related docs

- `README.md`
- `AGENTS.md`
- `processed-log.md`

## Changelog

### 2026-05-21
- Updated temporary-work destinations to `work/plans/` and `work/tasks/`.

### 2026-05-12
- Added the initial routing policy for assets dropped into `warp-pipe/`.
