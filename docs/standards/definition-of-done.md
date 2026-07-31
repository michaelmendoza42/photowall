# Definition of Done Standard
Last edited: 2026-07-30
Status: Active
Scope: Repository-wide completion criteria for behavior-first implementation work
Related files: `testing.md`, `change-declaration.md`, `doc-routing.md`, `documentation-model.md`

This standard defines when a change is actually done.

Use it as the default completion contract for agents and humans unless a narrower subtree rule overrides it.

## Core rule

A change is done only when code, canonical docs, tests, commit declarations, and validation all agree.

## Required checks

### 1. Code is updated

The implementation reflects the intended change.

### 2. Canonical docs are updated when durable truth changed

If the change affects any of these, update the corresponding canonical docs in the same work stream:

- intended product behavior → `docs/product/`
- durable parked idea or pre-approval concept packet → `docs/workshop-ideas/`
- system structure or technical reference → `docs/system/`
- repo-wide rules or conventions → `docs/standards/`
- operational procedures → `docs/runbooks/`
- consequential tradeoff rationale → `docs/decisions/`

If the change is only temporary execution state, keep it in `work/` instead.

For canonical product behavior docs, use the shape defined in `docs/product/README.md` plus the category guidance in `documentation-schema.md`.

## 3. Tests are updated proportional to risk

- update or add unit tests for logic and invariants when needed
- update or add integration tests for workflow or boundary behavior when needed
- update or add visual or browser tests when UI-sensitive behavior is at risk

Do not treat a change as done if approved behavior changed but its protecting tests were left behind.

## 4. Change declarations are accurate

When this repository's local git guardrails apply:

- fill commit declaration fields truthfully
- classify behavior commits accurately
- reference the governing behavior doc when required
- do not claim explicit approval unless a human actually gave it

## 5. Validation was performed

Before completion, confirm the changed area was actually checked.

Validation should match the type of change, for example:

- automated tests
- targeted manual verification
- browser or visual verification
- scaffold or script execution
- documentation path/routing sanity checks

## Common completion failures

A change is **not** done if any of these are true:

- code changed but canonical behavior drifted without a doc update
- approved behavior changed but tests were not updated
- tests were changed to fit behavior drift without explicit approval
- a structural or policy change happened but only chat context knows about it
- the commit declaration fields are inaccurate
- no meaningful validation happened

## Practical finish rule for agents

Before reporting completion, an agent should ask:

- did behavior change?
- if yes, was `docs/product/` updated?
- did structure or policy change?
- if yes, were the right canonical docs updated?
- do tests still protect the intended behavior?
- was the changed area validated?

If any answer is no, the work is not done yet.

## Related docs

- `testing.md`
- `change-declaration.md`
- `doc-routing.md`
- `documentation-model.md`
- `../product/README.md`
- `../runbooks/README.md`

## Changelog

### 2026-07-30
- Localized the change-declaration completion rule to this repository.

### 2026-05-27
- Added `docs/workshop-ideas/` to the canonical-doc update checklist for durable parked ideas and pre-approval concept packets.

### 2026-05-20
- Consolidated behavior-doc completion guidance into the definition-of-done contract.
- Added the canonical repository-wide definition of done for code, docs, tests, declarations, and validation.
