# Canonical User-Intent Maintenance
Last edited: 2026-07-30
Status: Active
Scope: Repo-wide rule for preserving the refined current truth when user intent becomes clearer over time
Related files: `../../AGENTS.md`

Canonical docs should preserve the best current understanding of what the user wants. They are not chat transcripts, feedback dumps, or scratch pads.

## Core rules

1. When user feedback changes durable expected behavior, workflow shape, preferences, or shared terminology, update the governing canonical doc instead of leaving that refinement only in conversation.
2. Make superseding updates. Replace obsolete wording so the doc reads as current truth, not a transcript of how the team got there.
3. Run a brief convergence checkpoint before non-trivial implementation: what you think the user wants, what remains ambiguous, and what evidence would prove that understanding wrong.
4. If a stable term is missing, propose one, confirm it when needed, and update the nearest glossary or durable terminology note if the repo has one.
5. Use a confidence-and-impact threshold for clarification:
   - low-impact ambiguity → make a labeled local assumption
   - high-impact ambiguity → clarify before proceeding
6. Keep proposals clearly labeled as proposals after convergence. Do not silently expand scope.

## Minimal checklist

- understand the underlying goal well enough to describe the converged intent clearly
- update the governing durable doc when the refined intent is likely to matter again
- remove or rewrite obsolete wording when newer understanding supersedes it
- improve discoverability when future humans or agents will need to find the rule again

## Anti-patterns

- implementing the user's first phrasing while ignoring later refinements
- aligning in chat but never promoting that understanding into durable repo truth
- using curiosity as permission to expand scope
- silently overwriting copied mission-wrapper files instead of verifying posture first

## Related docs

- `documentation-model.md`
- `documentation-schema.md`
- `../../AGENTS.md`

## Changelog

### 2026-07-30
- Added the required related-docs and changelog sections so the standard conforms to the repository documentation schema.

### 2026-06-10
- Added the canonical user-intent maintenance and convergence rules.
