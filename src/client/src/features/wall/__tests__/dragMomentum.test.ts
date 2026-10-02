import { describe, expect, it } from "vitest";
import {
	advanceMomentum,
	advanceDragMomentum,
	createDragMomentumSample,
	dragMomentumAtRelease,
	sampleDragMomentum,
} from "../dragMomentum.js";

describe("drag momentum sampling", () => {
	it("normalizes recent camera movement to one animation frame", () => {
		const sample = sampleDragMomentum(
			createDragMomentumSample(100),
			{ dx: 24, dy: -12 },
			120,
		);

		expect(sample.dx).toBeCloseTo(20);
		expect(sample.dy).toBeCloseTo(-10);
		expect(dragMomentumAtRelease(sample, 150)).toEqual({
			dx: sample.dx,
			dy: sample.dy,
		});
	});

	it("drops stale velocity after the pointer pauses before release", () => {
		const sample = sampleDragMomentum(
			createDragMomentumSample(100),
			{ dx: 24, dy: 0 },
			120,
		);

		expect(dragMomentumAtRelease(sample, 281)).toBeNull();
	});

	it("does not create momentum before an applied drag sample exists", () => {
		expect(
			dragMomentumAtRelease(createDragMomentumSample(100), 110),
		).toBeNull();
	});

	it("resets velocity after a pause instead of blending a stale fast swipe", () => {
		const fast = sampleDragMomentum(createDragMomentumSample(0), { dx: 30, dy: 0 }, 20);
		const resumed = sampleDragMomentum(fast, { dx: 1, dy: 0 }, 500);
		expect(resumed.dx).toBeCloseTo((1000 / 60) / 480);
	});

	it("does not turn duplicate timestamps into velocity spikes", () => {
		const previous = sampleDragMomentum(createDragMomentumSample(0), { dx: 10, dy: 0 }, 20);
		expect(sampleDragMomentum(previous, { dx: 10, dy: 0 }, 20)).toEqual(previous);
		expect(dragMomentumAtRelease(previous, 19)).toBeNull();
	});

	it("advances a wheel tail using its existing elapsed-time profile", () => {
		const step = advanceMomentum({ dx: 12, dy: -6 }, 1000 / 30, 0.86);

		expect(step.cameraDelta).toEqual({ dx: 24, dy: -12 });
		expect(step.velocity.dx).toBeCloseTo(12 * 0.86 ** 2);
		expect(step.velocity.dy).toBeCloseTo(-6 * 0.86 ** 2);
	});

	it("bounds a delayed animation frame so a backgrounded tab cannot jump", () => {
		const step = advanceMomentum({ dx: 12, dy: 0 }, 1_000, 0.86);

		expect(step.cameraDelta.dx).toBeCloseTo(48);
		expect(step.velocity.dx).toBeCloseTo(12 * 0.86 ** 4);
	});
});

// Units entering/leaving the shared animator are world pixels per 60Hz frame.
describe("touch fling deceleration", () => {
	const frameMs = 1000 / 60;
	const run = (speed: number, frames: number[], zoom = 1) => {
		let velocity = { dx: speed * frameMs / zoom, dy: 0 };
		let distance = 0;
		for (const elapsed of frames) {
			const step = advanceDragMomentum(velocity, elapsed, zoom);
			distance += step.cameraDelta.dx * zoom;
			velocity = step.velocity;
		}
		return { distance, speed: velocity.dx * zoom / frameMs };
	};

	it("stops slow drags promptly while fast flicks coast substantially farther", () => {
		const frames = Array(120).fill(frameMs) as number[];
		const slow = run(0.1, frames);
		const fast = run(1, frames);
		expect(slow.distance).toBeLessThan(5);
		expect(fast.distance).toBeGreaterThan(150);
		expect(fast.distance).toBeGreaterThan(slow.distance * 20);
		expect(slow.speed).toBe(0);
		expect(fast.speed).toBe(0);
	});

	it("integrates the same trajectory at 30, 60 and 120Hz, including a dropped frame", () => {
		const expected = run(1, Array(12).fill(frameMs) as number[]);
		for (const frames of [Array(6).fill(1000 / 30), Array(24).fill(1000 / 120), [100, 50, 50]]) {
			const actual = run(1, frames as number[]);
			expect(actual.distance).toBeCloseTo(expected.distance, 8);
			expect(actual.speed).toBeCloseTo(expected.speed, 8);
		}
	});

	it("preserves screen-space feel across zoom levels", () => {
		const frames = Array(60).fill(frameMs) as number[];
		const normal = run(1, frames);
		for (const zoom of [0.25, 0.5, 2, 4]) {
			expect(run(1, frames, zoom).distance).toBeCloseTo(normal.distance);
		}
	});

	it("decelerates diagonally without changing direction or overshooting zero", () => {
		const step = advanceDragMomentum({ dx: 6, dy: -8 }, 50, 1);
		expect(step.cameraDelta.dx / step.cameraDelta.dy).toBeCloseTo(-0.75);
		expect(step.velocity.dx / step.velocity.dy).toBeCloseTo(-0.75);
		const stop = advanceDragMomentum({ dx: 0.01, dy: 0 }, 50, 1);
		expect(stop.velocity).toEqual({ dx: 0, dy: 0 });
		expect(stop.cameraDelta.dx).toBeGreaterThan(0);
	});

	it("does not resume a fling after a suspended animation frame", () => {
		expect(advanceDragMomentum({ dx: 20, dy: 10 }, 1000, 1)).toEqual({
			cameraDelta: { dx: 0, dy: 0 }, velocity: { dx: 0, dy: 0 },
		});
	});
});
