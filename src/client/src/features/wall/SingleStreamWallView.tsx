import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	DEFAULT_MAX_ROW_HEIGHT,
	DEFAULT_MOSAIC_COLUMN_FACTORS,
} from "./worldWidth.js";
import { shouldLoadNextPage } from "./dynamicLoading.js";
import {
	collectFirstAppearancePhotoIds,
	rememberSeenPhotoIds,
} from "./appearanceTracking.js";
import { computeHoverPopRect } from "./hoverPreview.js";
import { WallHoverPop } from "./WallHoverPop.js";
import { useHoverCursorPan } from "./useHoverCursorPan.js";
import { PixiWallSurface } from "./PixiWallSurface.js";
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
	DRAG_THRESHOLD_PX,
	hasCrossedThreshold,
	type DragOrigin,
} from "./dragGesture.js";
import {
	buildSingleStreamLayout,
	projectSingleStreamSceneModel,
	type SingleStreamSceneRow,
	type SingleStreamSceneTile,
} from "./singleStreamSceneModel.js";
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
	type CameraState,
} from "../../state/camera.js";
import type { WallDragState, WallStats } from "./WallCanvas.js";

/** How close the bottom edge must get to the frontier before we fetch. */
const FRONTIER_THRESHOLD_PX = 800;

export interface SingleStreamWallViewProps {
	photos: readonly PhotoQueryRecord[];
	worldWidth: number;
	hasNextPage: boolean;
	isFetchingNextPage: boolean;
	onLoadMore: () => void;
	overscan?: LayoutOverscan;
	onStatsChange?: (stats: WallStats) => void;
	camera: CameraState;
	onCameraChange: (next: CameraState) => void;
	onDragStateChange?: (state: WallDragState) => void;
	activeAlbumAreaCount?: number;
	onPhotoOpen?: (photo: PhotoQueryRecord) => void;
	isModalOpen?: boolean;
	dragThresholdPx?: number;
	mediaSourceResolver?: WallMediaSourceResolver;
}

interface ActiveDrag {
	pointerId: number;
	pointerType: string;
	origin: DragOrigin;
	lastX: number;
	lastY: number;
	crossedThreshold: boolean;
	momentum: DragMomentumSample;
}

interface HoverPreviewState {
	photo: PhotoQueryRecord;
	left: number;
	top: number;
	width: number;
	height: number;
}

interface RenderedTileInstance extends SingleStreamSceneTile {
	shouldFadeOnMount: boolean;
}

interface RenderedRowInstance extends Omit<SingleStreamSceneRow, "tiles"> {
	tiles: RenderedTileInstance[];
}

export function SingleStreamWallView(
	props: SingleStreamWallViewProps,
): JSX.Element {
	const {
		photos,
		worldWidth,
		hasNextPage,
		isFetchingNextPage,
		onLoadMore,
		overscan = DEFAULT_OVERSCAN,
		onStatsChange,
		camera,
		onCameraChange,
		onDragStateChange,
		activeAlbumAreaCount = 1,
		onPhotoOpen,
		isModalOpen = false,
		dragThresholdPx = DRAG_THRESHOLD_PX,
		mediaSourceResolver,
	} = props;

	const containerRef = useRef<HTMLDivElement | null>(null);
	const dragRef = useRef<ActiveDrag | null>(null);
	const pressedPhotoIdRef = useRef<string | null>(null);
	const seenPhotoIdsRef = useRef<Set<string>>(new Set());


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

	const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
	const [dragActive, setDragActive] = useState(false);
	const [hoverPreview, setHoverPreview] = useState<HoverPreviewState | null>(
		null,
	);
	const [zoom, setZoom] = useState(1);

	const zoomRef = useRef(zoom);
	useEffect(() => {
		zoomRef.current = zoom;
	}, [zoom]);

	const hoverPreviewRef = useRef<HoverPreviewState | null>(null);
	hoverPreviewRef.current = hoverPreview;
	const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
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
			dragRef.current || isPanMomentumActive() || isHoverPanActive()
				? withWorldBounds(withViewport(live, camera.viewport), camera.world)
				: camera;
	}, [camera, isHoverPanActive, isPanMomentumActive, isPublishedCamera]);
	const handlePinchStart = useCallback(() => {
		cancelPanMomentum();
		const drag = dragRef.current;
		if (!drag) return;
		drag.crossedThreshold = true;
		drag.momentum = createDragMomentumSample(performance.now());
		pressedPhotoIdRef.current = null;
		setHoverPreview(null);
	}, [cancelPanMomentum]);
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

	const photosById = useMemo(() => {
		const map = new Map<string, PhotoQueryRecord>();
		for (const photo of photos) map.set(photo.id, photo);
		return map;
	}, [photos]);

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

	const packedLayout = useMemo(
		() =>
			buildSingleStreamLayout({
				photos,
				hasMore: hasNextPage,
				worldWidth,
				maxRowHeight: DEFAULT_MAX_ROW_HEIGHT,
				columnWidthFactors: DEFAULT_MOSAIC_COLUMN_FACTORS,
			}),
		[photos, hasNextPage, worldWidth],
	);

	const sceneModel = useMemo(
		() =>
			projectSingleStreamSceneModel({
				packed: packedLayout,
				worldWidth,
				cameraX: camera.x,
				cameraY: camera.y,
				zoom,
				viewportWidth: viewportSize.width,
				viewportHeight: viewportSize.height,
				overscan,
			}),
		[
			packedLayout,
			worldWidth,
			camera.x,
			camera.y,
			zoom,
			viewportSize.width,
			viewportSize.height,
			overscan,
		],
	);

	const renderPlan = useMemo(() => {
		const visiblePhotoIds = sceneModel.renderedRows.flatMap((row) =>
			row.tiles.map((tile) => tile.photoId),
		);
		const firstAppearanceIds = collectFirstAppearancePhotoIds(
			visiblePhotoIds,
			seenPhotoIdsRef.current,
		);
		const firstAppearanceIdSet = new Set(firstAppearanceIds);

		const renderedRows: RenderedRowInstance[] = sceneModel.renderedRows.map(
			(row) => ({
				...row,
				tiles: row.tiles.map((tile) => ({
					...tile,
					shouldFadeOnMount: firstAppearanceIdSet.has(tile.photoId),
				})),
			}),
		);

		return {
			renderedRows,
			firstAppearanceIds,
		};
	}, [sceneModel.renderedRows]);

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
			cancelPanMomentum();
		}
	}, [dragActive, isModalOpen, cancelPanMomentum]);

	useEffect(() => {
		if (
			shouldLoadNextPage({
				travelY: camera.y,
				viewportHeight: sceneModel.effectiveViewportHeight,
				contentHeight: sceneModel.packed.contentHeight,
				thresholdPx: FRONTIER_THRESHOLD_PX,
				isFetchingNext: isFetchingNextPage,
				hasNextPage,
			})
		) {
			onLoadMore();
		}
	}, [
		camera.y,
		sceneModel.effectiveViewportHeight,
		sceneModel.packed.contentHeight,
		isFetchingNextPage,
		hasNextPage,
		onLoadMore,
	]);

	useEffect(() => {
		if (!onStatsChange) return;
		onStatsChange({
			totalRows: sceneModel.packed.rows.length,
			mountedRows: sceneModel.mountedRowCount,
			visibleStart: sceneModel.visibleStart,
			visibleEnd: sceneModel.visibleEnd,
			scrollTop: camera.y,
			contentHeight: sceneModel.packed.contentHeight,
			worldWidth,
			packedPhotoCount: sceneModel.packed.packedPhotoCount,
		});
	}, [
		onStatsChange,
		sceneModel.packed.rows.length,
		sceneModel.mountedRowCount,
		sceneModel.visibleStart,
		sceneModel.visibleEnd,
		sceneModel.packed.contentHeight,
		sceneModel.packed.packedPhotoCount,
		camera.y,
		worldWidth,
	]);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return undefined;
		const onWheel = (event: WheelEvent): void => {
			event.preventDefault();
			cancelPanMomentum();
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
				cameraRef.current = next;
				publishCamera(next);
				startWheelMomentum(panDelta);
			}
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	}, [applyZoom, cancelPanMomentum, publishCamera, startWheelMomentum]);

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
			if (!event.isPrimary) return;
			if (event.button !== 0 && event.pointerType === "mouse") return;
			if (dragRef.current) return;

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
		[cancelPanMomentum],
	);

	const handlePointerMove = useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			const drag = dragRef.current;
			if (!drag || drag.pointerId !== event.pointerId) {
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

			const dx = event.clientX - drag.lastX;
			const dy = event.clientY - drag.lastY;
			drag.lastX = event.clientX;
			drag.lastY = event.clientY;

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
		[dragThresholdPx, publishCamera],
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

	const updateHoverPreview = useCallback(
		(tileEl: HTMLDivElement, photoId: string) => {
			if (!supportsFinePointerHover()) return;
			if (
				dragRef.current ||
				isModalOpen ||
				viewportSize.width <= 0 ||
				viewportSize.height <= 0
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
		[scheduleHoverPan, isModalOpen, photosById, viewportSize.height, viewportSize.width],
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

	return (
		<div
			className="wall-canvas"
			data-testid="wall-canvas"
			data-mounted-rows={sceneModel.mountedRowCount}
			data-total-rows={sceneModel.packed.rows.length}
			data-content-height={sceneModel.packed.contentHeight}
			data-world-width={worldWidth}
			data-camera-x={Math.round(camera.x)}
			data-camera-y={Math.round(camera.y)}
			data-render-x={Math.round(sceneModel.wrappedCameraX)}
			data-render-y={Math.round(sceneModel.wrappedCameraY)}
			data-render-window-row-copies={sceneModel.renderedRows.length}
			data-render-window-segments={sceneModel.verticalSegmentCount}
			data-render-window-x-copies={sceneModel.horizontalCopyCount}
			data-rendered-tiles={sceneModel.renderedTileCount}
			data-dragging={dragActive ? "true" : "false"}
			data-layout-mode="single"
			data-active-album-area-count={activeAlbumAreaCount}
			data-zoom={zoom.toFixed(2)}
			ref={containerRef}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={endDrag}
			onPointerCancel={endDrag}
		>
			<PixiWallSurface
				tiles={sceneModel.pixiTiles.map((tile) => ({
					...tile,
					sourceMtimeMs: photosById.get(tile.photoId)?.mtimeMs,
				}))}
				viewportWidth={viewportSize.width}
				viewportHeight={viewportSize.height}
				worldWidth={worldWidth}
				worldHeight={sceneModel.packed.contentHeight}
				zoom={zoom}
				mediaSourceResolver={mediaSourceResolver}
			/>

			<WallZoomControls
				onZoomOut={() => changeZoom(1 / 1.25)}
				onZoomIn={() => changeZoom(1.25)}
			/>

			<div
				className="wall-canvas__world wall-canvas__world--hit-targets"
				style={{
					height: sceneModel.packed.contentHeight,
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
							<V2WallTile
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

			{hoverPreview && (
				<WallHoverPop
					preview={hoverPreview}
					mediaSourceResolver={mediaSourceResolver}
				/>
			)}
		</div>
	);
}

function V2WallTile(props: {
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
	const shouldFadeOnMountRef = useRef(tile.shouldFadeOnMount);

	return (
		<div
			className="wall-canvas__tile"
			data-testid="wall-photo-tile"
			data-photo-id={tile.photoId}
			data-appearance={shouldFadeOnMountRef.current ? "fresh" : "seen"}
			style={tileStyle(tile.x, tile.y, tile.width, tile.height)}
			onPointerEnter={(event) => onPointerEnter?.(event, tile.photoId)}
			onPointerMove={(event) => onPointerMove?.(event, tile.photoId)}
			onPointerLeave={(event) => onPointerLeave?.(tile.photoId, event)}
		/>
	);
}

function tileStyle(
	x: number,
	y: number,
	width: number,
	height: number,
): React.CSSProperties {
	return {
		width,
		height,
		"--tile-x": `${x}px`,
		"--tile-y": `${y}px`,
	} as unknown as React.CSSProperties;
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
