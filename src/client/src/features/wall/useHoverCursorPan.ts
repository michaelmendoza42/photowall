import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import { panBy, type CameraState } from "../../state/camera.js";
import { computeHoverCursorPan, type PreviewRect } from "./hoverPreview.js";

/** Hover this long before sliding, so sweeping across the wall doesn't pan it. */
export const HOVER_PAN_DWELL_MS = 250;
/** A slow, eased slide that keeps the photo easy to follow. */
export const HOVER_PAN_MS = 700;

function easeInOutCubic(progress: number): number {
	return progress < 0.5
		? 4 * progress ** 3
		: 1 - (-2 * progress + 2) ** 3 / 2;
}

interface HoverCursorPanOptions {
	cameraRef: MutableRefObject<CameraState>;
	zoomRef: MutableRefObject<number>;
	publishCamera: (next: CameraState) => void;
	flushCamera: () => void;
	/** The hovered photo as drawn on the wall (viewport px), or null when nothing is hovered. */
	getHoverRect: () => PreviewRect | null;
	/** Last cursor position (viewport px). */
	getCursor: () => { x: number; y: number } | null;
	/** Moves the hover pop with the wall by this many screen px. */
	shiftHoverRect: (dx: number, dy: number) => void;
}

export interface HoverCursorPan {
	/** Start the dwell for a hovered photo, unless it already slid this hover. */
	schedule: (photoId: string) => void;
	/** Stop a pending or running slide; the photo may slide again on its next move. */
	cancel: () => void;
	/** Hover ended: stop and forget which photo already slid. */
	release: () => void;
	isActive: () => boolean;
}

/**
 * Desktop hover: after a short dwell, slowly slide the wall so a partly
 * off-screen hovered photo's center ends under the cursor (2026-10-17/18). Each photo slides once
 * per hover, so moving within it afterwards doesn't drag the wall along.
 */
export function useHoverCursorPan(options: HoverCursorPanOptions): HoverCursorPan {
	const optionsRef = useRef(options);
	optionsRef.current = options;
	const dwellRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const frameRef = useRef<number | null>(null);
	const targetRef = useRef<string | null>(null);
	const settledRef = useRef<string | null>(null);

	const cancel = useCallback(() => {
		if (dwellRef.current !== null) clearTimeout(dwellRef.current);
		dwellRef.current = null;
		if (frameRef.current !== null) {
			cancelAnimationFrame(frameRef.current);
			optionsRef.current.flushCamera();
		}
		frameRef.current = null;
		targetRef.current = null;
	}, []);

	const release = useCallback(() => {
		cancel();
		settledRef.current = null;
	}, [cancel]);

	const startPan = useCallback((photoId: string) => {
		dwellRef.current = null;
		settledRef.current = photoId;
		const { getHoverRect, getCursor, zoomRef } = optionsRef.current;
		const rect = getHoverRect();
		const cursor = getCursor();
		const pan =
			rect && cursor
				? computeHoverCursorPan(rect, cursor, {
						width: window.innerWidth,
						height: window.innerHeight,
					})
				: null;
		if (!pan) {
			targetRef.current = null;
			return;
		}

		const zoom = zoomRef.current;
		const startedAt = performance.now();
		let travelled = 0;
		const tick = (now: number): void => {
			const { cameraRef, publishCamera, flushCamera, shiftHoverRect } =
				optionsRef.current;
			const progress = Math.min(1, (now - startedAt) / HOVER_PAN_MS);
			const eased = easeInOutCubic(progress);
			const step = eased - travelled;
			travelled = eased;
			const next = panBy(cameraRef.current, {
				dx: (pan.dx * step) / zoom,
				dy: (pan.dy * step) / zoom,
			});
			cameraRef.current = next;
			publishCamera(next);
			// Flush so the wall and the pop move in the same frame.
			flushCamera();
			shiftHoverRect(-pan.dx * step, -pan.dy * step);
			if (progress < 1) {
				frameRef.current = requestAnimationFrame(tick);
			} else {
				frameRef.current = null;
				targetRef.current = null;
			}
		};
		frameRef.current = requestAnimationFrame(tick);
	}, []);

	const schedule = useCallback(
		(photoId: string) => {
			if (targetRef.current === photoId || settledRef.current === photoId) return;
			cancel();
			settledRef.current = null;
			if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
			targetRef.current = photoId;
			dwellRef.current = setTimeout(() => startPan(photoId), HOVER_PAN_DWELL_MS);
		},
		[cancel, startPan],
	);

	const isActive = useCallback(() => frameRef.current !== null, []);

	useEffect(() => release, [release]);

	return { schedule, cancel, release, isActive };
}
