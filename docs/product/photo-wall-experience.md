# Photo Wall Experience
Last edited: 2026-06-02
Status: Approved
Decision owner: Michael
Drafted by: Pi
Approved by: Michael via mission /plan handoff on 2026-06-02 (continues the 2026-06-01 approved baseline)
Change policy: Do not change without explicit human approval
Related files: `../../README.md`, `../glossary.md`, `../system/photo-library-source-and-runtime.md`, `README.md`

## Behavior summary

`photo-wall` is a minimal web app that turns one configured photo library on the home LAN into a large, immersive browsing wall. The page is dominated by the photos themselves. Filtering, playlist selection, and the focused-photo view exist, but they stay visually secondary to the wall.

The MVP is a trusted-LAN, Docker-run app with no auth boundary and no internet-facing exposure.

## Rules and invariants

- The photo source is a single configurable photo-library root chosen by the operator and mounted from the host into the Docker container.
- The product should discover photos from that root and its subfolders recursively rather than requiring one folder to be configured per event.
- Photos should be shown large rather than as tiny thumbnail grids.
- The wall should fit photos together tightly with no intentional gaps between tiles.
- The wall should support true two-axis panning driven by trackpad wheel deltas, allowing simultaneous horizontal and vertical camera movement.
- The wall must also support mouse click-drag panning as a fallback for users without a trackpad, with click activation suppressed after the drag threshold is crossed.
- Additional photos should load dynamically as the user keeps panning the wall, so the experience does not require the entire library to load up front.
- Hovering a photo should slightly enlarge it without destabilizing the surrounding row layout.
- Clicking a non-dragged photo must open a simple focused-photo modal sized to the browser viewport, with an explicit visible `X` control to close.
- Closing the focused-photo modal must return the user to the same wall context they came from.
- The default interface should stay minimal: just the photo wall plus a small circular menu button.
- Activating the small circular menu button should open a larger menu for filtering and playlist controls.
- Filtering must support **year** and **folder** for the MVP.
- Folder filtering should reflect the discovered folder structure under the configured library root.
- The product must support playlists in the form of server-side saved filter presets that the user can save, recall, update, and delete from the interface.
- Stale playlist references to folders that no longer exist must degrade gracefully rather than crashing the app.

## Edge cases and examples

- With no filter or playlist active, the wall should show the default broad view of the configured photo library in a deterministic order derived from discovered library structure so browsing follows the expected year/event/path flow.
- The user should be able to pan in any direction with a trackpad or by click-dragging with a mouse; reversing direction should remain smooth without changing the model from 2D panning to vertical scrolling.
- Applying a year or folder filter should narrow the displayed set coherently without leaving stale mixed-result tiles onscreen and without changing the minimal overall framing of the page.
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

### 2026-06-02
- Replaced the diagonal-scroll motion model with true two-axis trackpad panning and mouse click-drag panning per the approved MVP contract.
- Reduced MVP filtering to **year** and **folder** only; explicitly listed month filtering as a non-goal.
- Added the trusted-LAN-only assumption, the slight hover enlarge behavior, the focused-photo modal with `X` close control, and server-side saved-filter playlist persistence.
- Refreshed approval line to record the 2026-06-02 mission /plan handoff approval continuing the 2026-06-01 baseline.

### 2026-06-01
- Clarified that the photo source is a configurable root directory whose subfolders are discovered for browsing and filtering.
- Recorded the likely year → event → photo library shape without turning it into a hardcoded product requirement.
- Added the approved baseline behavior for the photo-wall browsing experience.
