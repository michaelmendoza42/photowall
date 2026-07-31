# React Feature Paradigm
Last edited: 2026-07-30
Status: Active
Scope: Default frontend feature implementation guidance for this repository
Related files: `../../README.md`, `documentation-model.md`, `testing.md`

This standard defines the default implementation paradigm for frontend product features in this repository.

## Rule

Use React.js as the default paradigm for building new frontend features unless a project-specific standard, decision record, or explicit user direction states otherwise.

## Expectations

- New UI features should be implemented as React components.
- Feature behavior should be organized around React state, props, and composition patterns.
- Non-React implementations for frontend features should be treated as exceptions and documented.

## Validation

Before marking feature work complete, confirm:

- the feature follows React component architecture
- any divergence from React is explicitly justified in project docs or task notes

## Related docs

- `../../README.md`
- `documentation-model.md`
- `testing.md`

## Changelog

### 2026-07-30
- Localized the React feature guidance to this repository.

### 2026-05-20
- Reclassified the React implementation paradigm as a repository standard instead of a runbook.
- Updated related docs to the new taxonomy.

### 2026-05-11
- Added the canonical runbook defining React.js as the default paradigm for feature implementation.
