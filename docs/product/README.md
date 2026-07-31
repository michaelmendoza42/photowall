# Product Docs
Last edited: 2026-06-01
Status: Active
Scope: Canonical product behavior, rules, and shared terminology
Related files: `../glossary.md`, `../standards/documentation-model.md`, `../standards/documentation-schema.md`, `../standards/testing.md`

Use this folder for durable, human-approved truth about what the product should do.

## Key concepts

Store things like:

- intended user-visible behavior
- product rules and invariants
- edge cases that must not drift during refactors
- examples and non-goals that clarify intent
- shared product terminology

## Standard

Only put facts here that humans endorse as true enough to rely on.

If an agent drafts a new canonical behavior doc, it should do so only when explicitly asked or when the doc is clearly marked `Status: Proposed`.

Approved product behavior should not be casually rewritten.

### Canonical behavior-doc shape

A canonical behavior doc in this folder should include:

- `Status`
- `Decision owner`
- `Drafted by`
- `Approved by`
- `Change policy`

It should also include, at minimum:

- behavior summary
- rules and invariants
- edge cases and examples
- non-goals
- related docs
- changelog

### Create vs update

Create a new behavior doc when the behavior is distinct enough to reason about independently and is likely to accumulate its own edge cases or tests.

Prefer updating an existing behavior doc when the change is a refinement, clarification, or additional edge case for the same user-visible contract.

If the idea is still parked, under discussion, or not yet approved as intended product behavior, keep it in `../workshop-ideas/` instead of prematurely turning it into a behavior contract.

## Current behavior docs

- `photo-wall-experience.md` — approved baseline behavior for the first photo-wall experience

## Related docs

- `../glossary.md`
- `../workshop-ideas/README.md`
- `../standards/documentation-model.md`
- `../standards/documentation-schema.md`
- `../standards/testing.md`

## Changelog

### 2026-06-01
- Linked the approved `photo-wall-experience.md` behavior doc from the product docs index.

### 2026-05-27
- Added routing guidance to keep parked or not-yet-approved ideas in `../workshop-ideas/` until they are ready to become behavior contracts.

### 2026-05-20
- Merged canonical behavior-doc shape guidance into the product docs index.
- Added create-vs-update guidance for behavior docs.

### 2026-05-20
- Added canonical guidance for behavior-first product docs and explicit approval expectations.
