# Photo Wall Experience
Last edited: 2026-06-06
Status: Approved
Decision owner: Michael
Drafted by: Pi
Approved by: Michael via mission /plan handoff on 2026-06-02, follow-up implementation approval for wrap-around navigation on 2026-06-03, anchored hover-preview approval plus midpoint sizing clarification on 2026-06-04, and grouped multi-album area/signpost approval during the 2026-06-06 mission kickoff
Change policy: Do not change without explicit human approval
Related files: `../../README.md`, `../glossary.md`, `../system/photo-library-source-and-runtime.md`, `README.md`

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
- Wall tiles may crop photos when needed to preserve mosaic continuity, but that crop should stay modest rather than flattening every image toward one generic shape.
- The wall should fit photos together tightly with no intentional gaps between tiles.
- The wall should read as a column-first mosaic with vertical seams and staggered horizontal breaks rather than as obvious full-width horizontal striping.
- The wall should support dynamic zoom in and out with a fast broad overview and progressively better image detail as the user moves closer.
- The wall should support true two-axis panning driven by trackpad wheel deltas, allowing simultaneous horizontal and vertical camera movement.
- The wall must also support mouse click-drag panning as a fallback for users without a trackpad, with click activation suppressed after the drag threshold is crossed.
- Additional photos should load dynamically as the user keeps panning the wall, so the experience does not require the entire library to load up front.
- The wall should wrap seamlessly at its left/right and top/bottom edges within the currently loaded finite world instead of stopping at hard camera clamps.
- On desktop fine-pointer devices, hovering a photo should open an anchored hover preview for that same photo without destabilizing the surrounding wall layout.
- The anchored hover preview should render at about the midpoint between that tile’s current rendered size and the eventual focused-photo modal render size for the same photo, stay anchored to the source tile instead of centering in the viewport, and remain preview-only.
- A photo may softly fade in the first time it becomes visible during the current session to suggest progressive loading, but the same photo should not repeatedly re-fade on every later revisit.
- Clicking a non-dragged photo must open a simple focused-photo modal sized to the browser viewport, with an explicit visible `X` control to close.
- Closing the focused-photo modal must return the user to the same wall context they came from.
- The default interface should stay minimal: just the photo wall plus a small circular menu button.
- Activating the small circular menu button should open a larger menu for filtering and playlist controls.
- Filtering must support **year** and **folder** for the MVP.
- Folder filtering should reflect the discovered folder structure under the configured library root.
- When the active view resolves to a single album, the wall should keep the simpler single-album browsing presentation.
- When the active view resolves to multiple albums, including a year-wide view that expands into multiple child albums, the wall should group photos into one loose area per album.
- Those album areas should feel organic and scattered rather than arranged into obvious rigid sections, but still clustered enough that the initial grouped overview does not strand the user in large empty stretches away from the selected albums.
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
- The user should be able to pan in any direction with a trackpad or by click-dragging with a mouse; reversing direction should remain smooth without changing the model from 2D panning to vertical scrolling.
- Zooming out should favor a fast readable overview over full-detail loading everywhere at once, and zooming in should refine image detail progressively rather than waiting for the whole wall to repopulate.
- Minor pointer jitter that stays below the drag threshold should still resolve as a click on the hovered photo rather than shifting the wall first.
- The anchored hover preview should be suppressed while the user is actively dragging the wall and while the focused-photo modal is open.
- Panning past the right edge should immediately continue from the left side of the currently loaded wall, and vice versa; the same wrap rule applies for top/bottom travel.
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
- A truly unbounded or infinitely generated 2D world.
- Chrome-heavy gallery UI with persistent panels competing with the photos.
- Large always-visible navigation, metadata, or management surfaces.
- A sophisticated playlist authoring model beyond saved filter presets.
- Final visual specifics of the focused-photo modal beyond its viewport-sized framing and explicit `X` close control.

## Related docs

- `../../README.md`
- `../glossary.md`
- `../system/photo-library-source-and-runtime.md`
- `../standards/documentation-model.md`
- `../standards/testing.md`

## Changelog

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
