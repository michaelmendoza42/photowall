import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import { panBy, panTo, type CameraState } from "../../state/camera.js";
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
			let travelled = 0;
			const tick = (now: number): void => {
				const progress = Math.min(1, (now - startedAt) / durationMs);
				const eased = easeOutCubic(progress);
				// Move by this frame's share from the live camera, so anything
				// else that shifts it mid-glide (bounds updates, the wall
				// re-laying out under the viewer) sticks.
				const share = eased - travelled;
				travelled = eased;
				const next = panBy(cameraRef.current, {
					dx: (target.x - start.x) * share,
					dy: (target.y - start.y) * share,
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
