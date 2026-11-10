# Glossary

Photo-wall terms that should mean the same thing in docs, code and conversation. Behavior lives in `product/photo-wall-experience.md`; this file only defines words.

### Mobile fling
Velocity-responsive continuation after a single-finger wall drag (also called touch momentum). Slow releases stop promptly; fast flicks coast farther. The shared `dragMomentum.ts` / `usePanMomentum.ts` implementation decelerates in screen space so zoom does not change the feel. Distinct from the deliberately subtle desktop wheel tail. Governing behavior: `product/photo-wall-experience.md`.

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
- **Used by:** folder discovery and folder filters
- **Change risk:** medium — it shapes defaults, but should not become an inflexible hard requirement
- **Surfaced to users:** indirectly — it may appear in folder-based browsing and filtering

### Curator
Whoever has entered the curator PIN in a browser. The curator sees every album, puts albums on display or in storage, sets the default view and hides or restores photos. Everyone else is a viewer.

- **Lives in:** `docs/product/photo-wall-experience.md`; code in `src/server/curation/`
- **Why it exists:** lets Michael decide what the household sees without accounts
- **Change risk:** high — it decides what viewers can see and whether files move
- **Surfaced to users:** yes — the Curator section of the menu
- **Notes:** curation is on once a PIN exists, chosen on `/curate` with the server's one-time setup code (or set as `PHOTO_WALL_CURATOR_PIN`)

### In storage / on display
The two states of an album under curation. Viewers see and pick only albums on display; albums in storage are visible only to the curator. Albums new to the library start in storage.

- **Lives in:** `docs/product/photo-wall-experience.md`; stored as the `onDisplay` list in `albums.json` in the curation folder
- **Change risk:** high — it decides what viewers can see
- **Surfaced to users:** yes — to the curator, as the eye control on each album

### Default view
The albums, picked by hand by the curator, that a wall shows before anyone picks albums. Picking albums replaces it.

- **Lives in:** `docs/product/photo-wall-experience.md`; stored as `defaultView` in `albums.json`
- **Surfaced to users:** yes — to the curator, as the star on each album

### Hidden folder
A `_hidden` folder inside an album, holding photos the curator hid (Hide in the photo view). Hiding moves the photo file (and the files that belong with it) there; nothing is deleted. Only the curator sees it, shown as "Hidden", and selecting its album never includes it.

- **Lives in:** `docs/product/photo-wall-experience.md`; code in `src/server/curation/mover.ts`, `src/shared/api/curation.ts`
- **Change risk:** high — it moves files in the photo library
- **Surfaced to users:** yes — to the curator
- **Notes:** a `_hidden` folder made by hand counts too; every move the app makes is logged in `moves.log` in the curation folder

### Light edit
The curator's non-destructive edit of one photo: crop, straighten, quarter turns, flips, temperature, exposure and the other light and color adjustments, blur, grain and a look. It is stored as a recipe in the curation folder (`edits.json`, logged in `edits.log`), never written into the photo file, and the server renders it into the photo's derivatives so everyone sees the edited photo.

- **Lives in:** `docs/product/photo-wall-experience.md`; code in `src/shared/api/edits.ts`, `src/server/curation/edits.ts`, `src/server/media/edit-render.ts`, `src/client/src/features/editor/`
- **Change risk:** medium — it changes how photos look and their shape on the wall, but never the files
- **Surfaced to users:** yes — the curator's Edit button; viewers see the result
- **Notes:** the editor previews with Pixi's ColorMatrixFilter using the same color matrix the server applies, so colors match exactly; blur and grain are close, not pixel-identical

### Favorites (Starred album, formerly Best of)
A virtual album of the photos the curator starred. It isn't a folder: stars are stored as a list of photo paths (`starred.json` in the curation folder). Viewers see a starred photo in it even when the photo's own album is in storage; hidden photos are left out.

- **Lives in:** `docs/product/photo-wall-experience.md`; code in `src/server/curation/catalog.ts`
- **Surfaced to users:** yes — "★ Favorites" at the top of the album picker; the ☆ Favorite button (★ Unfavorite once starred) in the photo view for the curator
- **Notes:** called "starred" in code and `starred.json`

### Private photo
A photo the curator marked private: guests never see it (authorized guests do), in its album or in Favorites, but it stays in place and the curator still sees it. Stored as a list of paths in `private.json` in the curation folder. Different from a hidden photo, which is a bad shot moved into `_hidden`.

- **Lives in:** `docs/product/photo-wall-experience.md`; code in `src/server/curation/catalog.ts`
- **Surfaced to users:** to the curator — "Make private" / "🔒 Private" in the photo view

### Authorized guest
A guest whose browser entered the VIP PIN on `/vip`. Sees what any guest sees plus the private photos in it, shown in place with no switch. Stays authorized until the curator changes or turns off the VIP PIN. Never gets curator tools.

- **Lives in:** `docs/product/photo-wall-experience.md`; code in `src/server/curation/catalog.ts` (role `vip`) and `service.ts`
- **Surfaced to users:** "VIP PIN" on `/vip` and in the Curator section; a VIP section with Sign out
- **Notes:** called "vip" in code, the cookie and `vip-pin`

### Share link
A short link, derived from its content, to a set of albums plus the photo in the middle of the screen. Opening it shows those albums (limited to what is on display) and glides to that photo. Replaced playlists.

- **Lives in:** `docs/product/photo-wall-experience.md`; stored under `shares/` in the curation folder
- **Surfaced to users:** yes — "Copy link to this view" in the menu

### Curation folder
Where curation state lives: `albums.json`, `moves.log`, `edits.json`, `edits.log`, `shares/`, `starred.json`, `private.json`, the hashed `curator-pin`, the one-time `setup-code` and the session secret. Defaults to `<data root>/curation`; `PHOTO_WALL_CURATION_ROOT` moves it. Unlike the snapshot and thumbnail cache it can't be rebuilt, so keep it when clearing the data root and back it up.

- **Lives in:** `docs/runbooks/photo-wall-docker-lan.md`
- **Change risk:** high — losing it puts every album back in storage

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

### Hover pop
On desktop fine-pointer devices, the hovered photo lifts slightly (about 8% larger) in place over its own tile and casts a drop shadow above its neighbors. It always stays centered on its photo, and if it is partly off-screen, after a brief hover the wall slides slowly until the photo's center is under the cursor (once per hover; fully visible photos stay put). It disappears during drag or while the modal is open.

- **Lives in:** `docs/product/photo-wall-experience.md`
- **Why it exists:** gives the flat wall depth on hover without covering neighbors the way a large preview does
- **Used by:** `WallHoverPop.tsx` (shared by both wall views), `computeHoverPopRect`/`computeHoverCursorPan` in `hoverPreview.ts`, `useHoverCursorPan.ts`, and browser regression coverage
- **Change risk:** low — changing it affects hover feel and layering, not layout
- **Alias:** hover preview; replaces the earlier anchored hover preview
- **Surfaced to users:** yes — directly experienced while browsing the wall

### Focused-photo modal
The simple, viewport-sized overlay opened when a user clicks a non-dragged photo. It has an explicit visible `X` close control, next/previous controls that step to an adjacent photo and center the wall on it, and returns the user to that wall context on close.

- **Lives in:** `docs/product/photo-wall-experience.md`
- **Why it exists:** preserves a minimal default UI while still letting users inspect a single photo at a larger size
- **Used by:** tile interaction layer, modal rendering, and media derivative selection
- **Change risk:** medium — changing this affects both the close affordance and how camera/filter context is restored
- **Surfaced to users:** yes — it is the primary single-photo view

### Trusted-LAN-only
The deployment posture for the MVP: the app is intended to run on the operator's home network with no internet exposure. Browsing needs no login; the only auth is the single curator PIN. Threat scope is limited to safe filesystem handling and operator-facing diagnostics, not hostile-network defense.

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
The preferred wall-composition character: a column-first mosaic with intentional rhythm, varied tile shapes, and few, short, staggered seams rather than ad-hoc gap filling, long straight seam lines or obvious striping.

- **Lives in:** `docs/glossary.md` and wall-layout review notes
- **Why it exists:** gives reviewers a durable name for the target composition quality instead of describing it from scratch each time
- **Used by:** layout evaluation, future mockup work, and packer discussions
- **Change risk:** medium — drifting definition can confuse both design review and implementation tradeoffs
- **Surfaced to users:** indirectly — users feel it in the wall even if the label stays internal

### Black space
Exposed empty background space inside the intended mosaic where photo coverage should have continued.

- **Lives in:** `docs/glossary.md`, wall-layout review notes
- **Why it exists:** names the main visible failure mode the layout work is trying to avoid
- **Used by:** layout critique, and packer acceptance checks
- **Change risk:** low — the term is diagnostic, but losing it makes review language vaguer
- **Surfaced to users:** yes — visible as an unwanted hole in the wall

### Standard tile
The default tile shape or size band the mosaic tries first before rescue adjustments are needed.

- **Lives in:** future wall-layout implementation notes
- **Why it exists:** distinguishes normal packing choices from explicit corrective interventions
- **Used by:** layout vocabulary, synthetic studies, and future packer tuning
- **Change risk:** medium — changing what counts as standard shifts comparison against rescue behavior
- **Surfaced to users:** indirectly — users see the result, not the label

### Rescue shape
An intentionally non-default tile shape introduced to solve a local packing problem without opening black space.

- **Lives in:** future wall-layout implementation notes
- **Why it exists:** separates corrective shape choices from the normal tile rhythm
- **Used by:** packer discussions, layout debugging, and synthetic studies
- **Change risk:** medium — vague use can turn targeted rescue logic into arbitrary shape churn
- **Surfaced to users:** indirectly — visible through the wall pattern rather than the term itself

### Scale rescue
A local size adjustment used to absorb layout mismatch and preserve mosaic continuity when shape changes alone are not enough.

- **Lives in:** future wall-layout implementation notes
- **Why it exists:** names a corrective move that changes scale without implying a whole new shape family
- **Used by:** layout debugging and packer tradeoff discussions
- **Change risk:** medium — careless use can blur the boundary between controlled rescue and global sizing drift
- **Surfaced to users:** indirectly — users notice the continuity, not the term

### Neutral connector
A low-attention bridging tile that helps neighboring shapes meet cleanly without becoming the focal shape in that local cluster.

- **Lives in:** future wall-layout implementation notes
- **Why it exists:** gives a name to the quiet supporting role some tiles play in keeping the mosaic coherent
- **Used by:** layout critique, mockup review, and future packer heuristics
- **Change risk:** low to medium — losing the term makes it harder to discuss subtle support roles in the layout
- **Surfaced to users:** indirectly — it influences the feel of the wall more than explicit perception

### Seam-break rescue
A targeted corrective move that interrupts an overly long seam line before the wall starts reading as striped or mechanically repetitive. The packer does this by sizing a photo so two neighbouring columns line up, then moving the boundary between them, so the seam ends in a T-junction.

- **Lives in:** `src/client/src/features/wall/packer.ts`
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
- **Used by:** layout critique, and future packer heuristics
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
The secondary control surface opened from the small circular menu button. It holds the album picker, the share link and the curator controls without turning the page into a chrome-heavy application shell.

- **Lives in:** `docs/product/photo-wall-experience.md`
- **Why it exists:** preserves the minimal default UI while still allowing photo set controls
- **Used by:** filtering behavior and future control-surface design
- **Change risk:** medium — changing this impacts the balance between minimalism and control
- **Surfaced to users:** yes — it is the main visible control entry point

### Album area
The recognizable wall region associated with one album in a grouped view. Under the approved full-coverage mosaic contract, neighboring regions touch and their irregular borders may intermix photos; individual photos retain their source album identity.

- **Lives in:** `docs/product/photo-wall-experience.md`
- **Why it exists:** gives grouped browsing a stable unit of orientation without turning the wall into hard-boxed sections
- **Used by:** grouped wall layout, per-album shuffle, signpost targeting, and grouped-browser validation
- **Change risk:** high — changing it alters how multi-album browsing is spatially understood
- **Surfaced to users:** yes — users experience the regions directly even if the term stays mostly internal
- **Notes:** album areas adjoin without blank gutters or rigid boxes. Each has a stable center anchoring directional navigation, repeated with the same finite map; panning and zooming do not move that center within the canonical arrangement. A year-wide view still has one recognizable area per child album. This is approved behavior that isn't implemented yet.

### Signpost label
The contextual directional label that appears only on navigational intent in grouped mode and points toward an album area's stable center, using the appropriate repeated map instance across wrap boundaries.

- **Lives in:** `docs/product/photo-wall-experience.md`
- **Why it exists:** preserves the minimal default wall while still helping users relocate offscreen album areas when grouped browsing is active
- **Used by:** grouped wall interaction logic, edge-intent reveal behavior, and snap-fast glide navigation
- **Change risk:** medium to high — changing it affects navigation discoverability, chrome density, and grouped-view feel
- **Surfaced to users:** yes — directly visible during grouped navigation
- **Notes:** signpost labels stay hidden by default, remain suppressed while the focused-photo modal is open, use the motion itself as the destination cue after click/tap glide, and omit the album that already dominates most of the current viewport so the user is not told to navigate toward what they are clearly already viewing

### Featured photo (hero tile)
The one photo per album (folder) the curator makes its centerpiece; the wall draws it as a hero tile, uncropped in a picture frame and filling 90% of the screen at the default zoom, at the center of the album's part of the wall.

- **Lives in:** `docs/product/photo-wall-experience.md`
- **Why it exists:** lets the curator lead each album with its best photo instead of a uniform mosaic
- **Used by:** curation storage (`featured.json`, `featured-frames.json`), the radial wall layout, frame drawing (`featuredFrames.ts`), and texture tier selection
- **Change risk:** medium — changes wall layout around album centers and curator controls
- **Surfaced to users:** yes — the large photo on the wall, and "Make featured" for the curator
- **Notes:** at most one per folder (featuring another asks before replacing it); never cropped; framed in a chosen frame or Random (new each page load); always screen-sharp, even on the zoomed-out overview; none for Favorites; a private one is not shown to guests
