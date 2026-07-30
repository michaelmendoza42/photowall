# Glossary
Last edited: 2026-07-29
Status: Active
Scope: Shared behavioral and technical terminology for repositories created from this template
Related files: `README.md`, `product/README.md`, `workshop-ideas/README.md`, `system/README.md`, `standards/documentation-model.md`, `standards/documentation-schema.md`

Use this glossary for terms that should mean the same thing across the repo.

## How this glossary is organized

This glossary has two sections:

- **Behavioral / product / repo terms** — shared language about canonical docs, authority, workflow, and product-facing intent
- **Technical / implementation terms** — internal architecture, state, integration, rendering, reliability, and AI-built structure language

When adding a term, put it in the section that best matches how the term is used.

## Glossary maintenance

Keep this file compact and deduplicated.

Add a term only when it is genuinely shared, repeatedly useful, or important for avoiding confusion during implementation, review, or handoff.

Prefer updating an existing term over adding a near-duplicate. If a term is no longer preferred, mark it as deprecated or alias it to the canonical term instead of silently drifting away from it.

## Behavioral / product / repo terms

### AGENTS.md
The stable agent-instruction file for a repository or subtree. It contains rules that are expected to stay true across many sessions.

### AI explicit proposal
A draft policy, decision, convention, or durable suggestion written down by an AI agent. It is reviewable, but not binding until a human approves it.

### AI implicit decision
A temporary assumption, default, local implementation choice, or inferred convention made by an AI agent without explicit human approval. AI implicit decisions are disposable and may change at any time unless they conflict with human decisions.

### Bootstrap-empty target
A destination directory that only contains bootstrap-local state such as `.git/`, `.pi/`, or `.DS_Store`, with no real project files yet. Template scaffolding may treat this as a fresh repo target without requiring `--force`.

### Canonical docs
Durable source-of-truth documentation that humans and agents can rely on repeatedly. In this template, canonical docs are the home for approved durable policy and, when clearly marked, formal proposals under review.

### Product docs
Documentation in `docs/product/` that records intended product behavior, shared language, rules, and invariants.

### Photo wall
The core product surface in this repo: a large, minimal, gapless web page of photos sourced from a configured directory.

- **Lives in:** `docs/product/photo-wall-experience.md`
- **Why it exists:** names the primary user-facing experience and anchors later implementation decisions to the intended browsing surface
- **Used by:** product behavior, future UI architecture, loading behavior, and filtering behavior
- **Change risk:** high — changing this definition changes the whole product direction
- **Surfaced to users:** yes — this is the product itself
- **Notes:** the wall is photo-first, visually minimal, gapless, and browsed via true two-axis trackpad panning or mouse click-drag panning rather than vertical scrolling

### Photos directory
The configured filesystem directory that supplies the photo collection shown by the wall.

- **Lives in:** `docs/product/photo-wall-experience.md`
- **Why it exists:** defines the source of the library the product visualizes
- **Used by:** future ingestion logic, folder filtering, and library-scoping behavior
- **Change risk:** high — changing the source model affects loading, filtering, and project scope
- **Alias:** source photos directory
- **Surfaced to users:** indirectly — users depend on or choose the configured directory

### Library root
The single configured root folder that the app scans for photos and subfolders.

- **Lives in:** `docs/product/photo-wall-experience.md`, `docs/system/photo-library-source-and-runtime.md`
- **Why it exists:** defines the one filesystem entry point the app uses to discover the photo library
- **Used by:** Docker configuration, scanning logic, folder filtering, and future indexing
- **Change risk:** high — changing this affects ingest, deployment, and browsing assumptions
- **Alias:** configured photos root
- **Surfaced to users:** indirectly — operators configure it, and users browse what it contains

### Year folder
A likely top-level organizational folder under the library root, used to group photos by year.

- **Lives in:** `docs/system/photo-library-source-and-runtime.md`
- **Why it exists:** captures the current expected high-level organization of the library without hardcoding it as the only valid shape
- **Used by:** year-oriented browsing, scan expectations, and test fixtures
- **Change risk:** medium — it affects defaults and assumptions, but is not the sole valid source shape
- **Surfaced to users:** indirectly — it may appear in folder-based browsing and filtering

### Event folder
A likely subfolder beneath a year folder that groups the actual photos for one event or shoot.

- **Lives in:** `docs/system/photo-library-source-and-runtime.md`
- **Why it exists:** names the expected mid-level grouping in the initial library organization
- **Used by:** folder discovery, folder filters, and likely playlist organization
- **Change risk:** medium — it shapes defaults, but should not become an inflexible hard requirement
- **Surfaced to users:** indirectly — it may appear in folder-based browsing and filtering

### Playlist
A reusable, server-persisted saved-filter preset that the user can switch to from the interface. For the MVP, a playlist is a saved combination of year and folder filters, not a hand-curated photo list.

- **Lives in:** `docs/product/photo-wall-experience.md`, `docs/system/photo-library-source-and-runtime.md`
- **Why it exists:** gives the product a durable way to revisit meaningful filtered views of the library without a heavier curation model
- **Used by:** filter controls, server-side persistence, and future saved-view behavior
- **Change risk:** medium to high — changing this meaning will affect both product behavior and storage design
- **Alias:** saved-filter playlist
- **Surfaced to users:** yes — playlists are part of the planned UI
- **Notes:** stale or missing folder references in a saved playlist must degrade gracefully rather than crash the app

### Two-axis trackpad panning
The MVP motion model for the photo wall: trackpad wheel deltas drive simultaneous horizontal and vertical camera movement across the wall, rather than only vertical scrolling.

- **Lives in:** `docs/product/photo-wall-experience.md`
- **Why it exists:** names the primary navigation gesture that makes the wall feel like a 2D photo surface instead of a normal scrollable gallery
- **Used by:** camera/interaction subsystem, rendering logic, and UX validation
- **Change risk:** medium to high — changing this alters the feel of the product
- **Surfaced to users:** yes — users experience it directly even if the label stays internal

### Click-drag panning
The MVP fallback navigation gesture for mice without trackpad wheel input: pressing and dragging the wall moves the camera, and crossing the drag threshold suppresses the click-to-open-modal activation.

- **Lives in:** `docs/product/photo-wall-experience.md`
- **Why it exists:** ensures the wall stays navigable on mouse-only hardware while keeping the modal-open click intent unambiguous
- **Used by:** camera/interaction subsystem and modal-open logic
- **Change risk:** medium — affects both panning feel and accidental-modal-open behavior
- **Surfaced to users:** yes — directly experienced when click-dragging

### Anchored hover preview
The larger hover-only photo preview shown on desktop fine-pointer devices. It stays anchored to the source tile, targets about the midpoint between that tile’s current rendered size and that photo’s eventual focused-photo modal render size, and disappears during drag or while the modal is open.

- **Lives in:** `docs/product/photo-wall-experience.md`
- **Why it exists:** distinguishes the approved hover behavior from both a tiny tile-scale effect and a centered lightbox-like hover overlay
- **Used by:** wall interaction logic, hover-preview sizing, and browser regression coverage
- **Change risk:** medium — changing it affects hover sizing, layering, and the click-vs-drag interaction contract
- **Alias:** hover preview
- **Surfaced to users:** yes — directly experienced while browsing the wall

### Focused-photo modal
The simple, viewport-sized overlay opened when a user clicks a non-dragged photo. It has an explicit visible `X` close control and returns the user to the same wall context on close.

- **Lives in:** `docs/product/photo-wall-experience.md`
- **Why it exists:** preserves a minimal default UI while still letting users inspect a single photo at a larger size
- **Used by:** tile interaction layer, modal rendering, and media derivative selection
- **Change risk:** medium — changing this affects both the close affordance and how camera/filter context is restored
- **Surfaced to users:** yes — it is the primary single-photo view

### Trusted-LAN-only
The deployment posture for the MVP: the app is intended to run on the operator's home network with no auth boundary and no internet exposure. Threat scope is limited to safe filesystem handling and operator-facing diagnostics, not hostile-network defense.

- **Lives in:** `docs/system/photo-library-source-and-runtime.md`
- **Why it exists:** scopes the runtime and threat model so MVP work is not pulled into multi-user, auth, or internet-facing concerns
- **Used by:** runtime contracts, docs, operator workflow, and security-relevant decisions
- **Change risk:** high — changing this would change which threats are in scope and could expand MVP scope substantially
- **Surfaced to users:** indirectly — surfaces in operator-facing setup docs rather than the user UI

### Seamless wall layout
The layout rule that photos should pack together tightly with no intentional gaps in the wall.

- **Lives in:** `docs/product/photo-wall-experience.md`
- **Why it exists:** defines the visual density and cohesion of the browsing surface
- **Used by:** layout logic, rendering validation, and future responsive behavior
- **Change risk:** high — changing this would materially alter the look of the product
- **Surfaced to users:** yes — visible in the core interface

### Structured mosaic
The preferred wall-composition character: a column-first mosaic with intentional rhythm, varied tile shapes, and staggered seams rather than ad-hoc gap filling or obvious striping.

- **Lives in:** `docs/glossary.md`, future Mosaic Lab studies, and wall-layout review notes
- **Why it exists:** gives reviewers a durable name for the target composition quality instead of describing it from scratch each time
- **Used by:** layout evaluation, future mockup work, and packer discussions
- **Change risk:** medium — drifting definition can confuse both design review and implementation tradeoffs
- **Surfaced to users:** indirectly — users feel it in the wall even if the label stays internal

### Black space
Exposed empty background space inside the intended mosaic where photo coverage should have continued.

- **Lives in:** `docs/glossary.md`, wall-layout review notes
- **Why it exists:** names the main visible failure mode the layout work is trying to avoid
- **Used by:** layout critique, future Mosaic Lab experiments, and packer acceptance checks
- **Change risk:** low — the term is diagnostic, but losing it makes review language vaguer
- **Surfaced to users:** yes — visible as an unwanted hole in the wall

### Standard tile
The default tile shape or size band the mosaic tries first before rescue adjustments are needed.

- **Lives in:** future wall-layout implementation notes and Mosaic Lab mockups
- **Why it exists:** distinguishes normal packing choices from explicit corrective interventions
- **Used by:** layout vocabulary, synthetic studies, and future packer tuning
- **Change risk:** medium — changing what counts as standard shifts comparison against rescue behavior
- **Surfaced to users:** indirectly — users see the result, not the label

### Rescue shape
An intentionally non-default tile shape introduced to solve a local packing problem without opening black space.

- **Lives in:** future wall-layout implementation notes and Mosaic Lab mockups
- **Why it exists:** separates corrective shape choices from the normal tile rhythm
- **Used by:** packer discussions, layout debugging, and synthetic studies
- **Change risk:** medium — vague use can turn targeted rescue logic into arbitrary shape churn
- **Surfaced to users:** indirectly — visible through the wall pattern rather than the term itself

### Scale rescue
A local size adjustment used to absorb layout mismatch and preserve mosaic continuity when shape changes alone are not enough.

- **Lives in:** future wall-layout implementation notes and Mosaic Lab mockups
- **Why it exists:** names a corrective move that changes scale without implying a whole new shape family
- **Used by:** layout debugging and packer tradeoff discussions
- **Change risk:** medium — careless use can blur the boundary between controlled rescue and global sizing drift
- **Surfaced to users:** indirectly — users notice the continuity, not the term

### Neutral connector
A low-attention bridging tile that helps neighboring shapes meet cleanly without becoming the focal shape in that local cluster.

- **Lives in:** future wall-layout implementation notes and Mosaic Lab mockups
- **Why it exists:** gives a name to the quiet supporting role some tiles play in keeping the mosaic coherent
- **Used by:** layout critique, mockup review, and future packer heuristics
- **Change risk:** low to medium — losing the term makes it harder to discuss subtle support roles in the layout
- **Surfaced to users:** indirectly — it influences the feel of the wall more than explicit perception

### Seam-break rescue
A targeted corrective move that interrupts an overly long seam line before the wall starts reading as striped or mechanically repetitive.

- **Lives in:** future wall-layout implementation notes and Mosaic Lab mockups
- **Why it exists:** names a specific intervention for one of the main structured-mosaic failure modes
- **Used by:** packer heuristics, layout review, and synthetic studies
- **Change risk:** medium — misuse can either over-fragment the wall or leave obvious seam problems untreated
- **Surfaced to users:** indirectly — visible through the wall rhythm rather than the term itself

### Clean gutters
Tile joins that stay visually tight and consistent, without accidental spacing noise, ragged offsets, or void-like slivers.

- **Lives in:** `docs/glossary.md`, wall-layout review notes
- **Why it exists:** gives review language for seam quality without implying large literal gutters in the wall
- **Used by:** layout evaluation, mockup critique, and future acceptance checks
- **Change risk:** low — mostly a communication term, but useful for consistent reviews
- **Surfaced to users:** yes — visible in the wall finish quality

### Long seam line
An uninterrupted tile edge alignment that runs long enough to make the wall feel striped, mechanical, or overly grid-like.

- **Lives in:** `docs/glossary.md`, wall-layout review notes
- **Why it exists:** names a recurring composition failure mode that should trigger rescue behavior
- **Used by:** layout critique, future packer heuristics, and Mosaic Lab experiments
- **Change risk:** low to medium — unclear use weakens evaluation of mosaic rhythm
- **Surfaced to users:** indirectly — users perceive the stripe effect even if they do not name it

### Wrap-around wall
A finite photo wall that loops seamlessly at its left/right and top/bottom edges within the currently loaded world, without becoming a procedurally infinite surface.

- **Lives in:** `docs/product/photo-wall-experience.md`
- **Why it exists:** distinguishes the approved looping-browse behavior from both hard edge clamping and a truly infinite world
- **Used by:** camera math, seam-aware rendering, dynamic loading, and regression validation
- **Change risk:** high — changing this would alter the core browsing model and loading expectations
- **Alias:** looping wall
- **Surfaced to users:** yes — directly experienced during wall navigation

### Filter menu
The secondary control surface opened from the small circular menu button. It exposes filtering controls without turning the page into a chrome-heavy application shell.

- **Lives in:** `docs/product/photo-wall-experience.md`
- **Why it exists:** preserves the minimal default UI while still allowing photo set controls
- **Used by:** filtering behavior and future control-surface design
- **Change risk:** medium — changing this impacts the balance between minimalism and control
- **Surfaced to users:** yes — it is the main visible control entry point

### Mosaic Lab
A lab-mode mock photo wall sandbox, reachable from the normal build, for creating or selecting synthetic sample albums, generating photo-like inputs, rerunning the production wall path, and identifying where the mosaic algorithm fails.

- **Lives in:** `src/client/src/App.tsx`, `src/client/src/features/mosaic-lab/`, `docs/product/photo-wall-experience.md`
- **Why it exists:** creates a deliberate entry/exit seam for synthetic wall studies while keeping the real photo wall as the default experience
- **Used by:** app-surface selection, shared wall-renderer reuse, browser validation, and future synthetic layout experiments
- **Change risk:** medium — changing the seam affects both the product metaphor and how maintainers validate renderer behavior
- **Alias:** wall sandbox
- **Surfaced to users:** yes — reachable from the client UI
- **Notes:** the lab should stay wall-first, clearly synthetic, and production-path-aligned; recipes, seeds, metrics, and diagnostics support the sandbox but are not the primary metaphor

### Sample album
A named synthetic album preset or editable lab album configuration used to exercise the mock photo wall with realistic or pathological photo mixes.

- **Lives in:** `docs/product/photo-wall-experience.md`, `src/client/src/features/mosaic-lab/model/sampleAlbums.ts`
- **Why it exists:** gives Mosaic Lab a durable user-facing unit for single-album and grouped-album scenarios without pretending the inputs come from the real library
- **Used by:** lab controls, synthetic photo generation, grouped-layout checks, and diagnostics
- **Change risk:** medium — changing the term carelessly can blur the difference between real albums and lab-only inputs
- **Alias:** synthetic sample album
- **Surfaced to users:** yes — selectable and editable in Mosaic Lab
- **Notes:** selecting one sample album should exercise single-wall behavior, while selecting multiple sample albums should exercise grouped album-area behavior

### Structured mosaic
A rectilinear exact-fill layout that still shows local variation and seam-breaking rather than collapsing into a repeated grid.

- **Lives in:** `docs/product/photo-wall-experience.md`, `docs/glossary.md`, `src/client/src/features/mosaic-lab/`
- **Why it exists:** gives reviewers and maintainers a shared success/failure standard for Mosaic Lab output quality
- **Used by:** Mosaic Lab recipe evaluation, packer acceptance criteria, and browser-proof review
- **Change risk:** medium — changing the term shifts what counts as acceptable synthetic layout structure
- **Surfaced to users:** indirectly — the user sees the result even if the term stays mostly internal
- **Notes:** in Mosaic Lab, obvious single-footprint grid collapse for uniform-input recipes is the opposite of a structured mosaic

### Album area
The loose wall region that belongs to exactly one album when the active view resolves to multiple albums.

- **Lives in:** `docs/product/photo-wall-experience.md`
- **Why it exists:** gives grouped browsing a stable unit of orientation without turning the wall into hard-boxed sections
- **Used by:** grouped wall layout, per-album shuffle, signpost targeting, and grouped-browser validation
- **Change risk:** high — changing it alters how multi-album browsing is spatially understood
- **Surfaced to users:** yes — users experience the regions directly even if the term stays mostly internal
- **Notes:** album areas should feel organic/scattered rather than grid-arranged, and a year-wide grouped view still resolves to one album area per child album

### Signpost label
The contextual directional label that appears only on navigational intent in grouped mode and points toward an album area.

- **Lives in:** `docs/product/photo-wall-experience.md`
- **Why it exists:** preserves the minimal default wall while still helping users relocate offscreen album areas when grouped browsing is active
- **Used by:** grouped wall interaction logic, edge-intent reveal behavior, and snap-fast glide navigation
- **Change risk:** medium to high — changing it affects navigation discoverability, chrome density, and grouped-view feel
- **Surfaced to users:** yes — directly visible during grouped navigation
- **Notes:** signpost labels stay hidden by default, remain suppressed while the focused-photo modal is open, use the motion itself as the destination cue after click/tap glide, and omit the album that already dominates most of the current viewport so the user is not told to navigate toward what they are clearly already viewing

### Workshop idea
A durable idea packet stored in `docs/workshop-ideas/` for a concept, problem statement, or discussion outcome that is worth preserving even though it is not approved product behavior or active execution work yet.

### Ephemeral work artifacts
Temporary documents that capture active work state, such as plans, task notes, migration slices, and disposable scratch notes. In this template they belong in `work/` and `scratch/`.

### Human explicit decision
A direction, policy, or decision explicitly approved by a human. These decisions are binding until superseded by a newer human-approved decision.

### Human ratification
The human approval step that turns a proposal into a binding repo decision. File placement alone does not count as ratification.

### Inferred memory
Convenience context derived from chat history, tools, or agent memory. It is useful for speed, but it is never the authority for correctness, architecture, onboarding, safety, or operations.

### Promotion rule
The rule that temporary or inferred knowledge must be promoted into a canonical document and explicitly approved by a human before the team relies on it long term.

### Runbook
A repeatable operational procedure stored in `docs/runbooks/`. A runbook should be usable by someone who was not part of the original discussion.

### Scoped operational docs
Explicit instructions that apply only to a specific subtree or workflow rather than the whole repository. A nested `AGENTS.md` is the main example in this template.

### Standards docs
Documentation in `docs/standards/` for repository-wide policy, conventions, testing rules, and structural guidance.

### Warp Pipe
The repository’s intake workflow/folder (`warp-pipe/`) for newly imported assets that need AI-assisted routing into their correct long-term location.

## Technical / implementation terms

### UI architecture terms

#### Component boundary
The functional edge around a component’s responsibilities: what state it owns, what it renders, what it delegates, and what inputs and outputs define its contract.

#### Presentation component
A component primarily responsible for rendering UI from inputs, with minimal business logic.

#### Container component
A component that coordinates data loading, state wiring, side effects, or orchestration for child presentation components.

#### Slot
A named insertion point where callers can provide custom UI or content.

#### Variant
A controlled visual or behavioral mode for a component, usually expressed through props, tokens, modifiers, or style classes.

#### Composition layer
The part of the UI tree that assembles reusable pieces into a larger screen, route, or section.

#### View model
A UI-oriented data shape prepared for rendering, often derived from domain objects so components stay simple.

### State and data-flow terms

#### Source of truth
The authoritative location for a piece of state at a given layer.

#### Derived state
State computed from other state rather than authored directly.

#### Local state
State owned by one component, module, or narrow feature scope.

#### Shared state
State accessed by multiple components, modules, or subsystems.

#### State transition
A defined change from one meaningful state to another, often triggered by user action, async completion, or system events.

#### Event bridge
A small layer that translates one event system, emitter, callback style, or message shape into another.

#### Synchronization point
A place where multiple state updates, async operations, or subsystems must agree before proceeding.

#### Hydration boundary
The seam where serialized, server-generated, cached, or persisted data becomes live runtime state.

### Domain-to-implementation mapping terms

#### Synthetic photo record
A `PhotoQueryRecord`-compatible lab record generated from sample-album settings instead of backend library media.

- **Lives in:** `src/client/src/features/mosaic-lab/model/syntheticPhotos.ts`, `src/shared/api/photos.ts`
- **Why it exists:** lets Mosaic Lab feed synthetic inputs through the shared production wall path without pretending the records came from the real photo library
- **Used by:** shared wall rendering, synthetic media-source resolution, hover/modal safeguards, and diagnostics
- **Change risk:** medium to high — changing this contract can break renderer reuse or leak lab-only IDs into production media paths
- **Alias:** lab photo record
- **Surfaced to users:** indirectly — users see the rendered synthetic wall, not the record shape
- **Notes:** synthetic IDs stay lab-only and should not leak into production `/api/media/:photoId` requests; v1 placeholders can use SVG or data URLs instead of backend media

#### Source archetype
A synthetic-input descriptor for what kind of mock source image a Mosaic Lab recipe contains, such as standard landscape, panorama, square, or tall nonstandard.

#### Placement footprint
The layout shape the Mosaic Lab packer may place into the exact-fill mosaic. A placement footprint is intentionally distinct from a source archetype.

#### Domain model
A representation of business entities and rules as the system understands them.

#### Transport model
The request/response or wire-format representation used across APIs, storage, or messaging boundaries.

#### Persistence model
The shape used to store data in a database, file, cache, or durable medium.

#### Mapping layer
The code that translates between domain, transport, persistence, or UI-specific representations.

#### Normalization
The process of reshaping data into a canonical internal form.

#### Denormalized view
A convenience shape optimized for reads, rendering, or reporting rather than strict normalization.

### Integration terms

#### Adapter
A wrapper that reshapes an external dependency into an internal contract the codebase prefers.

#### Gateway
A boundary object or module that centralizes access to an external system.

#### Provider
A dependency source that supplies configuration, services, contexts, or external capabilities to consumers.

#### Client
A module responsible for making requests to another service or runtime boundary.

#### Facade
A simplified interface that hides a more complex subsystem behind a smaller API.

#### Shim
A thin compatibility layer added to smooth over version, environment, or API differences.

#### Fallback path
An alternate execution route used when the primary dependency, data source, or feature path is unavailable.

### Async and job-processing terms

#### Pipeline
A staged sequence of transformations or operations where the output of one stage feeds the next.

#### Stage
A named step within a pipeline or workflow.

#### Queue
A buffer of work awaiting execution.

#### Worker
A unit that pulls queued or assigned work and executes it.

#### Retry policy
The rule set that determines when and how failed work is attempted again.

#### Idempotent operation
An operation that can run multiple times without changing the final result beyond the first successful application.

#### Dead-letter path
The holding area or failure route for work that cannot be processed successfully after normal attempts.

### Rendering and styling terms

#### Design token
A named design value such as color, spacing, radius, duration, or typography scale intended for reuse.

#### Semantic token
A design token named by purpose rather than raw value, such as `surface-muted` instead of `gray-100`.

#### Layout primitive
A low-level reusable building block for spacing, stacking, alignment, grid, or containment.

#### Interaction state
A visual or behavioral state driven by focus, hover, pressed, selected, disabled, loading, or validation conditions.

#### Motion contract
The agreed timing, easing, trigger, and visibility rules for UI movement and transitions.

#### Rendering path
The path by which a screen or component reaches its final rendered form, including data preparation and conditional branches.

#### Derivative tier
A named media-detail band used by the wall renderer to trade image fidelity against overview speed as zoom changes.

- **Lives in:** `src/shared/api/media.ts`, `src/server/routes/media.ts`, `src/client/src/features/wall/pixiScene.ts`
- **Why it exists:** gives the wall a pragmatic far/mid/near image strategy without requiring a full deep-zoom tile pyramid
- **Used by:** media route selection, Pixi scene sprite building, and zoom validation
- **Change risk:** high — changing tier meaning affects cache behavior, visual sharpness, and renderer proof
- **Alias:** media variant tier
- **Surfaced to users:** indirectly — users feel the detail shift as they zoom even if the labels stay internal

#### Wall layout mode
The wall's browsing mode: `single` when the current view resolves to one album area, `grouped` when it resolves to multiple album areas.

- **Lives in:** `docs/product/photo-wall-experience.md`, `src/client/src/features/wall/WallShell.tsx`, `src/client/src/features/wall/activeAlbumAreaCount.ts`, `playwright/wall-layout-modes.spec.ts`
- **Why it exists:** names the approved distinction between single-album and grouped multi-album browsing without reviving the old renderer-selection mental model
- **Used by:** wall-shell orchestration, grouped-wall behavior, and browser regression coverage
- **Change risk:** high — changing its meaning can collapse grouped behavior, signpost rules, and album-area handling back into the wrong model
- **Alias:** single-stream mode, grouped mode
- **Surfaced to users:** indirectly — users experience the mode shift even though the label stays internal
- **Notes:** both modes run through the same Pixi-first wall path; do not represent this distinction as a renderer toggle or fallback seam

#### Hit-target layer
The transparent DOM interaction layer that stays aligned with the Pixi wall so hover, click, drag-threshold, and focused-view semantics remain stable while Pixi owns the visible wall rendering.

- **Lives in:** `src/client/src/features/wall/WallCanvas.tsx`, `src/client/src/styles/global.css`
- **Why it exists:** preserves proven interaction behavior and stable browser-test hooks without turning DOM tiles back into the visible renderer
- **Used by:** anchored hover preview, click-to-open focused view behavior, and drag-vs-click interaction proof
- **Change risk:** medium to high — changing it carelessly can break interaction parity even when the Pixi scene still looks correct
- **Alias:** DOM hit-target bridge
- **Surfaced to users:** no — it is an implementation detail behind the wall
- **Notes:** this layer stays minimal and image-free; the visible pixels belong to Pixi, while the bridge preserves stable hover/click semantics and browser-test hooks

### Code organization terms

#### Module boundary
The responsibility line around a file or module, including what it may import, expose, and coordinate.

#### Public surface
The intentionally supported exports, props, functions, routes, or commands that callers should depend on.

#### Internal API
A callable interface used inside the repo but not intended as a stable public contract.

#### Leaf module
A module with no meaningful internal dependents below it in a subsystem.

#### Orchestrator
A module that coordinates multiple lower-level helpers or services without owning all of their core logic.

#### Utility
A narrow helper with limited state and broad reuse potential.

#### Helper
A supporting function or module that serves a specific local need, usually with less durability than a utility.

### Reliability and debugging terms

#### Invariant
A condition that must remain true for the system to be correct.

#### Guardrail
A code or process constraint that prevents misuse or unsafe change.

#### Recovery path
The route the system uses to restore a safe or usable state after an error.

#### Failure mode
A specific way a component, process, or dependency can break.

#### Probe
A targeted diagnostic check used to observe runtime behavior.

#### Instrumentation point
A code location where logs, metrics, traces, or debug signals are emitted.

#### Media diagnostics
The bounded, in-memory evidence used to locate a photo-loading failure across library readiness, server media preparation, derivative pressure, browser image readiness, Pixi texture creation, and sprite application.

- **Lives in:** `src/server/media/media-diagnostics.ts`, `src/server/routes/media-diagnostics.ts`, `src/client/src/features/wall/mediaLoadDiagnostics.ts`
- **Why it exists:** distinguishes where pictures stop progressing without retaining sensitive or high-cardinality identifiers
- **Used by:** `/api/diagnostics/media`, `photoWallMediaDiagnostics.snapshot()`, and the Docker/LAN troubleshooting runbook
- **Change risk:** medium — misleading stages or unbounded dimensions can produce false diagnoses or leak library details
- **Surfaced to users:** indirectly — exposed as trusted-LAN operator and DevTools probes
- **Notes:** counters reset on server restart or browser refresh and never include photo IDs, filesystem paths, or media URLs

#### Backpressure
A condition where downstream capacity limits require the system to slow, buffer, reject, or reshape incoming work.

### AI-built structure terms

#### AI-built abstraction
A component, helper, pattern, or conceptual layer introduced by an AI agent during implementation.

#### Hidden contract
An unstated dependency or assumption that exists in code but is not obvious from names or public APIs.

#### Ghost feature
A capability partially implemented in code but not formally documented, named, or intentionally exposed.

#### Shadow workflow
An operational or code path that exists in practice but is not yet recognized as an official supported workflow.

#### Naming debt
The gap between what a thing is called in code and what it actually does.

#### Intent drift
The condition where a structure’s current behavior no longer matches the reason it was originally introduced.

#### Compression artifact
A misleading simplification introduced by AI or humans when collapsing a complex design into a smaller implementation explanation.

### Documentation hygiene terms

#### Canonical name
The preferred stable term the repo should use for a concept.

#### Alias term
An older, local, transitional, or informal name that points to the canonical name.

#### Deprecated term
A term that should no longer be introduced in new code or docs, even if legacy references remain.

#### Surfaced term
A term intentionally exposed to users, operators, or API consumers.

#### Internal term
A term intended only for maintainers, implementers, and agent handoff.

## Maintenance rule

When the codebase gains non-obvious internal structure, update this glossary before relying on memory or chat context to explain it later.

This is especially important when:

- an AI introduced a new abstraction
- a refactor created a new layer or responsibility boundary
- a hidden workflow became important to operations
- a new internal name started appearing in commits, plans, or reviews

## Entry requirements for future repo-specific terms

For repo-specific additions, use the structured format below when the concise definition is not enough.
These fields are required unless a field truly does not apply:

- **Lives in**
- **Why it exists**
- **Used by**
- **Change risk**

Add these when useful:

- **Depends on**
- **Alias**
- **Surfaced to users**
- **Notes**

```md
### Term name
Short definition.

- **Lives in:** `path/or/subsystem`
- **Why it exists:** brief rationale
- **Used by:** downstream consumers
- **Change risk:** what can break if altered carelessly
- **Depends on:** upstream inputs or collaborators
- **Alias:** older or local names, if any
- **Surfaced to users:** yes/no, and where if yes
- **Notes:** debugging clues, invariants, or migration cautions
```

## Related docs

- `README.md`
- `product/README.md`
- `workshop-ideas/README.md`
- `system/README.md`
- `standards/documentation-model.md`
- `standards/documentation-schema.md`

## Changelog

### 2026-07-29
- Added `Media diagnostics` as the shared name for the bounded server/browser photo-loading evidence.

### 2026-06-26
- Reframed `Mosaic Lab` as a wall-first mock photo wall sandbox aligned to the production wall path.
- Added `Sample album` and `Synthetic photo record` to capture the approved lab-input vocabulary.

### 2026-06-20
- Updated `Mosaic Lab` to reflect the approved Pixi/camera recipe-bench behavior.
- Added `Structured mosaic`, `Source archetype`, and `Placement footprint` so the new synthetic-layout contracts use shared language.

### 2026-06-14
- Added the shared Mosaic Lab and structured-mosaic vocabulary for future synthetic layout experiments and review language.

### 2026-06-10
- Added `Wall layout mode` so future maintainers can find the single-stream versus grouped distinction without reviving renderer-selection terminology.
- Updated `Hit-target layer` to describe the post-migration Pixi-owned wall path while preserving the DOM interaction bridge's ongoing role.

### 2026-06-08
- Added `Derivative tier` for the zoom-aware Pixi media-detail bands.
- Added `Hit-target layer` for the transitional DOM interaction bridge over the Pixi wall.

### 2026-06-07
- Updated `Signpost label` to record the dominant-album suppression rule for grouped browsing.

### 2026-06-06
- Added `Album area` for the new grouped multi-album browsing regions.
- Added `Signpost label` for the contextual grouped-navigation labels and their intent-revealed behavior.

### 2026-06-04
- Added `Anchored hover preview` to capture the approved hover-only enlargement behavior and keep it distinct from the focused-photo modal.

### 2026-06-03
- Added `Wrap-around wall` to capture the approved finite looping-navigation model and keep it distinct from a truly infinite world.

### 2026-06-02
- Replaced `Diagonal drift` with `Two-axis trackpad panning` and added `Click-drag panning` to match the approved MVP motion model.
- Added `Focused-photo modal` and `Trusted-LAN-only` to capture the modal close behavior and the explicit MVP deployment posture.
- Updated the `Playlist` entry to describe server-persisted saved-filter presets and the graceful degradation requirement when referenced folders are missing.
- Updated the `Photo wall` notes to describe true 2D panning rather than diagonal-motion scrolling.

### 2026-06-01
- Added the repo-specific terms `Library root`, `Year folder`, and `Event folder`.
- Added the repo-specific terms `Photo wall`, `Photos directory`, `Playlist`, `Diagonal drift`, `Seamless wall layout`, and `Filter menu`.

### 2026-05-27
- Added `Workshop idea` for durable parked ideas stored under `docs/workshop-ideas/`.

### 2026-05-25
- Added `Bootstrap-empty target` for scaffold destinations that only contain local bootstrap state such as `.git/` and `.pi/`.

### 2026-05-20
- Merged glossary maintenance guidance into the shared glossary.
- Merged the separate behavioral and technical glossaries into one shared `docs/glossary.md`.
- Split the glossary into explicit behavioral and technical sections.

### 2026-05-17
- Added authority-model terms for `Human explicit decision`, `Human ratification`, `AI explicit proposal`, and `AI implicit decision`.
- Clarified that canonical docs can contain clearly marked proposals, but only human-approved decisions are binding.

### 2026-05-12
- Added `Warp Pipe` as the canonical term for the repo's AI-assisted asset intake workflow.

### 2026-05-04
- Added the initial glossary covering the template repo’s core documentation and workflow terms.
- Added the initial technical glossary for internal implementation terms, AI-built abstractions, and hidden repo mechanics.
