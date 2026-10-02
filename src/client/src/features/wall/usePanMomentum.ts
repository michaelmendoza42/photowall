import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import {
	panBy,
	type CameraDelta,
	type CameraState,
} from "../../state/camera.js";
import { advanceDragMomentum, advanceMomentum } from "./dragMomentum.js";

/** Small residual motion added after direct wheel/trackpad pan input. */
export const WHEEL_MOMENTUM_STRENGTH = 0.08;
const WHEEL_MOMENTUM_DECAY_PER_FRAME = 0.78;
const MOMENTUM_MIN_SPEED = 0.12;
const MOMENTUM_MAX_INITIAL_SPEED = 32;

interface PanMomentumOptions {
	cameraRef: MutableRefObject<CameraState>;
	publishCamera: (next: CameraState) => void;
	flushCamera: () => void;
}

interface PanMomentum {
	startWheel: (delta: CameraDelta) => void;
	startDrag: (velocityPerFrame: CameraDelta, zoom: number) => void;
	cancel: () => void;
}

/**
 * Shares cancellation/publication for wheel tails and velocity-responsive touch
 * flings. Reduced-motion users receive only the direct two-axis input delta.
 */
export function usePanMomentum(options: PanMomentumOptions): PanMomentum {
	const { cameraRef, publishCamera, flushCamera } = options;
	const frameRef = useRef<number | null>(null);
	const velocityRef = useRef<CameraDelta>({ dx: 0, dy: 0 });

	const cancel = useCallback(() => {
		if (frameRef.current !== null) {
			cancelAnimationFrame(frameRef.current);
			frameRef.current = null;
		}
		velocityRef.current = { dx: 0, dy: 0 };
	}, []);

	const startMomentum = useCallback(
		(velocity: CameraDelta, source: "wheel" | "drag", zoom = 1) => {
			cancel();
			if (prefersReducedMotion()) return;

			// Touch caps total screen speed, preserving both direction and zoom feel.
			const dragScale = Math.min(1, MOMENTUM_MAX_INITIAL_SPEED / (Math.hypot(velocity.dx, velocity.dy) * zoom || 1));
			velocityRef.current = source === "drag" ? {
				dx: velocity.dx * dragScale, dy: velocity.dy * dragScale,
			} : {
				dx: clampMomentumSpeed(velocity.dx),
				dy: clampMomentumSpeed(velocity.dy),
			};
			let lastTickAt = performance.now();

			const tick = (now: number): void => {
				const step = source === "drag"
					? advanceDragMomentum(velocityRef.current, now - lastTickAt, zoom)
					: advanceMomentum(velocityRef.current, now - lastTickAt, WHEEL_MOMENTUM_DECAY_PER_FRAME);
				lastTickAt = now;
				const next = panBy(cameraRef.current, step.cameraDelta);
				cameraRef.current = next;
				publishCamera(next);
				velocityRef.current = step.velocity;

				const stopSpeed = source === "drag" ? 0 : MOMENTUM_MIN_SPEED;
				if (Math.hypot(step.velocity.dx, step.velocity.dy) <= stopSpeed) {
					frameRef.current = null;
					flushCamera();
					return;
				}
				frameRef.current = requestAnimationFrame(tick);
			};

			if (Math.hypot(velocityRef.current.dx, velocityRef.current.dy) > 0) {
				frameRef.current = requestAnimationFrame(tick);
			}
		},
		[cameraRef, cancel, flushCamera, publishCamera],
	);

	const startWheel = useCallback(
		(delta: CameraDelta) => {
			startMomentum(
				{
						dx: delta.dx * WHEEL_MOMENTUM_STRENGTH,
						dy: delta.dy * WHEEL_MOMENTUM_STRENGTH,
				},
				"wheel",
			);
		},
		[startMomentum],
	);

	const startDrag = useCallback(
		(velocityPerFrame: CameraDelta, zoom: number) => {
			startMomentum(velocityPerFrame, "drag", zoom);
		},
		[startMomentum],
	);

	useEffect(() => {
		const motionPreference = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		);
		const handlePreferenceChange = (event: MediaQueryListEvent): void => {
			if (event.matches) cancel();
		};
		motionPreference.addEventListener("change", handlePreferenceChange);
		return () => {
			motionPreference.removeEventListener("change", handlePreferenceChange);
			cancel();
		};
	}, [cancel]);

	return { startWheel, startDrag, cancel };
}

function prefersReducedMotion(): boolean {
	return (
		typeof window.matchMedia === "function" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches
	);
}

function clampMomentumSpeed(value: number): number {
	return Math.max(
		-MOMENTUM_MAX_INITIAL_SPEED,
		Math.min(MOMENTUM_MAX_INITIAL_SPEED, value),
	);
}
