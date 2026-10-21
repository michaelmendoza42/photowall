import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import { panTo, type CameraState } from "../../state/camera.js";
import { easeOutCubic } from "./signpostNavigation.js";

/** How long a focus step takes to glide the wall to the new photo. */
export const FOCUS_GLIDE_MS = 360;

/**
 * Eased camera glide to an absolute travel offset. A new glide starts from
 * wherever the camera is now, so rapid steps chain smoothly. Reduced-motion
 * preference jumps straight to the target.
 */
export function useCameraGlide(input: {
	cameraRef: MutableRefObject<CameraState>;
	publishCamera: (next: CameraState) => void;
	flushCamera: () => void;
	durationMs?: number;
}): {
	glideTo: (target: { x: number; y: number }) => void;
	cancel: () => void;
	isActive: () => boolean;
} {
	const { cameraRef, publishCamera, flushCamera, durationMs = FOCUS_GLIDE_MS } =
		input;
	const frameRef = useRef<number | null>(null);

	const cancel = useCallback(() => {
		if (frameRef.current === null) return;
		cancelAnimationFrame(frameRef.current);
		frameRef.current = null;
		flushCamera();
	}, [flushCamera]);

	const glideTo = useCallback(
		(target: { x: number; y: number }) => {
			cancel();
			const start = cameraRef.current;
			if (prefersReducedMotion() || durationMs <= 0) {
				const next = panTo(start, target);
				cameraRef.current = next;
				publishCamera(next);
				flushCamera();
				return;
			}
			const startedAt = performance.now();
			const tick = (now: number): void => {
				const progress = Math.min(1, (now - startedAt) / durationMs);
				const eased = easeOutCubic(progress);
				// Rebase on the live camera so bounds updates mid-glide stick.
				const next = panTo(cameraRef.current, {
					x: start.x + (target.x - start.x) * eased,
					y: start.y + (target.y - start.y) * eased,
				});
				cameraRef.current = next;
				publishCamera(next);
				if (progress < 1) {
					frameRef.current = requestAnimationFrame(tick);
				} else {
					frameRef.current = null;
					flushCamera();
				}
			};
			frameRef.current = requestAnimationFrame(tick);
		},
		[cameraRef, cancel, durationMs, flushCamera, publishCamera],
	);

	useEffect(() => cancel, [cancel]);

	const isActive = useCallback(() => frameRef.current !== null, []);

	return { glideTo, cancel, isActive };
}

function prefersReducedMotion(): boolean {
	return (
		typeof window.matchMedia === "function" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches
	);
}
