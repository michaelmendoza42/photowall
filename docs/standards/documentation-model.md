# Repository Documentation Model
Last edited: 2026-05-27
Status: Active
Scope: Repository-wide documentation policy
Related files: `doc-routing.md`, `documentation-schema.md`, `../README.md`, `../glossary.md`

This repository separates two questions that often get conflated:

1. Where does a piece of knowledge live?
2. Who authorized it?

The documentation tiers answer the first question. The authority model answers the second.

## Authority model

Location alone does not create authority. Human approval does.

### 1. Human explicit decisions

These are binding until replaced by a newer human-approved decision.

Examples:

- direct user instructions
- approved product behavior docs
- approved system docs
- approved standards and runbooks
- approved decision records
- stable repo policy in `AGENTS.md`

### 2. AI explicit proposals

These are written-down drafts produced by an AI agent: proposed behavior docs, draft conventions, candidate standards, proposed decision records, and other suggested durable changes.

Rules:

- useful to keep for review
- not binding until a human approves them
- default home is `work/plans/` or `work/tasks/`
- if stored in canonical docs, they must be clearly marked, for example with `Status: Proposed`

### 3. AI implicit decisions

These are temporary assumptions, local defaults, inferred conventions, and implementation choices an AI made without explicit human approval.

Rules:

- disposable and revisable
- may change anytime unless they conflict with human explicit decisions
- never become policy just because they appeared in chat, code, or an AI-authored doc once

## 1. Canonical docs

Canonical docs are the durable home for repo policy and knowledge that humans expect to rely on repeatedly.

Most canonical docs should represent human-approved truth. If a canonical doc is a proposal vehicle, it must say so explicitly.

Store them in:

- `README.md`
- `AGENTS.md`
- `docs/product/`
- `docs/workshop-ideas/`
- `docs/system/`
- `docs/standards/`
- `docs/runbooks/`
- `docs/decisions/`

Canonical docs should contain things the team expects to be true enough to rely on repeatedly.

Examples:

- intended product behavior
- durable parked ideas and proposal-stage concept packets
- product rules and invariants
- architecture notes and integration contracts
- testing and repository standards
- build, test, deploy, and migration procedures
- consequential tradeoff records

## 2. Scoped operational docs

Scoped docs are still explicit, but only apply in one subtree or workflow.

Examples:

- `apps/web/AGENTS.md`
- `services/payments/AGENTS.md`
- workflow-specific instructions near a tool or script

Add a nested `AGENTS.md` when local rules differ from the repo default.

## 3. Ephemeral work artifacts

These documents are intentionally temporary.

Store them in:

- `work/plans/`
- `work/tasks/`
- `work/archived/`
- `scratch/` for disposable notes

Use them for:

- migration slices
- refactor staging notes
- active rollout plans
- checkpoint state for long-running work
- task-level execution notes
- AI-authored proposals awaiting review unless the user asked for a formal proposal doc elsewhere

Every temporary document should declare:

- `Status`
- `Owner`
- `Expires when`
- `Promote to`

## 4. Inferred memory

Inferred memory includes tool-learned preferences, chat context, temporary assumptions, or AI implicit decisions.

Use it only as a convenience.

Never treat inferred memory as authority for:

- correctness
- onboarding
- architecture
- safety
- operational procedure

If it matters, write it down explicitly.

## Promotion rule

Nothing inferred becomes policy until it is both:

- promoted into the right durable home, and
- approved by a human

When a temporary plan or recurring assumption becomes important, move it into the right durable home:

- `docs/product/` for intended behavior and product rules
- `docs/workshop-ideas/` for durable parked ideas and pre-approval concept packets
- `docs/system/` for architecture and technical reference
- `docs/standards/` for repository-wide conventions
- `docs/runbooks/` for repeatable procedures
- `docs/decisions/` for tradeoff records
- `AGENTS.md` for stable agent-operational rules

Promotion chooses the document home. Human approval makes it binding.

## Practical rules

- When classifying a doc and the home is unclear, use `doc-routing.md` before creating or moving files.
- Do not silently replace a human-approved decision with an AI-authored rewrite.
- If an approved decision needs to change, draft the replacement and ask for approval or record the superseding approval explicitly.
- Do not treat placement under `docs/` as proof that a rule is binding.
- When approval matters, encode it with metadata such as `Status`, `Decision owner`, and `Approved by`.
- Agents may draft canonical behavior docs only when explicitly asked or when the doc is clearly marked `Status: Proposed`.
- Approved behavior in `docs/product/` should not be casually rewritten.

## Anti-patterns

Avoid these failure modes:

- turning `AGENTS.md` into a junk drawer
- mixing stale task notes with repo policy
- keeping migration strategy only in chat history
- relying on inferred memory for anything safety-critical
- leaving temporary docs unlabelled so they look permanent
- treating an AI-authored doc as automatically ratified because it lives under `docs/`
- silently rewriting approved policy without human direction
- using `docs/decisions/` as the default home for ordinary behavior docs

## Changelog

### 2026-05-27
- Added `docs/workshop-ideas/` to the canonical documentation model for durable parked ideas and pre-approval concept packets.
- Updated the promotion guidance to distinguish workshop ideas from approved product behavior and temporary work.

### 2026-05-20
- Linked the routing standard as the tie-breaker for doc classification.
- Reframed canonical docs around `product`, `system`, `standards`, `runbooks`, `decisions`, and `work`.
- Added explicit rules protecting approved product behavior from casual agent rewrites.
- Moved the default home for AI-authored proposals from `plans/` and `tasks/` to `work/`.

### 2026-05-17
- Added an explicit authority model separating human-approved decisions from AI-authored proposals and AI implicit decisions.
- Clarified that promotion chooses the durable document home, while human approval is what makes a decision binding.

### 2026-04-30
- Reformatted this policy doc to match the repo documentation schema and linked it to the schema file.

### 2026-04-30
- Initial version defining the canonical, scoped, ephemeral, and inferred documentation tiers.
