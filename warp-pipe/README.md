# Warp Pipe
Last edited: 2026-05-21
Status: Active
Scope: Asset intake workflow for this repository
Related files: `AGENTS.md`, `ROUTING.md`, `processed-log.md`, `../docs/glossary.md`

`warp-pipe/` is the repository's intake folder for assets that have not been routed yet.

Drop a file here when you want the AI to inspect it, infer where it belongs, and move it into the repo's proper structure.

## How to use it

1. Place an asset in `warp-pipe/`.
2. Tell the AI to "check warp-pipe".
3. The AI reads the local instructions, uses the conversation and repo context, and chooses the best destination.
4. The AI moves the asset and records the action in `processed-log.md`.
5. If the destination is unclear, the AI asks one focused question before moving it.

## What belongs here

Examples:

- images, screenshots, and design assets waiting to be filed
- notes or exports that belong somewhere in `docs/`, `work/plans/`, `work/tasks/`, or `scratch/`
- one-off files imported during an active conversation when the final home is not obvious yet

## What should not stay here

`warp-pipe/` is a temporary intake area, not a durable storage location.

After processing, assets should usually move into a canonical or clearly scoped destination elsewhere in the repo.

## Routing rules

See `ROUTING.md` for the first-pass routing policy.

## Related docs

- `AGENTS.md`
- `ROUTING.md`
- `processed-log.md`
- `../docs/glossary.md`

## Changelog

### 2026-05-21
- Updated glossary and temporary-work references to the current taxonomy.

### 2026-05-12
- Added the initial Warp Pipe README describing the intake workflow and usage pattern.
