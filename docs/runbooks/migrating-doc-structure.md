# Migrating doc structure
Last edited: 2026-07-30
Status: Active
Scope: Retrofitting an existing repository from the legacy doc taxonomy to the behavior-first taxonomy
Related files: `../standards/documentation-model.md`, `../standards/testing.md`, `../README.md`, `../../scripts/check-migration.sh`

## Purpose

Use this runbook when an existing repository still uses legacy buckets like `docs/adr/`, `docs/domain/`, `docs/special/`, `plans/`, or `tasks/` and you want to move it to the newer behavior-first taxonomy.

The accompanying `scripts/check-migration.sh` is the executable acceptance check for this retrofit: it verifies that legacy paths are gone and the expected current layout is present.

## Migration audit artifact

Create one audit note in the repo being migrated, usually at:

- `work/plans/doc-migration-audit.md`

The audit note should include:

- `Status`
- `Owner`
- `Expires when`
- `Promote to`
- `Current taxonomy snapshot`
- `Mapping decisions`
- `Unresolved ambiguities`
- `Checklist status`
- `Validation notes`

Use that note to make routing decisions explicit and to surface any docs that still need human judgment.

## Steps

1. Create the migration audit artifact in the repo being migrated.
2. Copy `scripts/check-migration.sh` from the canonical external `template-project` checkout into the repo being migrated so the retrofit has an executable acceptance check from the start.
3. Inventory the current docs by intent, not by current folder name.
4. Reclassify each doc using this routing guide:
   - intended product behavior, user-visible rules, invariants, shared language → `docs/product/`
   - durable parked ideas, proposal-stage concept packets, and tabled discussion outcomes worth preserving → `docs/workshop-ideas/`
   - architecture, subsystem boundaries, implementation-shaping reference, technical glossary → `docs/system/`
   - repository-wide rules, testing policy, structure rules, implementation conventions → `docs/standards/`
   - repeatable procedures, migration checklists, debug/deploy/recovery steps → `docs/runbooks/`
   - consequential tradeoff records with real alternatives and lasting rationale → `docs/decisions/`
   - active plans, task packets, migration staging notes, disposable execution state → `work/`
5. Apply the legacy-to-new mapping carefully:
   - `docs/domain/` → mostly `docs/product/`
   - `docs/adr/` → mostly `docs/decisions/`, but many behavior docs belong in `docs/product/` and some architecture notes belong in `docs/system/`
   - `docs/special/` → split across `docs/system/`, `docs/standards/`, and `docs/runbooks/`
   - `plans/` and `tasks/` → `work/`
6. Record mapping decisions and unresolved ambiguities in the audit artifact.
7. Split mixed-purpose docs when needed instead of forcing a one-to-one move.
8. Add or update approval metadata on canonical behavior docs that humans expect agents to preserve.
9. Update `AGENTS.md`, index pages, templates, and internal links to the new paths.
10. Run `./scripts/check-migration.sh`, fix every reported issue, and record the result in the audit artifact's validation notes.
11. Keep temporary compatibility notes or redirects where old links are heavily used.

## Validation

Confirm all of these before calling the migration complete:

- `./scripts/check-migration.sh` reports `PASS`.
- A new behavior spec has an obvious home in `docs/product/`.
- A durable parked idea has an obvious home in `docs/workshop-ideas/`.
- A new architecture note has an obvious home in `docs/system/`.
- Repository policy and testing guidance have an obvious home in `docs/standards/`.
- Procedures live in `docs/runbooks/`.
- Temporary work lives in `work/`.
- Decision records are rare and clearly tradeoff-oriented.
- Agents can tell, from docs plus metadata, which behavior is human-approved and should not be casually rewritten.
- The migration audit artifact is complete and its checklist status is explicit.
- Validation notes explain how the migrated repo was checked.

## Rollback

If the migration causes confusion, keep the new docs in place, add temporary compatibility notes at the old paths, and finish the classification in smaller slices rather than reverting the taxonomy itself.

## Related docs

- `../standards/documentation-model.md`
- `../standards/testing.md`
- `../../scripts/check-migration.sh`

## Changelog

### 2026-07-30
- Removed the local project-generator cross-reference, pointed reusable migration tooling to the external `template-project` source, and kept this runbook focused on repository taxonomy migration.

### 2026-05-27
- Added `docs/workshop-ideas/` to the retrofit routing guide and validation checklist for durable parked ideas.

### 2026-05-21
- Added `scripts/check-migration.sh` as the executable acceptance check for retrofit migrations.
- Updated the migration steps and validation checklist to require the migration check script.

### 2026-05-20
- Merged migration audit requirements into the retrofit runbook.
- Added the canonical retrofit runbook for moving existing repos from the legacy taxonomy to the new behavior-first structure.
