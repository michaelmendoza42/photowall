# Standards Docs
Last edited: 2026-07-30
Status: Active
Scope: Repository-wide policy, conventions, and structural rules
Related files: `change-declaration.md`, `definition-of-done.md`, `doc-routing.md`, `documentation-model.md`, `documentation-schema.md`, `testing.md`, `../../scripts/check-guardrails.sh`

Use this folder for stable rules about how the repository should be organized and maintained.

## Key concepts

Store things like:

- documentation standards
- doc classification and routing rules
- definition-of-done rules
- testing policy
- local git guardrail declarations
- guardrail health checks
- implementation paradigms and conventions
- repository structure rules
- repo-wide UI or coding standards

## Standard

If a document explains how the repository should be run or changed repeatedly, but it is not an operational checklist, it probably belongs here.

If it is a step-by-step procedure someone can execute, prefer `../runbooks/`.

## Related docs

- `change-declaration.md`
- `definition-of-done.md`
- `doc-routing.md`
- `documentation-model.md`
- `documentation-schema.md`
- `testing.md`
- `react-feature-paradigm.md`
- `../runbooks/README.md`
- `../../scripts/check-guardrails.sh`

## Changelog

### 2026-07-30
- Removed the nonexistent template CI reference and kept local guardrails as the documented enforcement boundary.

### 2026-05-20
- Consolidated redundant standards references into the surviving core standards set.
- Linked the guardrail health check from the standards index.
- Linked the definition-of-done standard from the standards index.
- Linked the documentation routing standard from the standards index.
- Linked the local git guardrail declaration standard from the standards index.
- Added the canonical home for repository-wide policy and conventions.
