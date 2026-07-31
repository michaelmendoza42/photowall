# Documentation migration audit

- Status: Complete
- Owner: Pi
- Created: 2026-07-30
- Expires when: The behavior-first taxonomy has remained stable through the next repository cleanup
- Promote to: none

## Converged intent

Keep durable project truth under the behavior-first `docs/` taxonomy, keep temporary execution state under `work/`, and preserve explicit human authority over approved product behavior.

## Non-goals

- Reclassifying or rewriting approved product behavior
- Committing generated agent transcripts or local runtime artifacts
- Treating temporary work notes as canonical documentation

## Open uncertainties

None for the current taxonomy migration.

## Current taxonomy snapshot

- Product behavior: `docs/product/`
- Parked ideas: `docs/workshop-ideas/`
- Architecture and technical reference: `docs/system/`
- Repository policy: `docs/standards/`
- Procedures: `docs/runbooks/`
- Consequential tradeoffs: `docs/decisions/`
- Temporary plans and task state: `work/plans/` and `work/tasks/`
- Disposable experiments: `scratch/`
- Unrouted asset intake: `warp-pipe/`

## Mapping decisions

- Existing canonical photo-wall behavior remains under `docs/product/`.
- Existing runtime and library constraints remain under `docs/system/`.
- Docker/LAN operations remain under `docs/runbooks/`.
- Shared project and repository-governance terminology remains consolidated in `docs/glossary.md`.
- No legacy decision, domain, special-purpose, plan, or task buckets contained content requiring migration.

## Unresolved ambiguities

None.

## Checklist status

- [x] Current documentation classified by intent
- [x] Behavior-first category indexes present
- [x] Temporary work directories present
- [x] Legacy taxonomy paths absent
- [x] Local change-declaration guardrails documented
- [x] Migration validation passes

## Validation notes

Validated on 2026-07-30 with:

```bash
./scripts/check-migration.sh
./scripts/check-guardrails.sh
```

Both commands must pass before this migration slice is committed.
