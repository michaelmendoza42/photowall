# Repository Documentation Schema
Last edited: 2026-07-30
Status: Active
Scope: Canonical and reference Markdown docs in this repository (`README.md`, `docs/**`, and similar human-facing reference docs)
Related files: `documentation-model.md`, `../templates/`

This document defines the standard structure for the docs that should stay human-readable, durable, and easy to scan.

## Scope and exclusions

In scope by default:

- root `README.md`
- files under `docs/`
- other human-facing reference READMEs a project may add later

Out of scope by default:

- `AGENTS.md`
- `work/**`
- `scratch/**`
- vendored, generated, or third-party content

Those excluded areas use their own formats unless a project explicitly opts them into this schema.

## Baseline schema

Every in-scope Markdown file should include:

1. `# Title` — a single top-level heading.
2. `Last edited: YYYY-MM-DD` — placed immediately under the title.
3. Optional metadata lines such as `Status`, `Owner`, `Scope`, `Related files`, `Decision owner`, `Drafted by`, `Approved by`, or `Change policy`.
4. Main body content.
5. `## Changelog` — always the final top-level section.
6. Reverse-chronological changelog entries with newest first.

## Date format

Use ISO `YYYY-MM-DD`.

## Changelog entry format

```md
## Changelog

### 2026-04-30
- Short bullet describing what changed.
- Another bullet if needed.

### 2026-04-18
- Earlier change.
```

Rules:

- Newest entries go first.
- Each dated entry is an `### YYYY-MM-DD` subheading.
- Changelog bullets should describe document-level changes.
- If the main body is itself a chronological log, keep that log in the body and still add a separate document changelog at the bottom.

## Doc types

### Reference READMEs

Recommended sections:

- brief description
- overview or key concepts
- usage or folder purpose
- related docs
- changelog

### Decision records

Recommended sections:

- status metadata
- decision owner / approval metadata when authority matters
- context
- decision
- consequences
- alternatives considered
- follow-up
- changelog

### Product behavior docs

Canonical behavior docs should include:

- status and approval metadata
- behavior summary
- rules and invariants
- edge cases and examples
- non-goals
- related docs
- changelog

When a behavior doc is meant to be fully canonical, it should also make the protected behavior and approval boundary obvious through metadata such as `Decision owner`, `Approved by`, and `Change policy`.

### Workshop idea docs

Canonical workshop-idea docs should include:

- status metadata such as `Parked`, `Proposed`, `Promoted`, or `Dropped`
- decision-owner and drafting metadata
- a `Resume trigger`
- idea summary or problem statement
- current understanding
- constraints
- open questions
- why the idea is parked or proposed
- what would make it ready to resume or promote
- related docs
- changelog

Workshop-idea filenames should be lowercase and hyphenated with no spaces, while the document title can stay human-friendly.

### System or standards docs

Recommended sections:

- status or scope metadata when useful
- rules, concepts, or constraints
- examples when they reduce ambiguity
- related docs
- changelog

### Runbooks

Recommended sections:

- status metadata when useful
- purpose or problem
- steps
- validation or rollback
- related docs
- changelog

## Authoring checklist

When creating or editing an in-scope doc:

- [ ] Update `Last edited:` to today's date.
- [ ] Add a new `### YYYY-MM-DD` entry at the top of `## Changelog`.
- [ ] Keep the newest changelog entry first.
- [ ] Keep `## Changelog` as the final top-level section.
- [ ] Preserve category-specific sections where they add clarity.

## Templates

Copy/paste starters live in `docs/templates/`:

- `docs/templates/general.md`
- `docs/templates/product-behavior.md`
- `docs/templates/workshop-idea.md`
- `docs/templates/system-note.md`
- `docs/templates/standard.md`
- `docs/templates/decision.md`
- `docs/templates/readme.md`
- `docs/templates/runbook.md`
- `docs/templates/work-item.md`

## Changelog

### 2026-07-30
- Localized the active schema scope to this repository; reusable project scaffolding remains owned by the external `template-project` source.

### 2026-05-27
- Added the workshop-idea doc type, including required resume-oriented metadata and filename guidance.
- Added `docs/templates/workshop-idea.md` to the template list.

### 2026-05-20
- Merged canonical behavior-doc shape guidance into the product behavior section.
- Added `non-goals` as part of the recommended shape for canonical behavior docs.
- Updated exclusions to use `work/**` instead of legacy temporary-work folders.
- Reframed the template list and doc types around product, system, standards, runbooks, and decisions.
- Added `Change policy` as a recommended metadata field for behavior-protection docs.

### 2026-05-17
- Added authority-related metadata examples such as `Decision owner`, `Drafted by`, and `Approved by`.
- Clarified that ADR-style docs should record approval metadata when authority matters.

### 2026-04-30
- Added the repository documentation schema, scoped only to canonical and reference docs.
