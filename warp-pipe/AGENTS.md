# AGENTS.md

## Purpose

`warp-pipe/` is the repo's asset intake folder.

When the user asks to "check warp-pipe" or otherwise process this folder:

1. Inspect all newly added files in `warp-pipe/` except documentation files and the log.
2. Infer each asset's purpose from:
   - the current conversation
   - nearby repo structure
   - file name, extension, and file contents when relevant
   - `warp-pipe/README.md`
   - `warp-pipe/ROUTING.md`
3. Move each asset to the best destination in the repository.
4. Append a short entry to `warp-pipe/processed-log.md` recording what moved, where it went, and why.
5. If the destination is ambiguous or would create a new durable convention, ask the user one focused question before moving it.

## Guardrails

- Do not leave processed assets in `warp-pipe/` unless the user asked to keep them there.
- Do not create a brand-new destination area unless the repo structure and conversation clearly support it.
- Prefer existing canonical folders and established naming patterns.
- If an asset appears temporary or exploratory, prefer `scratch/` unless the conversation indicates a durable home.
- If multiple assets belong together, move them together into a coherent destination.

## Files that are not intake assets

Treat these as workflow files, not assets to be moved:

- `warp-pipe/AGENTS.md`
- `warp-pipe/README.md`
- `warp-pipe/ROUTING.md`
- `warp-pipe/processed-log.md`
