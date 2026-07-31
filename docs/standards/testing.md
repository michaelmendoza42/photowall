# Testing Standard
Last edited: 2026-07-30
Status: Active
Scope: Repository-wide expectations for behavior-protecting automated tests
Related files: `documentation-model.md`, `react-feature-paradigm.md`, `../product/README.md`

This standard defines how canonical product behavior should be protected in code and tests.

## Rules

- Approved canonical behavior should be protected by automated tests proportional to risk.
- Prefer the smallest test that meaningfully protects the behavior.
- Use unit tests for logic, calculations, invariants, and narrow state transitions.
- Use integration tests for multi-step workflows, cross-boundary interactions, and coordination between components or modules.
- Use visual or browser tests when the behavior is meaningfully UI-sensitive: layout, rendering, interaction choreography, console/network side effects, or responsive breakpoints.

## Behavior authority

When approved behavior lives in `docs/product/`, treat failing tests as a signal that code may have drifted from human-approved intent.

Do not assume the test is wrong just because the implementation changed.

## Test-change rule

Agents must not rewrite, delete, or weaken a behavior-protecting test merely to make a change pass unless at least one of these is true:

1. the canonical behavior changed with explicit human approval, or
2. the human explicitly approved the behavior change during the task.

If behavior is intentionally changing, update the canonical behavior doc and the tests together.

## Code comments

Use short, load-bearing comments at risky implementation points when they help prevent accidental behavior drift.

Good cases:

- non-obvious product rules
- intentionally strange edge-case handling
- lifecycle or sequencing behavior that looks simplifiable but is not
- places where a short pointer back to canonical behavior will prevent future regressions

Prefer comments that link to the canonical behavior doc when possible.

## Validation expectations

Before marking a behavior change complete, confirm:

- the canonical behavior is documented in the right place
- tests match the approved behavior
- any new risky edge case is covered by at least one meaningful automated check

## Local enforcement

Use this repository's commit template and `commit-msg` hook for behavior-sensitive changes.

At minimum, the local guardrails should:

- validate required metadata on protected behavior docs
- require behavior commits to update the governing behavior doc and tests in the same change
- require explicit approval declarations and `Approval-Source` evidence for behavior commits and edits to already-approved behavior docs
- fail fast enough that maintainers and agents will keep them enabled

## Related docs

- `change-declaration.md`
- `definition-of-done.md`
- `documentation-model.md`
- `react-feature-paradigm.md`
- `../product/README.md`
- `../runbooks/README.md`

## Changelog

### 2026-07-30
- Localized the commit-guardrail guidance to this repository.

### 2026-05-20
- Strengthened the local guardrail recommendation to require `Approval-Source` evidence for explicit approval claims.
- Linked the definition-of-done standard from the testing standard.
- Linked the declaration-based local git guardrails to the testing standard.
- Added the canonical testing policy tying automated tests to approved product behavior.
- Added the rule forbidding casual rewrites of behavior-protecting tests without explicit behavior approval.
