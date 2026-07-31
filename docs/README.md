# Docs
Last edited: 2026-06-10

This directory holds canonical project documentation.

## Folders

- `product/` — intended product behavior, rules, invariants, and shared product language
- `workshop-ideas/` — durable parked ideas, proposal-stage concept packets, and other pre-approval docs worth preserving
- `system/` — architecture, boundaries, technical reference, and internal implementation language
- `standards/` — repository-wide policy, testing rules, structure, and conventions
- `runbooks/` — repeatable operational procedures
- `decisions/` — optional, sparse records of consequential tradeoffs
- `templates/` — copy/paste starters for canonical docs and temporary work docs

## Rule of thumb

If a fact matters to correctness, onboarding, architecture, safety, or repeatable operations, it belongs somewhere under `docs/` or in `AGENTS.md`.

If a note is still temporary, keep it in `work/` until it is ready to be promoted. If it is durable enough to preserve but not yet approved behavior, route it to `workshop-ideas/`.

## Related docs

- `product/README.md`
- `workshop-ideas/README.md`
- `system/README.md`
- `standards/README.md`
- `runbooks/README.md`
- `decisions/README.md`
- `standards/doc-routing.md`
- `standards/documentation-model.md`
- `standards/canonical-user-intent-maintenance.md`
- `standards/documentation-schema.md`

## Changelog

### 2026-06-10
- Linked the canonical user-intent maintenance rule from the docs index.

### 2026-05-27
- Added `workshop-ideas/` to the canonical docs map for durable parked ideas and pre-approval concept packets.
- Linked the workshop ideas index from the docs directory README.

### 2026-05-20
- Linked the canonical documentation routing standard from the docs index.
- Replaced the old `adr` / `domain` / `special` map with the behavior-first `product` / `system` / `standards` / `runbooks` / `decisions` taxonomy.
- Updated the docs rule of thumb to route temporary work into `work/`.

### 2026-04-30
- Added the documentation schema and templates as part of the canonical docs structure.

### 2026-04-30
- Initial docs index covering folder purpose and the promotion rule.
