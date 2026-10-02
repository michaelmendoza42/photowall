import type { CameraDelta } from "../../state/camera.js";

const FRAME_MS = 1000 / 60;
const RELEASE_FRESHNESS_MS = 160;
const RECENT_SAMPLE_WEIGHT = 0.65;
const MAX_MOMENTUM_FRAME_DELTA = 4;
// Screen px/ms²: a 0.1 px/ms drag stops in 40ms; a 1 px/ms flick in 400ms.
const DRAG_DECELERATION = 0.0025;
const SUSPENDED_FRAME_MS = 250;

export interface MomentumStep {
	cameraDelta: CameraDelta;
	velocity: CameraDelta;
}

export interface DragMomentumSample extends CameraDelta {
	lastMoveAt: number;
	hasVelocity: boolean;
}

export function createDragMomentumSample(
	startedAt: number,
): DragMomentumSample {
	return { dx: 0, dy: 0, lastMoveAt: startedAt, hasVelocity: false };
}

/** Normalize recent camera movement to one animation frame and smooth jitter. */
export function sampleDragMomentum(
	previous: DragMomentumSample,
	cameraDelta: CameraDelta,
	movedAt: number,
): DragMomentumSample {
	const elapsed = movedAt - previous.lastMoveAt;
	if (elapsed <= 0) return previous;
	const frameScale = FRAME_MS / elapsed;
	const frameVelocity = {
		dx: cameraDelta.dx * frameScale,
		dy: cameraDelta.dy * frameScale,
	};

	if (!previous.hasVelocity || elapsed > RELEASE_FRESHNESS_MS) {
		return { ...frameVelocity, lastMoveAt: movedAt, hasVelocity: true };
	}

	return {
		dx:
			previous.dx * (1 - RECENT_SAMPLE_WEIGHT) +
			frameVelocity.dx * RECENT_SAMPLE_WEIGHT,
		dy:
			previous.dy * (1 - RECENT_SAMPLE_WEIGHT) +
			frameVelocity.dy * RECENT_SAMPLE_WEIGHT,
		lastMoveAt: movedAt,
		hasVelocity: true,
	};
}

/** A paused pointer release must not fling the wall using stale velocity. */
export function dragMomentumAtRelease(
	sample: DragMomentumSample,
	releasedAt: number,
): CameraDelta | null {
	if (
		!sample.hasVelocity ||
		releasedAt < sample.lastMoveAt ||
		releasedAt - sample.lastMoveAt > RELEASE_FRESHNESS_MS
	) {
		return null;
	}
	return { dx: sample.dx, dy: sample.dy };
}

/**
 * Touch uses constant screen-space deceleration, not the wheel's exponential
 * tail. Integrating up to the exact stopping time avoids low-speed drift and
 * makes distance independent of RAF cadence and camera zoom.
 */
export function advanceDragMomentum(
	velocity: CameraDelta,
	elapsedMs: number,
	zoom: number,
): MomentumStep {
	const speed = Math.hypot(velocity.dx, velocity.dy);
	if (speed === 0 || elapsedMs > SUSPENDED_FRAME_MS) {
		return { cameraDelta: { dx: 0, dy: 0 }, velocity: { dx: 0, dy: 0 } };
	}
	const deceleration = DRAG_DECELERATION * FRAME_MS ** 2 / zoom;
	const frames = Math.min(Math.max(0, elapsedMs / FRAME_MS), speed / deceleration);
	const nextSpeed = Math.max(0, speed - deceleration * frames);
	const distance = (speed + nextSpeed) * frames / 2;
	return {
		cameraDelta: { dx: velocity.dx / speed * distance, dy: velocity.dy / speed * distance },
		velocity: nextSpeed === 0 ? { dx: 0, dy: 0 } : {
			dx: velocity.dx / speed * nextSpeed,
			dy: velocity.dy / speed * nextSpeed,
		},
	};
}

/** Existing wheel-tail profile; cap delayed frames to avoid large jumps. */
export function advanceMomentum(
	velocity: CameraDelta,
	elapsedMs: number,
	decayPerFrame: number,
): MomentumStep {
	const frameDelta = Math.max(
		0,
		Math.min(MAX_MOMENTUM_FRAME_DELTA, elapsedMs / FRAME_MS),
	);
	return {
		cameraDelta: {
			dx: velocity.dx * frameDelta,
			dy: velocity.dy * frameDelta,
		},
		velocity: {
			dx: velocity.dx * Math.pow(decayPerFrame, frameDelta),
			dy: velocity.dy * Math.pow(decayPerFrame, frameDelta),
		},
	};
}
