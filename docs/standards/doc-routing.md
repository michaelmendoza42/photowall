# Documentation Routing Standard
Last edited: 2026-05-27
Status: Active
Scope: How to classify durable and temporary repository docs under the behavior-first taxonomy
Related files: `documentation-model.md`, `documentation-schema.md`, `../README.md`, `../runbooks/migrating-doc-structure.md`

This standard defines how to decide where a document belongs.

Use it whenever a human or agent is unsure whether something is a workshop idea, product behavior, system reference, repo standards, an operational runbook, a decision record, or temporary work.

## Primary routing questions

Ask these in order.

### 1. Is this temporary execution state?

If yes, it belongs in `work/` or `scratch/`, not in canonical docs.

Examples:

- active task notes
- migration slices in progress
- draft rollout plans
- disposable research notes
- AI-authored proposals awaiting human review unless the user asked for a formal canonical proposal doc

Route to:

- `work/plans/`
- `work/tasks/`
- `work/archived/`
- `scratch/`

### 2. Is this a durable idea that is worth preserving even though it is not approved behavior yet?

If yes, it belongs in `docs/workshop-ideas/`.

Examples:

- tabled ideas after a useful discussion
- proposal-stage concept packets you want humans to browse later
- parked problem statements with constraints and resume triggers
- durable pre-planning notes that should not be mixed with active execution state

Route to:

- `docs/workshop-ideas/`

### 3. Is this about what the product should do?

If yes, it belongs in `docs/product/`.

Examples:

- intended user-visible behavior
- rules and invariants the product must preserve
- edge-case behavior humans care about
- shared behavioral language
- examples and non-goals that clarify intended behavior

Route to:

- `docs/product/`

### 4. Is this about how the system is shaped to do it?

If yes, it belongs in `docs/system/`.

Examples:

- subsystem boundaries
- architecture notes
- integration contracts
- technical constraints
- internal implementation language
- data flow or dependency structure

Route to:

- `docs/system/`

### 5. Is this a repo-wide rule for how we work here?

If yes, it belongs in `docs/standards/`.

Examples:

- testing policy
- documentation policy
- repository structure rules
- coding or UI conventions
- commit guardrail declarations
- implementation paradigms expected across the repo

Route to:

- `docs/standards/`

### 6. Is this a repeatable operational procedure someone can execute?

If yes, it belongs in `docs/runbooks/`.

Examples:

- local setup steps
- validation procedures
- deploy or rollback steps
- debug or recovery checklists
- migration procedures

Route to:

- `docs/runbooks/`

### 7. Is this a record of a consequential tradeoff?

If yes, it belongs in `docs/decisions/`.

Use `docs/decisions/` only when all of these are true:

- there were real alternatives
- the choice constrains future work
- future maintainers will need the rationale, not just the outcome

Route to:

- `docs/decisions/`

## Borderline cases

### Workshop ideas vs product vs work

Use `docs/workshop-ideas/` when the question is:

- what idea should we preserve for later?
- what problem framing or concept packet is durable enough to keep, but not approved yet?
- what should a future human or agent be able to resume without digging through chat history?

Use `docs/product/` when the question is:

- what should the user experience?
- what behavior must remain true?
- what rule or edge case is human-approved?

Use `work/` when the question is:

- what execution state is only temporary?
- what plan, task note, or migration slice should disappear after the current work finishes?

Example:

- “We discussed a smarter sync conflict flow, but we are parking it until after the migration.” → `docs/workshop-ideas/`
- “When a sync conflict happens, preserve the draft and show a recovery choice.” → `docs/product/`
- “This week's migration checklist for the sync conflict refactor.” → `work/`

### Product vs system

Use `docs/product/` when the question is:

- what should the user experience?
- what behavior must remain true?
- what rule or edge case is human-approved?

Use `docs/system/` when the question is:

- how is the implementation structured?
- what boundary, data flow, or integration shape should we preserve?
- what internal technical term do maintainers need?

Example:

- “When the draft expires, preserve local content and prompt on resume.” → `docs/product/`
- “Draft restoration uses a cache-backed recovery layer between persistence and UI state.” → `docs/system/`

### Standards vs runbooks

Use `docs/standards/` when the question is:

- what rule should the repo follow repeatedly?
- what convention governs future work?

Use `docs/runbooks/` when the question is:

- what step-by-step procedure should someone execute?

Example:

- “Behavior changes must update canonical product docs and tests.” → `docs/standards/`
- “How to validate a behavior change before shipping.” → `docs/runbooks/`

### Product/system/standards vs decisions

Use normal canonical docs unless the rationale itself is important.

Example:

- “The product should preserve a draft after timeout.” → `docs/product/`
- “We chose recovery-via-local-cache instead of server persistence because of offline constraints and startup latency.” → `docs/decisions/`

## Quick routing matrix

- **What idea should we preserve for later?** → `docs/workshop-ideas/`
- **What should the product do?** → `docs/product/`
- **How is the system shaped?** → `docs/system/`
- **How do we do things in this repo?** → `docs/standards/`
- **How do I execute this procedure?** → `docs/runbooks/`
- **Why did we choose among alternatives?** → `docs/decisions/`
- **What are we changing right now?** → `work/`

## Tie-breaker rule

If a document seems mixed, do not force a bad one-folder fit.

Prefer one of these:

- split it into two smaller docs by intent
- keep the durable rule in the canonical area and move execution detail to `work/`
- keep the behavior in `docs/product/` and the implementation shape in `docs/system/`

## Related docs

- `documentation-model.md`
- `documentation-schema.md`
- `../runbooks/migrating-doc-structure.md`
- `../README.md`

## Changelog

### 2026-05-27
- Added `docs/workshop-ideas/` to the routing flow for durable parked ideas and proposal-stage concept packets.
- Added a workshop-ideas vs product vs work tie-breaker section and updated the quick routing matrix.

### 2026-05-20
- Added the canonical routing standard for choosing between `product`, `system`, `standards`, `runbooks`, `decisions`, and `work`.
