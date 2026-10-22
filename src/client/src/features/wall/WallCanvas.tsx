import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	isNearViewportHorizontally,
	computeWrappedAxisCopies,
	computeWrappedVisibleRowSegments,
} from "./virtualization.js";
import { shouldLoadNextPage } from "./dynamicLoading.js";
import {
	collectFirstAppearancePhotoIds,
	rememberSeenPhotoIds,
} from "./appearanceTracking.js";
import type { GroupedWallFoundation } from "./groupedWall.js";
import { useWallFocusNavigator } from "./useWallFocusNavigator.js";
import {
	useCenterCameraOnLayout,
	useRadialWallLayout,
} from "./useRadialWallLayout.js";
import { useCameraGlide } from "./useCameraGlide.js";
import type { WallFocusNavigator } from "./focusNavigation.js";
import {
	computeHoverPopRect,
	HOVER_RESUME_AFTER_WHEEL_MS,
} from "./hoverPreview.js";
import { WallHoverPopLayer } from "./WallHoverPop.js";
import { useHoverCursorPan } from "./useHoverCursorPan.js";
import { PixiWallSurface } from "./PixiWallSurface.js";
import { wallTileZOrder } from "./pixiScene.js";
import { WallZoomControls } from "./WallZoomControls.js";
import { useTouchPinchZoom } from "./useTouchPinchZoom.js";
import {
	stepZoom,
	wheelZoom,
	zoomAnchorDelta,
	type ScreenPoint,
} from "./zoomInput.js";
import { useRafCameraPublisher } from "./useRafCameraPublisher.js";
import { usePanMomentum } from "./usePanMomentum.js";
import {
	createDragMomentumSample,
	dragMomentumAtRelease,
	sampleDragMomentum,
	type DragMomentumSample,
} from "./dragMomentum.js";
import {
	computeWrapAwareCameraTarget,
	easeOutCubic,
} from "./signpostNavigation.js";
import {
	detectEdgeIntent,
	findDominantVisibleAlbumKey,
	selectVisibleSignposts,
	type VisibleSignpost,
} from "./signposts.js";
import {
	DRAG_THRESHOLD_PX,
	hasCrossedThreshold,
	type DragOrigin,
} from "./dragGesture.js";
import type { PhotoQueryRecord } from "../../../../shared/api/photos.js";
import { DEFAULT_OVERSCAN, type LayoutOverscan } from "../../state/layout.js";
import {
	resolveWallMediaSource,
	type WallMediaSourceResolver,
} from "./mediaSourceResolver.js";
import {
	panBy,
	withViewport,
	withWorldBounds,
	panTo,
	wrapTravelOffset,
	type CameraState,
} from "../../state/camera.js";

/** How close the bottom edge must get to the frontier before we fetch. */
const FRONTIER_THRESHOLD_PX = 800;
const SIGNPOST_LINGER_MS = 900;
const SIGNPOST_GLIDE_MS = 240;

export interface WallStats {
	totalRows: number;
	mountedRows: number;
	visibleStart: number;
	visibleEnd: number;
	/** Continuous vertical travel offset used by the debug overlay. */
	scrollTop: number;
	contentHeight: number;
	worldWidth: number;
	packedPhotoCount: number;
}

export interface WallDragState {
	/** True while a pointer is being held down on the canvas. */
	active: boolean;
	/** True once the active pointer has crossed the drag threshold. */
	crossedThreshold: boolean;
}

export const INITIAL_DRAG_STATE: WallDragState = {
	active: false,
	crossedThreshold: false,
};

export interface WallCanvasProps {
	photos: readonly PhotoQueryRecord[];
	worldWidth: number;
	hasNextPage: boolean;
	isFetchingNextPage: boolean;
	onLoadMore: () => void;
	groupedFoundation?: GroupedWallFoundation | null;
	overscan?: LayoutOverscan;
	onStatsChange?: (stats: WallStats) => void;
	camera: CameraState;
	onCameraChange: (next: CameraState) => void;
	onDragStateChange?: (state: WallDragState) => void;
	activeAlbumAreaCount?: number;
	/**
	 * Enable grouped signpost reveal + glide behavior for grouped views.
	 * Callers may still disable these controls for tightly scoped grouped
	 * experiments, but the active grouped wall keeps them enabled.
	 */
	signpostsEnabled?: boolean;
	/**
	 * Fired when a tile receives a non-drag click. Suppressed when the
	 * preceding pointer gesture crossed the drag threshold so a drag-pan
	 * does not also open the modal.
	 */
	onPhotoOpen?: (photo: PhotoQueryRecord) => void;
	/** True while the focused-photo modal is open. */
	isModalOpen?: boolean;
	/** Receives the focused view's next/previous handle for this wall. */
	focusNavigatorRef?: React.MutableRefObject<WallFocusNavigator | null>;
	/** Override for unit tests; defaults to {@link DRAG_THRESHOLD_PX}. */
	dragThresholdPx?: number;
	mediaSourceResolver?: WallMediaSourceResolver;
}

interface ActiveDrag {
	pointerId: number;
	pointerType: string;
	origin: DragOrigin;
	/** Last pointer coords that have been applied to camera panning. */
	lastX: number;
	lastY: number;
	crossedThreshold: boolean;
	momentum: DragMomentumSample;
}

interface RenderedTileInstance {
	key: string;
	photoId: string;
	albumKey: string | null;
	x: number;
	y: number;
	width: number;
	height: number;
	sourceWidth: number;
	sourceHeight: number;
	layer: number;
	shouldFadeOnMount: boolean;
}

interface RenderedRowInstance {
	key: string;
	rowIndex: number;
	offsetTop: number;
	height: number;
	tiles: RenderedTileInstance[];
}

interface HoverPreviewState {
	photo: PhotoQueryRecord;
	left: number;
	top: number;
	width: number;
	height: number;
}

export function WallCanvas(props: WallCanvasProps): JSX.Element {
	const {
		photos,
		worldWidth: referenceWidth,
		hasNextPage,
		isFetchingNextPage,
		onLoadMore,
		groupedFoundation = null,
		overscan = DEFAULT_OVERSCAN,
		onStatsChange,
		camera,
		onCameraChange,
		onDragStateChange,
		activeAlbumAreaCount = 1,
		signpostsEnabled = true,
		onPhotoOpen,
		isModalOpen = false,
		focusNavigatorRef,
		dragThresholdPx = DRAG_THRESHOLD_PX,
		mediaSourceResolver,
	} = props;

	const containerRef = useRef<HTMLDivElement | null>(null);
	const dragRef = useRef<ActiveDrag | null>(null);
	const pressedPhotoIdRef = useRef<string | null>(null);
	const seenPhotoIdsRef = useRef<Set<string>>(new Set());
	const signpostHideTimeoutRef = useRef<number | null>(null);
	const glideFrameRef = useRef<number | null>(null);

	// Mirror props into refs so wheel/pointer handlers always read the
	// latest callbacks without forcing rebinds on every state tick.

	const cameraRef = useRef(camera);
	const {
		publish: publishCamera,
		flush: flushCamera,
		isEcho: isPublishedCamera,
	} = useRafCameraPublisher(onCameraChange);
	const {
		startWheel: startWheelMomentum,
		startDrag: startDragMomentum,
		cancel: cancelPanMomentum,
		isActive: isPanMomentumActive,
	} = usePanMomentum({ cameraRef, publishCamera, flushCamera });
	const {
		glideTo: glideCameraTo,
		cancel: cancelFocusGlide,
		isActive: isFocusGlideActive,
	} = useCameraGlide({ cameraRef, publishCamera, flushCamera });

	const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
	// Mirror the live drag flag into React state so the `data-dragging`
	// attribute updates on the same tick as the gesture, not on the next
	// unrelated render. The ref above remains the source of truth inside
	// the high-frequency pointer handlers.
	const [dragActive, setDragActive] = useState(false);
	const [hoverPreview, setHoverPreview] = useState<HoverPreviewState | null>(
		null,
	);
	const [zoom, setZoom] = useState(1);
	const [signpostsVisible, setSignpostsVisible] = useState(false);

	const zoomRef = useRef(zoom);
	useEffect(() => {
		zoomRef.current = zoom;
	}, [zoom]);

	const hoverPreviewRef = useRef<HoverPreviewState | null>(null);
	hoverPreviewRef.current = hoverPreview;
	const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
	const lastWheelAtRef = useRef(Number.NEGATIVE_INFINITY);
	const {
		schedule: scheduleHoverPan,
		cancel: cancelHoverPan,
		release: releaseHoverPan,
		isActive: isHoverPanActive,
	} = useHoverCursorPan({
		cameraRef,
		zoomRef,
		publishCamera,
		flushCamera,
		getHoverRect: () => hoverPreviewRef.current,
		getCursor: () => lastPointerRef.current,
		shiftHoverRect: (dx, dy) =>
			setHoverPreview((prev) =>
				prev ? { ...prev, left: prev.left + dx, top: prev.top + dy } : prev,
			),
	});
	// Losing hover (leave, drag, wheel, pinch, modal) stops any hover slide.
	useEffect(() => {
		if (!hoverPreview) releaseHoverPan();
	}, [hoverPreview, releaseHoverPan]);
	useEffect(() => {
		// Our own publishes reach React a frame late; the live ref is already
		// ahead of them. While a drag or glide is moving the camera, outside
		// updates (resize, newly loaded rows) only bring new bounds; rebasing
		// the live position onto them avoids rewinding a frame.
		if (isPublishedCamera(camera)) return;
		const live = cameraRef.current;
		cameraRef.current =
			dragRef.current ||
			isPanMomentumActive() ||
			isHoverPanActive() ||
			isFocusGlideActive()
				? withWorldBounds(withViewport(live, camera.viewport), camera.world)
				: camera;
	}, [
		camera,
		isFocusGlideActive,
		isHoverPanActive,
		isPanMomentumActive,
		isPublishedCamera,
	]);
	const handlePinchStart = useCallback(() => {
		cancelPanMomentum();
		cancelFocusGlide();
		const drag = dragRef.current;
		if (!drag) return;
		drag.crossedThreshold = true;
		drag.momentum = createDragMomentumSample(performance.now());
		pressedPhotoIdRef.current = null;
		setHoverPreview(null);
	}, [cancelFocusGlide, cancelPanMomentum]);
	// The wall scales from its top-left, so every zoom also moves the camera
	// to keep the world point under the pinch, cursor or screen center fixed.
	const applyZoom = useCallback(
		(nextZoom: number, before: ScreenPoint, after: ScreenPoint = before) => {
			const fromZoom = zoomRef.current;
			if (nextZoom === fromZoom && before.x === after.x && before.y === after.y) {
				return;
			}
			const next = panBy(
				cameraRef.current,
				zoomAnchorDelta(fromZoom, nextZoom, before, after),
			);
			cameraRef.current = next;
			publishCamera(next);
			// Same React batch as the zoom, so no frame shows the unpivoted zoom.
			flushCamera();
			zoomRef.current = nextZoom;
			setZoom(nextZoom);
		},
		[flushCamera, publishCamera],
	);
	useTouchPinchZoom(
		containerRef,
		zoomRef,
		applyZoom,
		handlePinchStart,
	);

	const dragStateChangeRef = useRef(onDragStateChange);
	useEffect(() => {
		dragStateChangeRef.current = onDragStateChange;
	}, [onDragStateChange]);

	const photoOpenRef = useRef(onPhotoOpen);
	useEffect(() => {
		photoOpenRef.current = onPhotoOpen;
	}, [onPhotoOpen]);

	// O(1) photo lookup by id for pointer activation and hover-preview
	// geometry.
	const photosById = useMemo(() => {
		const m = new Map<string, PhotoQueryRecord>();
		for (const p of photos) m.set(p.id, p);
		return m;
	}, [photos]);

	// Track viewport size of the canvas. ResizeObserver fires
	// synchronously after mount so the first render measures the actual
	// CSS layout size, not a 0 placeholder.
	useLayoutEffect(() => {
		const el = containerRef.current;
		if (!el) return undefined;
		const apply = (): void => {
			const next = { width: el.clientWidth, height: el.clientHeight };
			setViewportSize((prev) =>
				prev.width === next.width && prev.height === next.height ? prev : next,
			);
		};
		apply();
		const observer = new ResizeObserver(apply);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	const viewportWidth = viewportSize.width;
	const viewportHeight = viewportSize.height;
	const effectiveViewportWidth = viewportWidth / zoom;
	const effectiveViewportHeight = viewportHeight / zoom;

	const cancelActiveGlide = useCallback(() => {
		cancelFocusGlide();
		if (glideFrameRef.current !== null) {
			cancelAnimationFrame(glideFrameRef.current);
			glideFrameRef.current = null;
		}
	}, [cancelFocusGlide]);

	const revealSignposts = useCallback((lingerMs = SIGNPOST_LINGER_MS) => {
		setSignpostsVisible(true);
		if (signpostHideTimeoutRef.current !== null) {
			window.clearTimeout(signpostHideTimeoutRef.current);
		}
		signpostHideTimeoutRef.current = window.setTimeout(() => {
			setSignpostsVisible(false);
			signpostHideTimeoutRef.current = null;
		}, lingerMs);
	}, []);

	useEffect(() => {
		return () => {
			cancelActiveGlide();
			if (signpostHideTimeoutRef.current !== null) {
				window.clearTimeout(signpostHideTimeoutRef.current);
			}
		};
	}, [cancelActiveGlide]);

	const packed = useRadialWallLayout({
		photos,
		groupedFoundation,
		referenceWidth,
	});
	// The world is sized to the photos; the viewport only sets tile size.
	const worldWidth = packed.worldWidth;
	useCenterCameraOnLayout({
		layout: packed,
		cameraRef,
		zoomRef,
		publishCamera,
		flushCamera,
	});

	useWallFocusNavigator({
		navigatorRef: focusNavigatorRef,
		packed,
		cameraRef,
		zoomRef,
		glideTo: glideCameraTo,
	});

	const wrappedCameraX = useMemo(
		() => wrapTravelOffset(camera.x, worldWidth),
		[camera.x, worldWidth],
	);
	const wrappedCameraY = useMemo(
		() => wrapTravelOffset(camera.y, packed.contentHeight),
		[camera.y, packed.contentHeight],
	);

	const horizontalCopies = useMemo(
		() =>
			computeWrappedAxisCopies({
				period: worldWidth,
				viewportSize: effectiveViewportWidth,
				wrappedOffset: wrappedCameraX,
			}),
		[worldWidth, effectiveViewportWidth, wrappedCameraX],
	);

	const verticalSegments = useMemo(
		() =>
			computeWrappedVisibleRowSegments({
				rows: packed.rows,
				contentHeight: packed.contentHeight,
				wrappedScrollTop: wrappedCameraY,
				viewportHeight: effectiveViewportHeight,
				overscan,
			}),
		[
			packed.rows,
			packed.contentHeight,
			wrappedCameraY,
			effectiveViewportHeight,
			overscan,
		],
	);

	const photoAlbumKeys = useMemo(() => {
		const map = new Map<string, string>();
		if (groupedFoundation?.mode !== "grouped") return map;
		for (const album of groupedFoundation.albums) {
			for (const photo of album.photos) {
				map.set(photo.id, album.area.albumKey);
			}
		}
		return map;
	}, [groupedFoundation]);

	const renderPlan = useMemo(() => {
		const firstAppearanceIds: string[] = [];
		const renderedRows: RenderedRowInstance[] = [];
		const seenPhotoIds = seenPhotoIdsRef.current;

		for (const segment of verticalSegments) {
			const rows = packed.rows.slice(segment.startIndex, segment.endIndex);
			for (const row of rows) {
				const rowFreshIds = collectFirstAppearancePhotoIds(
					row.tiles.map((tile) => tile.photoId),
					seenPhotoIds,
				);
				const rowFreshIdSet = new Set(rowFreshIds);
				firstAppearanceIds.push(...rowFreshIds);

				const rowTiles: RenderedTileInstance[] = [];
				for (const xCopy of horizontalCopies) {
					for (const [tileIndex, tile] of row.tiles.entries()) {
						if (
							!isNearViewportHorizontally(
								tile.x + xCopy.offset,
								tile.width,
								effectiveViewportWidth,
							)
						) {
							continue;
						}
						rowTiles.push({
							key: `${row.index}:${segment.copyIndex}:${xCopy.copyIndex}:${tileIndex}:${tile.photoId}`,
							photoId: tile.photoId,
							x: tile.x + xCopy.offset,
							y: tile.y - row.offsetTop,
							width: tile.width,
							height: tile.height,
							sourceWidth: tile.sourceWidth,
							sourceHeight: tile.sourceHeight,
							layer: tile.layer ?? 0,
							albumKey: photoAlbumKeys.get(tile.photoId) ?? null,
							shouldFadeOnMount: rowFreshIdSet.has(tile.photoId),
						});
					}
				}

				renderedRows.push({
					key: `${row.index}:${segment.copyIndex}`,
					rowIndex: row.index,
					offsetTop: row.offsetTop + segment.copyOffset,
					height: row.height,
					tiles: rowTiles,
				});
			}
		}

		const mountedRowIndices = new Set(renderedRows.map((row) => row.rowIndex));

		return {
			renderedRows,
			firstAppearanceIds: collectFirstAppearancePhotoIds(
				firstAppearanceIds,
				seenPhotoIds,
			),
			mountedRowCount: mountedRowIndices.size,
		};
	}, [
		verticalSegments,
		packed.rows,
		horizontalCopies,
		photoAlbumKeys,
		effectiveViewportWidth,
	]);

	const dominantVisibleAlbumKey = useMemo(() => {
		if (!signpostsEnabled || groupedFoundation?.mode !== "grouped") return null;
		return findDominantVisibleAlbumKey({
			tiles: renderPlan.renderedRows.flatMap((row) =>
				row.tiles.map((tile) => ({
					albumKey: tile.albumKey,
					left: tile.x,
					top: row.offsetTop + tile.y,
					width: tile.width,
					height: tile.height,
				})),
			),
			viewportWidth: effectiveViewportWidth,
			viewportHeight: effectiveViewportHeight,
		});
	}, [
		signpostsEnabled,
		groupedFoundation,
		renderPlan.renderedRows,
		effectiveViewportWidth,
		effectiveViewportHeight,
	]);

	const dominantVisibleAlbumLabel = useMemo(() => {
		if (
			!signpostsEnabled ||
			!dominantVisibleAlbumKey ||
			groupedFoundation?.mode !== "grouped"
		) {
			return null;
		}
		return (
			groupedFoundation.albums.find(
				(album) => album.area.albumKey === dominantVisibleAlbumKey,
			)?.area.label ?? null
		);
	}, [signpostsEnabled, dominantVisibleAlbumKey, groupedFoundation]);

	// Signposts point at where each album actually sits in the layout.
	const signpostFoundation = useMemo(() => {
		if (groupedFoundation?.mode !== "grouped") return groupedFoundation;
		return {
			...groupedFoundation,
			albums: groupedFoundation.albums.map((album) => {
				const center = packed.groupCenters.get(album.area.albumKey);
				return center
					? { ...album, area: { ...album.area, anchorX: center.x, anchorY: center.y } }
					: album;
			}),
		};
	}, [groupedFoundation, packed.groupCenters]);

	const visibleSignposts = useMemo(() => {
		if (!signpostsEnabled || !signpostsVisible || isModalOpen) return [];
		return selectVisibleSignposts({
			foundation: signpostFoundation,
			camera,
			contentHeight: packed.contentHeight,
			suppressedAlbumKeys: dominantVisibleAlbumKey
				? [dominantVisibleAlbumKey]
				: [],
		});
	}, [
		signpostsEnabled,
		signpostsVisible,
		isModalOpen,
		signpostFoundation,
		camera,
		packed.contentHeight,
		dominantVisibleAlbumKey,
	]);

	useEffect(() => {
		rememberSeenPhotoIds(
			seenPhotoIdsRef.current,
			renderPlan.firstAppearanceIds,
		);
	}, [renderPlan.firstAppearanceIds]);

	useEffect(() => {
		if (dragActive || isModalOpen) {
			setHoverPreview(null);
		}
		if (isModalOpen) {
			setSignpostsVisible(false);
			if (signpostHideTimeoutRef.current !== null) {
				window.clearTimeout(signpostHideTimeoutRef.current);
				signpostHideTimeoutRef.current = null;
			}
			cancelActiveGlide();
			cancelPanMomentum();
		}
	}, [dragActive, isModalOpen, cancelActiveGlide, cancelPanMomentum]);

	// Dynamic loading: fire whenever the absolute travel position says we
	// are within the frontier threshold. Wrapped render position is
	// intentionally ignored so looping around the top does not stall
	// loading of later pages.
	useEffect(() => {
		if (
			shouldLoadNextPage({
				travelY: camera.y,
				viewportHeight: effectiveViewportHeight,
				contentHeight: packed.contentHeight,
				thresholdPx: FRONTIER_THRESHOLD_PX,
				isFetchingNext: isFetchingNextPage,
				hasNextPage,
			})
		) {
			onLoadMore();
		}
	}, [
		camera.y,
		effectiveViewportHeight,
		packed.contentHeight,
		isFetchingNextPage,
		hasNextPage,
		onLoadMore,
	]);

	// Report stats up for the debug overlay so the parent does not need
	// to duplicate the geometry math.
	useEffect(() => {
		if (!onStatsChange) return;
		const visibleStart =
			verticalSegments.length > 0
				? Math.min(...verticalSegments.map((segment) => segment.startIndex))
				: 0;
		const visibleEnd =
			verticalSegments.length > 0
				? Math.max(...verticalSegments.map((segment) => segment.endIndex))
				: 0;
		onStatsChange({
			totalRows: packed.rows.length,
			mountedRows: renderPlan.mountedRowCount,
			visibleStart,
			visibleEnd,
			scrollTop: camera.y,
			contentHeight: packed.contentHeight,
			worldWidth,
			packedPhotoCount: packed.packedPhotoCount,
		});
	}, [
		onStatsChange,
		packed.rows.length,
		packed.contentHeight,
		packed.packedPhotoCount,
		renderPlan.mountedRowCount,
		verticalSegments,
		camera.y,
		worldWidth,
	]);

	// The native wheel event is attached imperatively because React's
	// synthetic wheel handler binds as passive by default, which would
	// forbid `preventDefault` and let the browser also page-scroll.
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return undefined;
		const onWheel = (event: WheelEvent): void => {
			lastWheelAtRef.current = performance.now();
			// Honor the event regardless of axis lock — trackpads emit both
			// deltaX and deltaY for 2D gestures.
			event.preventDefault();
			cancelActiveGlide();
			cancelPanMomentum();
			if (signpostsEnabled) {
				revealSignposts();
			}
			setHoverPreview(null);

			if (event.ctrlKey || event.metaKey) {
				const rect = el.getBoundingClientRect();
				applyZoom(wheelZoom(zoomRef.current, event.deltaY), {
					x: event.clientX - rect.left,
					y: event.clientY - rect.top,
				});
				return;
			}

			const panDelta = {
				dx: event.deltaX / zoomRef.current,
				dy: event.deltaY / zoomRef.current,
			};
			const next = panBy(cameraRef.current, panDelta);
			if (next !== cameraRef.current) {
				// Update the ref optimistically so a burst of wheel events
				// between React renders compounds off the latest value rather
				// than a stale snapshot.
				cameraRef.current = next;
				publishCamera(next);
				startWheelMomentum(panDelta);
			}
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	}, [
		applyZoom,
		cancelActiveGlide,
		cancelPanMomentum,
		revealSignposts,
		signpostsEnabled,
		startWheelMomentum,
	]);

	const changeZoom = useCallback(
		(factor: number) => {
			const rect = containerRef.current?.getBoundingClientRect();
			applyZoom(stepZoom(zoomRef.current, factor), {
				x: (rect?.width ?? 0) / 2,
				y: (rect?.height ?? 0) / 2,
			});
		},
		[applyZoom],
	);

	const handlePointerDown = useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			// Only react to the primary pointer (mouse left button / single
			// touch / pen). Right-click and middle-click should not pan.
			if (!event.isPrimary) return;
			if (event.button !== 0 && event.pointerType === "mouse") return;
			if (dragRef.current) return;

			cancelActiveGlide();
			cancelPanMomentum();
			setHoverPreview(null);

			const target = event.target as HTMLElement | null;
			pressedPhotoIdRef.current =
				target?.closest<HTMLElement>("[data-photo-id]")?.dataset["photoId"] ??
				null;

			dragRef.current = {
				pointerId: event.pointerId,
				pointerType: event.pointerType,
				origin: { startX: event.clientX, startY: event.clientY },
				lastX: event.clientX,
				lastY: event.clientY,
				crossedThreshold: false,
				momentum: createDragMomentumSample(event.timeStamp),
			};
			// Pointer capture keeps move/up flowing if the pointer leaves the
			// canvas mid-drag. Guard against environments where the pointer
			// isn't bound to a real device (e.g., synthetic Playwright /
			// DevTools events) — capture isn't load-bearing for the gesture.
			try {
				event.currentTarget.setPointerCapture(event.pointerId);
			} catch {
				/* ignore */
			}
			setDragActive(true);
			dragStateChangeRef.current?.({
				active: true,
				crossedThreshold: false,
			});
		},
		[cancelActiveGlide, cancelPanMomentum],
	);

	const handlePointerMove = useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			const drag = dragRef.current;
			if (!drag || drag.pointerId !== event.pointerId) {
				if (
					signpostsEnabled &&
					!drag &&
					!isModalOpen &&
					groupedFoundation?.mode === "grouped"
				) {
					const rect = containerRef.current?.getBoundingClientRect();
					if (rect) {
						const edge = detectEdgeIntent({
							x: event.clientX - rect.left,
							y: event.clientY - rect.top,
							viewportWidth: rect.width,
							viewportHeight: rect.height,
						});
						if (edge) {
							revealSignposts();
						}
					}
				}
				return;
			}

			if (!drag.crossedThreshold) {
				if (
					!hasCrossedThreshold(
						drag.origin,
						{ x: event.clientX, y: event.clientY },
						dragThresholdPx,
					)
				) {
					return;
				}

				drag.crossedThreshold = true;
				dragStateChangeRef.current?.({
					active: true,
					crossedThreshold: true,
				});
			}

			if (signpostsEnabled) {
				revealSignposts();
			}
			const dx = event.clientX - drag.lastX;
			const dy = event.clientY - drag.lastY;
			drag.lastX = event.clientX;
			drag.lastY = event.clientY;

			// Move the camera opposite the drag delta so the world appears
			// to follow the pointer. We do not pan before the threshold is
			// crossed, which keeps minor click jitter from shifting the wall
			// out from under the click target. At higher zoom levels, a given
			// screen-space drag should cover less world distance.
			const panDelta = {
				dx: -dx / zoomRef.current,
				dy: -dy / zoomRef.current,
			};
			drag.momentum = sampleDragMomentum(
				drag.momentum,
				panDelta,
				event.timeStamp,
			);
			const next = panBy(cameraRef.current, panDelta);
			if (next !== cameraRef.current) {
				cameraRef.current = next;
				publishCamera(next);
			}
		},
		[
			dragThresholdPx,
			groupedFoundation,
			isModalOpen,
			publishCamera,
			revealSignposts,
			signpostsEnabled,
		],
	);

	const endDrag = useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			const drag = dragRef.current;
			if (!drag || drag.pointerId !== event.pointerId) return;
			try {
				if (event.currentTarget.hasPointerCapture(event.pointerId)) {
					event.currentTarget.releasePointerCapture(event.pointerId);
				}
			} catch {
				/* ignore */
			}
			const shouldOpenPhoto =
				!drag.crossedThreshold && event.type === "pointerup"
					? pressedPhotoIdRef.current
					: null;
			const releaseMomentum =
				drag.pointerType === "touch" &&
				drag.crossedThreshold &&
				event.type === "pointerup"
					? dragMomentumAtRelease(drag.momentum, event.timeStamp)
					: null;

			flushCamera();
			dragRef.current = null;
			pressedPhotoIdRef.current = null;
			setDragActive(false);
			dragStateChangeRef.current?.({
				active: false,
				crossedThreshold: false,
			});
			if (releaseMomentum) {
				startDragMomentum(releaseMomentum, zoomRef.current);
			}

			if (!shouldOpenPhoto) return;
			const photo = photosById.get(shouldOpenPhoto);
			if (!photo) return;
			setHoverPreview(null);
			photoOpenRef.current?.(photo);
		},
		[flushCamera, photosById, startDragMomentum],
	);

	// No hover pop while the wall is panning (drag, fling, wheel scroll or its
	// tail): photos sliding under the cursor would pop one after another.
	const isPanningForHover = useCallback(
		(): boolean =>
			isPanMomentumActive() ||
			performance.now() - lastWheelAtRef.current < HOVER_RESUME_AFTER_WHEEL_MS,
		[isPanMomentumActive],
	);

	const updateHoverPreview = useCallback(
		(tileEl: HTMLDivElement, photoId: string) => {
			if (!supportsFinePointerHover()) return;
			if (
				dragRef.current ||
				isPanningForHover() ||
				isModalOpen ||
				viewportWidth <= 0 ||
				viewportHeight <= 0
			) {
				return;
			}
			const photo = photosById.get(photoId);
			if (!photo) return;

			const tileRect = tileEl.getBoundingClientRect();
			const previewRect = computeHoverPopRect({
				tile: {
					left: tileRect.left,
					top: tileRect.top,
					width: tileRect.width,
					height: tileRect.height,
				},
			});

			if (previewRect.width <= 0 || previewRect.height <= 0) return;

			setHoverPreview({
				photo,
				left: previewRect.left,
				top: previewRect.top,
				width: previewRect.width,
				height: previewRect.height,
			});
			scheduleHoverPan(photo.id);
		},
		[scheduleHoverPan, isPanningForHover, isModalOpen, photosById, viewportWidth, viewportHeight],
	);

	// During a hover slide the wall moves under a still cursor. Boundary
	// events from that motion are ignored; real mouse movement stops the pan.
	const pointerHeldDuringHoverPan = useCallback(
		(event: { clientX: number; clientY: number }): boolean => {
			const last = lastPointerRef.current;
			lastPointerRef.current = { x: event.clientX, y: event.clientY };
			if (!isHoverPanActive()) return false;
			const moved =
				!last ||
				Math.abs(last.x - event.clientX) > 1 ||
				Math.abs(last.y - event.clientY) > 1;
			if (!moved) return true;
			cancelHoverPan();
			return false;
		},
		[cancelHoverPan, isHoverPanActive],
	);

	const handleTilePointerEnter = useCallback(
		(event: React.PointerEvent<HTMLDivElement>, photoId: string) => {
			if (pointerHeldDuringHoverPan(event)) return;
			updateHoverPreview(event.currentTarget, photoId);
		},
		[pointerHeldDuringHoverPan, updateHoverPreview],
	);

	const handleTilePointerMove = useCallback(
		(event: React.PointerEvent<HTMLDivElement>, photoId: string) => {
			if (pointerHeldDuringHoverPan(event)) return;
			updateHoverPreview(event.currentTarget, photoId);
		},
		[pointerHeldDuringHoverPan, updateHoverPreview],
	);

	const handleTilePointerLeave = useCallback(
		(photoId: string, event: React.PointerEvent<HTMLDivElement>) => {
			if (pointerHeldDuringHoverPan(event)) return;
			setHoverPreview((prev) => (prev?.photo.id === photoId ? null : prev));
		},
		[pointerHeldDuringHoverPan],
	);

	const handleSignpostActivate = useCallback(
		(targetX: number, targetY: number) => {
			if (isModalOpen) return;
			cancelActiveGlide();
			cancelPanMomentum();
			revealSignposts();
			const startCamera = cameraRef.current;
			const target = computeWrapAwareCameraTarget({
				camera: startCamera,
				targetX,
				targetY,
			});
			const startedAt = performance.now();

			const tick = (now: number): void => {
				const progress = Math.min(1, (now - startedAt) / SIGNPOST_GLIDE_MS);
				const eased = easeOutCubic(progress);
				const next = panTo(startCamera, {
					x: startCamera.x + (target.x - startCamera.x) * eased,
					y: startCamera.y + (target.y - startCamera.y) * eased,
				});
				cameraRef.current = next;
				publishCamera(next);
				if (progress < 1) {
					glideFrameRef.current = requestAnimationFrame(tick);
				} else {
					glideFrameRef.current = null;
					flushCamera();
				}
			};

			glideFrameRef.current = requestAnimationFrame(tick);
		},
		[
			cancelActiveGlide,
			cancelPanMomentum,
			flushCamera,
			isModalOpen,
			publishCamera,
			revealSignposts,
		],
	);

	const pixiTiles = useMemo(
		() =>
			renderPlan.renderedRows.flatMap((row, rowIndex) =>
				row.tiles.map((tile, tileIndex) => ({
					key: tile.key,
					zOrder: wallTileZOrder(rowIndex, tile.layer, tileIndex),
					rowOffsetTop: row.offsetTop,
					x: tile.x,
					y: tile.y,
					width: tile.width,
					height: tile.height,
					photoId: tile.photoId,
					sourceWidth: tile.sourceWidth,
					sourceHeight: tile.sourceHeight,
					sourceMtimeMs: photosById.get(tile.photoId)?.mtimeMs,
				})),
			),
		[photosById, renderPlan.renderedRows],
	);

	return (
		<div
			className="wall-canvas"
			data-testid="wall-canvas"
			data-mounted-rows={renderPlan.mountedRowCount}
			data-total-rows={packed.rows.length}
			data-content-height={packed.contentHeight}
			data-world-width={worldWidth}
			data-packed-photo-count={packed.packedPhotoCount}
			data-camera-x={Math.round(camera.x)}
			data-camera-y={Math.round(camera.y)}
			data-render-x={Math.round(wrappedCameraX)}
			data-render-y={Math.round(wrappedCameraY)}
			data-dragging={dragActive ? "true" : "false"}
			data-layout-mode={groupedFoundation?.mode ?? "single"}
			data-active-album-area-count={activeAlbumAreaCount}
			data-dominant-album-key={dominantVisibleAlbumKey ?? ""}
			data-dominant-album-label={dominantVisibleAlbumLabel ?? ""}
			data-zoom={zoom.toFixed(2)}
			ref={containerRef}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={endDrag}
			onPointerCancel={endDrag}
		>
			<PixiWallSurface
				tiles={pixiTiles}
				viewportWidth={viewportWidth}
				viewportHeight={viewportHeight}
				worldWidth={worldWidth}
				worldHeight={packed.contentHeight}
				zoom={zoom}
				mediaSourceResolver={mediaSourceResolver}
			/>

			<WallZoomControls
				onZoomOut={() => changeZoom(1 / 1.25)}
				onZoomIn={() => changeZoom(1.25)}
			/>

			{/*
        Interaction bridge: Pixi owns the visible wall, while a
        transparent, zoom-synchronized DOM hit-target layer preserves
        stable hover/click semantics, focused-photo behavior, and
        browser-test hooks.
      */}
			<div
				className="wall-canvas__world wall-canvas__world--hit-targets"
				style={{
					height: packed.contentHeight,
					width: worldWidth,
					transform: `scale(${zoom})`,
					transformOrigin: "top left",
				}}
			>
				{renderPlan.renderedRows.map((row) => (
					<div
						key={row.key}
						className="wall-canvas__row"
						style={{
							transform: `translate3d(0, ${row.offsetTop}px, 0)`,
							height: row.height,
							width: worldWidth,
						}}
					>
						{row.tiles.map((tile) => (
							<WallCanvasTile
								key={tile.key}
								tile={tile}
								onPointerEnter={handleTilePointerEnter}
								onPointerMove={handleTilePointerMove}
								onPointerLeave={handleTilePointerLeave}
							/>
						))}
					</div>
				))}
			</div>

			{visibleSignposts.map((signpost) => (
				<button
					key={signpost.albumKey}
					type="button"
					className="wall-signpost"
					data-testid={`wall-signpost-${signpost.albumKey}`}
					data-edge={signpost.edge}
					style={signpostStyle(signpost)}
					onClick={() =>
						handleSignpostActivate(signpost.targetX, signpost.targetY)
					}
				>
					<span className="wall-signpost__arrow" aria-hidden="true">
						{signpost.arrow}
					</span>
					<span className="wall-signpost__label">{signpost.label}</span>
				</button>
			))}

			<WallHoverPopLayer
				preview={hoverPreview}
				mediaSourceResolver={mediaSourceResolver}
			/>
		</div>
	);
}

function WallCanvasTile(props: {
	tile: RenderedTileInstance;
	onPointerEnter?: (
		event: React.PointerEvent<HTMLDivElement>,
		photoId: string,
	) => void;
	onPointerMove?: (
		event: React.PointerEvent<HTMLDivElement>,
		photoId: string,
	) => void;
	onPointerLeave?: (
		photoId: string,
		event: React.PointerEvent<HTMLDivElement>,
	) => void;
}): JSX.Element {
	const { tile, onPointerEnter, onPointerMove, onPointerLeave } = props;
	// Latch the mount-time appearance decision so unrelated rerenders do
	// not strip the fade class before the initial opacity animation ends.
	const shouldFadeOnMountRef = useRef(tile.shouldFadeOnMount);

	return (
		<div
			className="wall-canvas__tile"
			data-testid="wall-photo-tile"
			data-photo-id={tile.photoId}
			data-album-key={tile.albumKey ?? undefined}
			data-appearance={shouldFadeOnMountRef.current ? "fresh" : "seen"}
			style={tileStyle(tile.x, tile.y, tile.width, tile.height, tile.layer)}
			onPointerEnter={(event) => onPointerEnter?.(event, tile.photoId)}
			onPointerMove={(event) => onPointerMove?.(event, tile.photoId)}
			onPointerLeave={(event) => onPointerLeave?.(tile.photoId, event)}
		/>
	);
}

/**
 * Build a tile style object that includes the per-tile translate
 * custom properties. Custom properties are not part of the standard
 * `CSSProperties` type, so the cast goes through `unknown` to keep
 * strict mode happy while still landing a valid style object at
 * runtime.
 */
function tileStyle(
	x: number,
	y: number,
	width: number,
	height: number,
	layer = 0,
): React.CSSProperties {
	return {
		width,
		height,
		...(layer > 0 ? { zIndex: layer } : {}),
		"--tile-x": `${x}px`,
		"--tile-y": `${y}px`,
	} as unknown as React.CSSProperties;
}

function signpostStyle(signpost: VisibleSignpost): React.CSSProperties {
	const style: Record<string, string | number> = {};
	if (signpost.edge === "left") {
		style.left = 16;
		style.top = signpost.top ?? 16;
	} else if (signpost.edge === "right") {
		style.right = 16;
		style.top = signpost.top ?? 16;
	} else if (signpost.edge === "top") {
		style.top = 16;
		style.left = signpost.left ?? 16;
	} else {
		style.bottom = 16;
		style.left = signpost.left ?? 16;
	}
	return style as React.CSSProperties;
}


function supportsFinePointerHover(): boolean {
	if (
		typeof window === "undefined" ||
		typeof window.matchMedia !== "function"
	) {
		return false;
	}
	return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
