# Photo Wall Experience

Last edited: 2026-10-19
Status: Approved
Decision owner: Michael
Drafted by: Pi
Approved by: Michael via mission /plan handoff on 2026-06-02, follow-up implementation approval for wrap-around navigation on 2026-06-03, anchored hover-preview approval plus midpoint sizing clarification on 2026-06-04, grouped multi-album area/signpost approval during the 2026-06-06 mission kickoff, normal-build Mosaic Lab entry-seam approval during the 2026-06-14 mission kickoff, the 2026-06-26 clarification that Mosaic Lab is a mock photo wall sandbox with sample albums, synthetic photo-like inputs, production-wall reuse, immediate rerender, and deferred saved failure cases, and direct user approval on 2026-07-31 for subtle wheel momentum, sharper configurable thumbnails, mobile drag-release momentum, and reliable tap-to-focus activation; native-style mobile fling approved on 2026-08-01 and further mobile drag/fling improvements explicitly authorized in the 2026-09-15 survey-context follow-up; full-coverage stable looping mosaic, adjoining irregular album regions, center-anchored navigation, and bounded overview approved in the 2026-09-19 elaborate-spec dialogue ("yep sounds good"); removal of Mosaic Lab approved on 2026-10-02 ("i never wanted mosaic lab"); screen-resolution detail for on-screen photos when zoomed in requested on 2026-10-16 ("zooming in loads the high res version of photos within the viewport. 'cause right now when i zoom in my pics just look blurry"); full-range zoom in one pinch and the hover pop with drop shadow requested on 2026-10-16 ("i want to zoom in and out basically fully on one “pinch” or “expand”", "let's make hover just pop out the image a little and cast a drop shadow above the other photos so things don't look so flat"); stronger mobile fling without settle vibration requested on 2026-10-17 ("still seeing it vibrate toward the end. also it decays too fast with little momentum"); pinch zoom centered on the pinch requested on 2026-10-17 ("pinch to zoom on mobile doesn't zoom centered on the pinch points. it's zooming about the top left corner of screen instead"); hover pop always centered on its photo requested on 2026-10-17 ("hover state should not push the full image into the viewport but always be centered on the image"), with the hover slide then revised the same day ("a hovered photo should slide slowly until the cursor is centered on it instead", "photos too big too fit still scroll toward center"), and limited to partly off-screen photos on 2026-10-18 ("it shouldn't move to the cursor if the whole image is already in the viewport"); the nested album picker with partial selection, and removing year chips and the root editor from the menu, requested on 2026-10-19 ("let's fix the album picker. the top level folders should show nested folders with each one being selectable. selecting a top level folder selects all within. deselecting a nested folder will show have a "partially selected" indicator on the parent folder (you can decide what that looks like)", "don't need filters or root picker listed there"); light photo editing for the curator requested on 2026-11-01 ("let's enable some lighit photo editing in admin mode"), shaped on a Pixi mockup with a crop frame that stays put while the photo moves under it ("the way i prefer to crop is a static resizable working area and then pinch and zooming / pan the image around that", "no why would it snap back to center i don't want that"), and approved for implementation the same day ("perf implement it all"); the temperature slider, first, followed by exposure, brightness and contrast, requested on 2026-11-04 ("the editor needs a temperature dial. that's more important than hue which I'll probably never use. put temp first. then exposure, brightness, and contrast"); pinch zoom in the focused-photo modal requested on 2026-11-04 ("let's add pinch to zoom on lightbox"); a sideways trackpad swipe stepping the focused photo requested the same day ("on desktop, a two-finger sideways trackpad swipe at fit steps photos [...] is what i want")
Change policy: Do not change without explicit human approval
Related files: `../../README.md`, `../glossary.md`, `../system/photo-library-source-and-runtime.md`

## Behavior summary

`photo-wall` is a minimal web app that turns one configured photo library on the home LAN into a large, immersive browsing wall. The page is dominated by the photos themselves. Filtering, playlist selection, and the focused-photo view exist, but they stay visually secondary to the wall.

The MVP is a trusted-LAN, Docker-run app with no auth boundary and no internet-facing exposure.

## Rules and invariants

- The photo source is a single configurable photo-library root chosen by the operator and mounted from the host into the Docker container.
- If the configured root is missing or wrong, the operator should be able to replace it from the app by entering the server-visible root path without editing hidden state by hand.
- When browser directory-picker support can reveal a compatible filesystem path, the app may use that picker to prefill the root field, but the picker must remain optional because browser-visible paths and server-visible paths are not always the same.
- The product should discover photos from that root and its subfolders recursively rather than requiring one folder to be configured per event.
- Photos should be shown large rather than as tiny thumbnail grids.
- The wall should prioritize a dense, gapless, column-first mosaic over fully uncropped wall tiles.
- Wall tiles may crop photos when needed to preserve mosaic continuity, but that crop should stay modest rather than flattening every image toward one generic shape. A photo's aspect ratio must never change: a tile shaped differently from its photo shows a centered crop of it, never a stretched or squashed image (Michael, 2026-10-19: "resizes and crops are ok but the aspect ratio should not change").
- The wall should fit photos together tightly with no intentional gaps between tiles. In both single-album and grouped views, photo content must cover the entire viewport at every supported pan position and zoom level, without layout-created black side bands, gutters, or wrap-corner gaps.
- The wall should read as a column-first mosaic with few, short seams. A straight vertical seam between photos must not run on down the wall: within a couple of photos it should end in a staggered T-junction, and horizontal breaks stay staggered rather than forming obvious full-width horizontal striping. Michael on 2026-10-19: "the mosaic algorithm is supposed to prioritize few seams", then "yes replace seam rule". This styling must not constrain content to a narrow vertical region at the expense of full viewport coverage.
- The wall should support dynamic zoom in and out with a fast broad overview and progressively better image detail as the user moves closer. The initial frame should favor lightweight thumbnail derivatives rather than wait on wall-detail images.
- Initial and overview thumbnails should use a 512px long-edge target so the wall remains sharp enough to enjoy while browsing; that target must live at one shared tuning point so it is easy to adjust later.
- Once zoomed in past the overview, every photo visible in the viewport should load a version at least as sharp as it is drawn on the device's screen, counting high-DPI pixels and limited only by the source photo's own resolution, so zoomed-in photos never look blurry. The wall itself must render at the display's pixel density. Off-screen photos stay on thumbnails, and visible photos nearest the center sharpen first.
- Large-album interaction must keep cold derivative work, texture loads, texture retention, layout packing, and camera publication bounded; source changes must produce versioned media URLs so immutable browser caches do not serve stale derivatives.
- On coarse-pointer/mobile devices, two-finger pinch must zoom the wall directly; visible zoom-in and zoom-out controls provide an additional touch fallback while preserving drag panning.
- Zoom should be sensitive enough that a single comfortable pinch or spread, on a trackpad or a touch screen, travels essentially the whole supported zoom range. A single mouse-wheel notch with ctrl/⌘ should still step gently rather than jump across the range.
- Zoom must pivot on where the user is zooming: a touch pinch keeps the photo point between the fingers under the fingers (and moving the fingers together pans with them), a trackpad pinch or ctrl/⌘-wheel pivots on the cursor, and the zoom buttons pivot on the screen center. Zoom never pivots on the screen corner.
- Single-finger mobile drag panning should use a velocity-responsive, native-style inertial fling after release: slow drags stop nearly immediately while fast flicks coast farther and decelerate smoothly. Pausing before release, starting new input, or requesting reduced motion must suppress or cancel that fling. A slow release must settle promptly rather than drift through a fixed-duration tail; zoom and display refresh rate must not materially change the screen-space fling response.
- A fling must move only forward along its release direction until it stops: no backward steps or vibration at any point, including as it settles. Hard flicks should carry the wall a few screens; medium flicks a fraction of a screen to about a screen.
- The wall should support true two-axis panning driven by trackpad wheel deltas, allowing simultaneous horizontal and vertical camera movement.
- Ordinary wheel and trackpad panning should carry a short, subtle inertial tail after input ends. New wheel, pointer, modal, or signpost-glide activity must cancel that tail, and reduced-motion preference must suppress it without removing direct two-axis panning.
- The wall must also support mouse click-drag panning as a fallback for users without a trackpad, with click activation suppressed after the drag threshold is crossed.
- The wall loads the photo details (not the images) for the whole selection up front and lays every photo out at once; the images themselves load as they come on screen.
- The wall sprawls outward from its center rather than growing down a strip: the first photos sit in the middle and later ones spread out roughly equally in every direction, so panning any way, horizontally included, keeps showing new photos instead of the same ones over and over. The shape need not be exact; the wall is a fully covered rectangle about as tall as it is wide. Photos of one album stay together in roughly the same part of the wall. The wall opens on its center. Michael on 2026-10-20: "we should just keep adding photos outwardly equidistant from the center (as close as possible like I said doesn't have to be exact). this will give the feeling that we're seeing new pictures whichever direction we scroll. the problem with the vertical columns is scrolling horizontally shows the same pics over and over. this is the big issue I'm trying to fix. keeping in mind groupings so that photos in the same group are roughly in the same part of the circle", with a rectangle that loops being fine ("yes rectangular but doesn't have to be") and the view starting at the center ("yep center").
- The wall should wrap seamlessly at its left/right and top/bottom edges instead of stopping at hard camera clamps: reaching an edge loops straight back to the opposite edge. The loop must not show a straight seam: the wall's edges are ragged and overlap the neighbouring copy's edges haphazardly, each overlapping photo randomly on top or underneath. A photo covered at the edge must still show most of itself, never a thin sliver that reads as a floating strip of its neighbour (Michael, 2026-10-20: "i think it's livable if it's the edge, but our algo should not be producing anything like that"). Only repeats get covered: the outermost ring of tiles shows repeats of photos from the same album (shown in full elsewhere), and every original photo sits inside that ring. Michael on 2026-10-20: "edges should be rough and then just overlap each other at the edges somewhat haphazardly to avoid seams at the loop we can just choose randomly which photo overlaps the other one", "i feel like we can rule out gaps just by overlapping even more. we can mitigate edge photos not being visible by having edge photos be dupes of existing photos as well". Repeat the same stable mosaic in both axes, including album regions and their centers; panning or zooming must not reshuffle an unchanged selection and loaded photo set.
- If the viewport exposes more area than the base mosaic occupies, render repeated copies of its photos to maintain full coverage, including while zoomed out.
- Zoom-out must stop at a finite, useful overview that balances finding photos against tiny tiles and excessive repetition. Literal 2×/4× zoom factors or copy counts are not requirements; the exact limit is delegated tuning, but effectively unlimited zoom-out exposing ten copies is not acceptable. Optimize this experience for friendly album inputs, typically 50+ photos per album, without introducing a minimum-size admission rule.
- On desktop fine-pointer devices, hovering a photo should pop it out a little (about 8% larger, in place over its own tile) and cast a drop shadow above the neighboring photos so the wall doesn't look flat, without destabilizing the surrounding wall layout. The pop is always centered on the photo itself, even when that leaves part of it off-screen. When the popped photo is partly outside the viewport, after a brief hover (so merely sweeping the mouse across the wall does not move it) the wall slides slowly until the photo's center is under the cursor; the pop moves with the photo. A photo already fully in the viewport does not slide. Photos too large to fit are never fully in view, so they slide too. Each photo slides once per hover, so moving within it afterwards does not drag the wall. Moving the mouse during the slide, scrolling, dragging or clicking stops it. The pop animates in for every photo hovered, and moving straight onto a neighbouring photo lets the previous one settle back into the wall as the next pops (Michael, 2026-10-18: "hover pop up should also be an animation"). Reduced-motion preference shows and hides the pop without animating. The pop is preview-only: clicking still opens the focused-photo modal.
- A photo may softly fade in the first time it becomes visible during the current session to suggest progressive loading, but the same photo should not repeatedly re-fade on every later revisit.
- Clicking or tapping a non-dragged photo must reliably open a simple focused-photo modal sized to the browser viewport, with an explicit visible `X` control to close. Clicking or tapping anywhere outside the photo also closes it; clicking or tapping the photo itself does not (Michael, 2026-10-20: "lightbox should let me tap anywhere outside the picture to close"). Layout-only row wrappers must never create dead tap regions over visible tiles.
- The focused-photo modal has next and previous controls (and the left/right arrow keys); on touch screens, swiping left steps to the next photo and swiping right to the previous one (Michael, 2026-10-20: "we should let mobile users swipe left and right when on lightbox"). The photo follows the finger while dragging; a swipe slides it off that side and the new photo slides in from the other, and a short drag springs back (Michael, 2026-10-20: "swiping should show an animation of swiping the photo away and the next one appearing"). On desktop, a two-finger sideways trackpad swipe steps the same way, with the same slide: fingers moving left bring in the next photo (Michael, 2026-11-04: "on desktop, a two-finger sideways trackpad swipe at fit steps photos [...] is what i want"). One swipe steps one photo, however long its momentum tail runs, and vertical scrolling never steps. Reduced-motion preference steps without the slide. Each step shows a photo adjacent to the current one on the wall and smoothly glides the wall underneath until that photo is centered (Michael, 2026-10-18: "we should smoothly animate to the centered photo"); reduced-motion preference jumps there instead, and wheel, drag or pinch input stops the glide. Stepping follows one path through every photo on the wall, so repeated presses never circle a small local group. As Michael put it on 2026-10-18: "if the user hits next or previous, it should show the next image (we can define next however we want here, but it should be an adjacent image and no local loops). when we do click next or previous, viewport should center over that image as well". Next moves right across the wall and previous moves left: the wall is cut into bands about two photos tall, and the path zigzags along each band (down one column's photos in the band, up the next column's, and so on) to the right edge, then drops to the next band and keeps going right from the left edge, which on the looping wall sits just past the right edge. Holding next reaches every photo once before any repeats. Michael on 2026-10-20: "let's make lightbox left and right now actually move left/right across the wall. maybe mini serpentine pattern that goes right up right down right up right down and when it gets to the edge it moves down a row and continues [...] holding right should not lead to repeats until the whole wall is covered".
- The focused photo pinch-zooms (Michael, 2026-11-04: "let's add pinch to zoom on lightbox"). A two-finger pinch zooms from fit up to 4× about the point between the fingers, and moving the fingers pans with them; a trackpad pinch or ctrl/⌘-wheel zooms about the cursor. While zoomed in, one finger, a mouse drag or a trackpad scroll pans the photo, never past its edges, and swiping does not step to another photo; pinching back out to fit restores swiping. A pan or pinch that ends beside the photo does not close the modal. Zooming in loads the sharper detail version of the photo. Every newly shown photo opens fitted.
- Closing the focused-photo modal must return the user to the same wall context they came from. If they stepped with next/previous, that is the wall centered on the last photo they viewed.
- The default interface should stay minimal: just the photo wall plus a small circular menu button.
- Activating the small circular menu button should open a larger menu with the album picker and playlist controls. The menu does not list year chips or the library-root editor; replacing a wrong root stays on the configuration-error screen.
- The album picker is a tree of the discovered folders under the configured library root. Top-level folders show their nested folders, which can be expanded, and every folder is selectable. Selecting a folder selects everything inside it; deselecting a nested folder leaves its parent partially selected, shown as a bar in the parent's checkbox instead of a tick. Selecting a partially selected folder selects everything inside it again. Partially selected folders open expanded. With nothing picked, the wall shows the whole library. As Michael put it on 2026-10-19: "let's fix the album picker. the top level folders should show nested folders with each one being selectable. selecting a top level folder selects all within. deselecting a nested folder will show have a "partially selected" indicator on the parent folder (you can decide what that looks like)", "don't need filters or root picker listed there".
- Year filtering stays supported by the query and saved playlists, but the menu no longer offers it.
- When the active view resolves to a single album, the wall should keep the simpler single-album browsing presentation.
- When the active view resolves to multiple albums, including a year-wide view that expands into multiple child albums, the wall should group photos into one loose area per album. A selected top-level folder works like a year-wide view: each of its child folders with selected photos becomes an album area (deeper folders fold into their child album), and its own loose photos form one more area.
- Album areas must adjoin without blank separators or isolated islands. Their borders should feel organic and irregular, may intermix neighboring albums' photos, and need not form perfectly bounded or rectangular blocks. Preserve recognizable album regions rather than mixing every album throughout one undifferentiated mosaic.
- Each album region has a stable center that anchors its directional signposts and navigation target, including across repeated map copies. Irregular borders must not make those destinations wander during panning or zooming.
- In grouped multi-album mode, the wall should keep fetching until each selected album area has actual photos to show rather than leaving later selected albums dark just because the first page skewed toward earlier matches.
- Photos inside one album area should be stably and thoroughly shuffled for the current view rather than shown in obvious source order.
- In grouped mode, directional signpost labels should stay hidden by default and only appear when the user shows navigational intent by actively panning/scrolling or moving the pointer into edge-trigger zones.
- If one album already occupies the majority of the current viewport, its signpost label should stay hidden; signposts are for destination albums the user is not already clearly viewing.
- Pointer movement in the middle of the viewport should not reveal signpost labels.
- Signpost labels must stay suppressed while the focused-photo modal is open.
- Clicking or tapping a signpost label should trigger a snap-fast glide toward that album area, with the motion itself acting as the cue rather than extra highlight chrome.
- The visible signpost set should stay bounded to a small, relevant subset so the wall remains visually minimal.
- The product must support playlists in the form of server-side saved filter presets that the user can save, recall, update, and delete from the interface.
- Stale playlist references to folders that no longer exist must degrade gracefully rather than crashing the app.

## Edge cases and examples

- With no filter or playlist active, the wall should show the default broad view of the configured photo library in a deterministic order derived from discovered library structure so browsing follows the expected year/event/path flow.
- A portrait photo should usually still read as portrait-ish in the wall, and a panorama should usually still read as wide-ish, but moderate crop is preferable to exposed voids or pathological strip artifacts.
- The user should be able to pan in any direction with a trackpad, a single-finger touch drag, or click-dragging with a mouse; wheel/trackpad input should continue briefly with restrained momentum, while touch-drag release should use a velocity-responsive native-style fling. Reversing direction should cancel continuation and remain smooth without changing the model from 2D panning to vertical scrolling.
- Every visibly exposed photo tile should remain tappable even where staggered layout-row bounds overlap; controls layered above the wall remain intentional exceptions.
- Zooming out should favor a fast readable overview over full-detail loading everywhere at once, and zooming in should refine image detail progressively rather than waiting for the whole wall to repopulate.
- Minor pointer jitter that stays below the drag threshold should still resolve as a click on the hovered photo rather than shifting the wall first.
- The hover pop should be suppressed while the user is actively dragging the wall, while the wall is scrolling or gliding (wheel/trackpad scroll and its momentum tail, or a fling), and while the focused-photo modal is open. It returns on the next mouse movement once the wall comes to rest (Michael, 2026-10-22: "disable hoverstate while swiping scrolling through the wall").
- Panning past the right edge should immediately continue from the left side of the currently loaded wall, and vice versa; the same wrap rule applies for top/bottom travel. With unchanged selection and loaded photos, traveling a full horizontal or vertical period returns to exactly the same arrangement.
- At the minimum supported zoom on desktop or mobile, additional zoom-out input must stop changing the scale while repeated photo content continues to cover the viewport. Visible repeated copies must still open the correct photo through the existing focused-photo flow.
- Applying a year or folder filter should narrow the displayed set coherently without leaving stale mixed-result tiles onscreen and without changing the minimal overall framing of the page.
- Active year/folder selection should persist across a browser reload so the wall reopens in the same filtered context.
- A grouped year-wide view should resolve into one album area per child album rather than one long sequential stream.
- In grouped mode, a multi-folder selection should give each selected folder its own album area rather than blending both folders into one undifferentiated run, and reloading the page should preserve that grouped selection.
- Signpost labels should not appear while the user is idle in the middle of the viewport, but should appear after scroll/pan intent or edge-intent pointer movement.
- When one album already fills most of the current view, the signpost system should omit that album and instead point only toward other destinations.
- Triggering a signpost should move the wall quickly toward that destination area without adding a second highlight effect after landing.
- The signpost system should remain suppressed while the focused-photo modal is open, even if wheel or pointer-edge activity occurs underneath.
- A likely initial library shape is top-level year folders containing event folders and then actual photos, but the browsing experience should still be based on discovered folders rather than a hardcoded list.
- Dynamic loading should extend the wall as the user approaches the loaded frontier instead of requiring the entire library to load before the experience becomes usable.
- A saved playlist that references a now-missing folder should still load the app and visibly indicate the degraded state rather than fail closed.

## Non-goals

- Month filtering in the MVP.
- The previously sketched diagonal-scroll motion model that re-randomized on scroll-direction reversal; the MVP uses true 2D panning rather than vertical scrolling with a drifting diagonal.
- Auth, accounts, sharing, or internet-facing deployment.
- Hardening for hostile networks; the MVP is trusted-LAN-only.
- A truly unbounded or infinitely generated 2D world, unlimited zoom-out, or reshuffling the arrangement as the user moves.
- Chrome-heavy gallery UI with persistent panels competing with the photos.
- Large always-visible navigation, metadata, or management surfaces.
- A sophisticated playlist authoring model beyond saved filter presets.
- Final visual specifics of the focused-photo modal beyond its viewport-sized framing, explicit `X` close control and next/previous controls.

## Related docs

- `../../README.md`
- `../glossary.md`
- `../system/photo-library-source-and-runtime.md`

## Changelog

### 2026-11-04 (lightbox pinch zoom)

- The focused photo pinch-zooms up to 4× about the fingers (or the cursor, on a trackpad), pans while zoomed in, and loads the sharper detail version; swiping to the next photo resumes once it is back at fit (requested by Michael, 2026-11-04).
- On desktop, a two-finger sideways trackpad swipe steps the focused photo to the next or previous one, one photo per swipe; while zoomed in it pans instead (requested by Michael, 2026-11-04).

### 2026-11-04

- The photo editor gained temperature and exposure. The sliders now run temperature, exposure, brightness, contrast, then saturation and hue; the old brightness (which scaled the light) became exposure, and brightness now lifts every tone evenly (requested by Michael, 2026-11-04).

### 2026-11-01 (light editing)

- Added light photo editing for the curator: crop with a frame that stays put while the photo pans and zooms under it, straighten, quarter turns, flips, brightness, contrast, saturation, hue, blur, grain and one-click looks. Edits are stored as recipes and rendered by the server, so the original file is never changed; undo and Revert to original bring the original back (requested by Michael and approved for implementation on 2026-11-01: "perf implement it all").

### 2026-10-22 (hover while scrolling)

- The hover pop no longer appears while the wall is scrolling or gliding; photos sliding under a still or moving cursor stay flat until the wall settles (requested by Michael, 2026-10-22).

### 2026-10-20

- Swiping left/right in the focused-photo modal on a touch screen steps to the next/previous photo, sliding the photo away and the new one in (requested by Michael, 2026-10-20).
- Loop-edge overlaps now cover at most about a third of the photo underneath, so the edge no longer leaves thin slivers of a photo showing (requested by Michael, 2026-10-20).
- Clicking or tapping anywhere outside the photo in the focused-photo modal now closes it; previously only the `X` (or Escape) did (requested by Michael, 2026-10-20).
- Next/previous in the focused-photo modal now travel right/left across the wall in a two-photo-tall zigzag band, dropping a band at each loop of the wall, instead of snaking up and down columns (requested by Michael, 2026-10-20).
- The wall's loop edges are now ragged: an outer ring of repeated photos reaches 15–45% of a tile past each edge and overlaps the neighbouring copy, randomly over or under, so no straight seam shows at the loop; original photos all sit inside the ring (requested by Michael, 2026-10-20). `npm run layout:viz` draws the layout into `artifacts/layout/`.
- The wall now sprawls out from its center: it is sized to the selection (about square) instead of a fixed-width strip that grew downward, earlier photos sit nearer the center, albums keep to their own regions, and the view opens on the center. All photo details for the selection load up front; images still load as they come on screen (requested by Michael, 2026-10-20).

### 2026-10-19 (album picker)

- Replaced the year chips and flat folder list in the menu with a nested album-picker tree: selecting a folder selects everything inside it, deselecting a nested folder marks the parent partially selected, and a selected top-level folder expands into one album area per child album. Removed the library-root editor from the menu (it remains on the configuration-error screen). Requested by Michael on 2026-10-19.

### 2026-10-19

- Wall tiles now crop photos to their shape instead of stretching them, so no photo's aspect ratio changes (requested by Michael, 2026-10-19).
- Replaced the column-first "vertical seams" rule with a few-short-seams rule: column boundaries shift wherever neighbouring columns line up, so vertical seams end in T-junctions instead of running the full wall height (approved by Michael, 2026-10-19).

### 2026-10-18

- Hover pop now animates in for every hovered photo (previously only the first), and the previous photo settles back as the pointer moves to a neighbour.
- Next/previous glides the wall to the new photo instead of jumping.
- The focused-photo modal's next/previous controls now work: they step to an adjacent photo along one path through the whole wall and center the wall on it (approved by Michael, 2026-10-18).

- The hover slide only applies to photos partly outside the viewport; fully visible photos stay put.

### 2026-10-17

- Hover pop always stays centered on the photo instead of being pushed into view, and the hovered photo slides slowly until the cursor is at its center (any photo size).
- Zoom now pivots on the pinch midpoint (touch), the cursor (trackpad pinch / ctrl-wheel) or the screen center (buttons) instead of the top-left corner.
- Fixed fling vibration: the glide no longer steps backward as it settles, which also restores the glide distance it was losing.
- Strengthened the mobile fling: hard flicks carry a few screens; slow releases still stop promptly.

### 2026-10-16

- Replaced the anchored hover preview with a hover pop: the hovered photo lifts slightly in place with a drop shadow over its neighbors.
- Made zoom sensitive enough that one trackpad pinch or one touch pinch/spread covers the whole zoom range; a single mouse-wheel notch still steps gently.

- Zoomed-in detail now follows each visible photo's drawn size on the actual screen, including high-DPI displays, instead of a fixed zoom band. Off-screen photos stay on thumbnails.

### 2026-10-02

- Removed Mosaic Lab: its controls entry, sandbox behavior, sample-album scenarios and related non-goal. The wall is the app's only surface.

### 2026-09-19

- Recorded the approved full-viewport mosaic and stable horizontal/vertical repetition contract for single and grouped views.
- Replaced separated/scattered album regions with adjoining irregular regions and center-anchored signpost navigation.
- Required a finite useful overview limit, with repeat-density tuning delegated rather than fixed to a literal 2×/4× factor; captured the friendly 50+ photo target.
- This records intended behavior for the next initiative, not an implementation-completion claim.

### 2026-09-15

- Clarified the mobile fling goal after renewed user feedback: prompt slow-release stopping, consistent screen-space response across zoom/refresh rates, and unchanged cancellation rules.

### 2026-08-01

- Replaced the fixed mobile release nudge with the approved velocity-responsive, native-style fling contract: slow drags stop quickly and fast flicks coast farther with smooth deceleration.

### 2026-07-31

- Added the approved subtle two-axis wheel-momentum behavior, cancellation rules, and reduced-motion exception.
- Extended restrained momentum to single-finger mobile drag release and required reliable tap-to-focus behavior across overlapping layout rows.
- Raised the approved overview-thumbnail target to a centrally configurable 512px long edge.

### 2026-07-30

- Recorded the verified large-album bounds, versioned media identity, thumbnail-first initial frame, and coarse-pointer pinch/zoom-control contract.

### 2026-06-26

- Reframed Mosaic Lab as a wall-first mock photo wall sandbox with synthetic sample albums, generated photo-like inputs, immediate production-wall rerenders, honest diagnostics, and deferred saved failure cases.
- Added the approved single-versus-grouped sample-album flow, camera reset/recenter expectation, and uniform-input structure examples.

### 2026-06-20

- Recorded the approved Mosaic Lab behavior as a synthetic Pixi/camera-based experiment bench with starter recipes, editable recipe comparisons, and explicit anti-grid expectations for uniform-input studies.

### 2026-06-14

- Documented the normal-build Mosaic Lab entry seam while keeping the real photo wall as the default first surface.
- Clarified that Mosaic Lab is synthetic/mockup-only content with an explicit return path and no implied promise of unfinished lab capabilities.

### 2026-06-09

- Added the grouped-view persistence and completeness rules: active year/folder selection should survive reload, grouped multi-album views should keep fetching until each selected album area has photos, and the initial grouped overview should stay near the selected album cluster instead of large empty stretches.

### 2026-06-07

- Added the dominant-album suppression rule for grouped signposts: when one album already occupies most of the current view, its signpost stays hidden and only other destinations are suggested.
- Added the dynamic zoom rule: the wall should zoom in and out while keeping a fast broad overview and progressively refining image detail as the user moves closer.
- Clarified that overview zoom should prefer quick readability over loading full detail everywhere at once.

### 2026-06-06

- Added the approved grouped multi-album browsing behavior: one loose area per album in grouped views, including year-wide views that expand into multiple albums.
- Added the stable in-area shuffle rule and the intent-revealed signpost-label behavior, including edge-trigger reveal, modal suppression, and snap-fast glide navigation.
- Recorded that the grouped signpost set must stay bounded so the default wall remains visually minimal.

### 2026-06-05

- Replaced the temporary zero-crop wall rule with the approved priority order: flawless mosaic first, then modest crop, then tile-size preference, with gaps treated as the worst outcome.
- Clarified that wall tiles may crop when needed to avoid dark cavities or pathological strip artifacts, while hover preview and the focused modal remain the fuller-image path.

### 2026-06-04

- Replaced the old slight-hover-enlarge rule with an anchored hover preview on desktop fine pointers.
- Defined the hover preview size target as about the midpoint between the current tile size and the eventual focused-photo modal render size for the same photo.
- Clarified that sub-threshold pointer jitter must still click-open the photo, while true drag-threshold crossings suppress click activation.

### 2026-06-03

- Updated the approved wall behavior to use seamless wrap-around navigation at all four edges within the finite loaded wall instead of hard camera clamping.
- Added the first-appearance-only tile fade rule so newly seen photos can softly enter without repeatedly reanimating on later revisits.
- Refined the wall composition to read as a vertical, column-first mosaic instead of a horizontal brick field.
- Made the bounded world deliberately wider than the viewport on normal screens so 2D panning has real horizontal travel as well as vertical travel.

### 2026-06-02

- Replaced the diagonal-scroll motion model with true two-axis trackpad panning and mouse click-drag panning per the approved MVP contract.
- Reduced MVP filtering to **year** and **folder** only; explicitly listed month filtering as a non-goal.
- Added the trusted-LAN-only assumption, the slight hover enlarge behavior, the focused-photo modal with `X` close control, and server-side saved-filter playlist persistence.
- Refreshed approval line to record the 2026-06-02 mission /plan handoff approval continuing the 2026-06-01 baseline.

### 2026-06-01

- Clarified that the photo source is a configurable root directory whose subfolders are discovered for browsing and filtering.
- Recorded the likely year → event → photo library shape without turning it into a hardcoded product requirement.
- Added the approved baseline behavior for the photo-wall browsing experience.
