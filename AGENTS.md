# AGENTS.md

## Start here

- Read `README.md` for repo layout and onboarding.
- Treat `docs/product/`, `docs/workshop-ideas/`, `docs/system/`, `docs/standards/`, `docs/runbooks/`, and `docs/decisions/` as canonical documentation.
- Use the nearest nested `AGENTS.md` when a subtree defines additional local rules.

## Documentation model

This repo uses four tiers:

1. **Canonical docs** — durable source of truth
2. **Scoped operational docs** — local rules for a subtree or workflow
3. **Ephemeral work artifacts** — temporary plans, task notes, migration state
4. **Inferred memory** — convenience only, never authority

## Decision authority

- Human decisions are binding. Examples: direct user instructions, approved product behavior docs, approved system docs, approved standards, approved runbooks, approved decision records, and stable repo policy in canonical docs.
- AI may draft plans, docs, conventions, and proposed decision records, but drafts are not binding until a human approves them.
- Do not treat file placement under `docs/` as proof of approval.
- If a human-approved decision seems wrong or outdated, ask for confirmation or draft a replacement; do not silently override it.
- AI assumptions — temporary defaults and local implementation choices — may be revised freely unless they conflict with human decisions.

## Working rules

- Keep this file short. Only put rules here that matter in nearly every session.
- Put subtree-specific exceptions in a nested `AGENTS.md` close to the relevant code.
- Put temporary planning in `work/plans/` and `work/tasks/`.
- Default home for AI-authored proposals is `work/plans/` or `work/tasks/` unless the user asks for a formal `Status: Proposed` document in a canonical area.
- Durable tabled ideas and pre-planning idea packets belong in `docs/workshop-ideas/` with explicit proposal-style status metadata such as `Status: Parked` or `Status: Proposed`.
- Mark temporary docs with:
  - `Status`
  - `Owner`
  - `Expires when`
  - `Promote to`
- Promote anything important to correctness, onboarding, architecture, safety, or long-term operations into canonical docs before relying on it.
- Keep glossary terms compact and deduplicated; prefer updating an existing term over adding a near-duplicate.
- Do not treat tool memory, chat history, or scratch notes as the source of truth.
- Prefer minimal, targeted changes.

## Behavior and test protection

- `docs/product/` is the primary canonical home for intended product behavior.
- Agents may draft new canonical behavior docs only when explicitly asked or when the doc is clearly marked `Status: Proposed`.
- Do not materially change approved behavior docs without explicit human instruction or approval.
- For approved canonical behavior, add tests proportional to risk.
- Do not rewrite or remove behavior-protecting tests just to make a change pass unless the behavior change was explicitly authorized by a human or the canonical behavior doc changed with that approval.
- If code disagrees with approved canonical behavior, align the code/tests to the docs or escalate; do not silently redefine the behavior in code.
- When preparing commits, fill the repo's change-declaration fields accurately.
- Behavior commits must reference the governing `docs/product/` doc, update tests in the same change, and use explicit human approval truthfully.
- If a commit claims explicit approval, include a truthful `Approval-Source` that points to the approval artifact or note.

## Reuse, discoverability, and hardening

- Prefer reuse over new one-off code.
- Before adding a new component, hook, utility, type, API wrapper, style pattern, or test helper, first check whether an existing equivalent can be reused or extended.
- Avoid copy/paste implementation when the same behavior already exists elsewhere. If similar behavior appears in multiple places, extract the smallest appropriate shared unit.
- If reuse is unnecessarily difficult because relevant code is hard to find, make a small targeted discoverability improvement as part of the change. Acceptable improvements include clearer naming, re-exports, updating nearby docs, consolidating shared helpers into a more obvious location, updating imports to use the canonical shared module, or adding a short note pointing to the canonical implementation.
- When fixing bugs or regressions, prefer identifying and fixing the root cause instead of only patching symptoms. Add small preventive hardening that matches the risk and touched area when appropriate, such as tests, guards, validation, clearer contracts, or cleanup.
- Do not create broad abstractions, large structural refactors, or speculative hardening just to remove superficial duplication, improve discoverability, or future-proof code. Keep abstractions and structural improvements small and boring. Symptom-level mitigation is acceptable for immediate containment when needed, but call out any remaining root cause or follow-up clearly.
- After implementation, review the diff for repeated logic, repeated UI structure, repeated styles, repeated test setup, avoidable discoverability problems, and whether the underlying failure mode remains unaddressed; refactor or explain why they remain.
- For non-trivial changes, include a brief reuse/discoverability/hardening note in the final handoff:
  - searched: X
  - reused or extended: Y
  - created new: Z because ...
  - improved discoverability by: ...
  - hardened by / root cause addressed: ...

- When editing `README.md` or files under `docs/`, follow `docs/standards/documentation-schema.md`.
- When changing commit-guardrail files, keep `.gitmessage`, `.githooks/commit-msg`, and `docs/standards/change-declaration.md` aligned.
- Do not force that schema onto `AGENTS.md`, `work/`, or `scratch/` unless the user asks.
- Validate the changed area before claiming completion.
- Use `docs/standards/definition-of-done.md` as the default completion contract unless a narrower local rule overrides it.
- Do not edit generated files directly; change the generator or source inputs instead.

## Where decisions live

- Product behavior, rules, and shared user-facing terminology: `docs/product/`
- Durable parked ideas and pre-approval idea packets: `docs/workshop-ideas/`
- System architecture, boundaries, and technical reference: `docs/system/`
- Repository-wide policy and conventions: `docs/standards/`
- Repeatable operational procedures: `docs/runbooks/`
- Consequential tradeoff records: `docs/decisions/`

## LAN development contract

- Keep the browser development server on this repository's stable port from `/home/michael/Projects/Code/pi-mods/bin/dev-ports ensure .`; do not replace it with a framework default or hard-coded shared port.
- Bind browser development servers to `0.0.0.0`. Use `http://127.0.0.1:<port>` locally, `http://mmdebian.local:<port>` from the LAN, and `http://mmdebian.mendoza.home:<port>` from authorized Tailscale devices.
- After completed implementation work, rebuild the local app with `npm run build`, then restart its local production server with `npm start`.
- Do not build, start, or redeploy photo-wall through Docker, Docker Compose, or Portainer unless the user explicitly requests a Docker deployment.
- Resolve the stable port first, run the server with `PHOTO_WALL_BIND_HOST=0.0.0.0` and that port as `PHOTO_WALL_PORT`, then verify `/healthz`. Documentation-only work does not require an app rebuild or restart.
- This repository opts into the project-admin LAN catalog through `config/lan-services.json`. Keep its `id` stable; set `enabled` and `manageable` deliberately. The manifest never stores a port or executable command.
- Preserve this contract when changing package scripts, Vite/Next/Flask configuration, Docker development settings, or onboarding docs.

## Convergence maintenance

- Apply canonical user-intent maintenance: when user feedback changes desired future behavior, workflow shape, or shared terminology, update the governing durable docs so they reflect the refined current truth instead of leaving that refinement only in chat, memory, or scratch notes.
- Treat iterative clarification as convergence work: infer the underlying goal, use examples or counterexamples when helpful, and preserve the converged result in durable repo guidance when it is likely to matter again.
- For non-trivial work, run a brief convergence checkpoint before implementation: state what you think the user wants, what remains ambiguous, and what evidence would show that understanding is wrong.
- If this repo contains copied or scaffolded `.pi/skills/` mission wrappers, treat them as verify-only by default unless explicit repo-local evidence justifies a stronger posture. Do not silently overwrite, auto-refresh, or regenerate them.
