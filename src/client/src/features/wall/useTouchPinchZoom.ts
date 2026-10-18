import { useEffect, type MutableRefObject, type RefObject } from "react";
import { pinchZoom, type ScreenPoint } from "./zoomInput.js";

export function useTouchPinchZoom(
	containerRef: RefObject<HTMLElement>,
	zoomRef: MutableRefObject<number>,
	/**
	 * Applies the new zoom, pivoting on the pinch midpoint: `before` and
	 * `after` are the midpoint (container px) on the previous and current move.
	 */
	applyZoom: (zoom: number, before: ScreenPoint, after: ScreenPoint) => void,
	onPinchStart?: () => void,
): void {
	useEffect(() => {
		const element = containerRef.current;
		if (!element) return undefined;
		let previousDistance: number | null = null;
		let previousMidpoint: ScreenPoint | null = null;
		const midpoint = (touches: TouchList): ScreenPoint => {
			const rect = element.getBoundingClientRect();
			const first = touches[0]!;
			const second = touches[1]!;
			return {
				x: (first.clientX + second.clientX) / 2 - rect.left,
				y: (first.clientY + second.clientY) / 2 - rect.top,
			};
		};
		const distance = (touches: TouchList): number => {
			const first = touches[0]!;
			const second = touches[1]!;
			return Math.hypot(
				second.clientX - first.clientX,
				second.clientY - first.clientY,
			);
		};
		const onTouchMove = (event: TouchEvent): void => {
			if (event.touches.length !== 2) return;
			event.preventDefault();
			const nextDistance = distance(event.touches);
			const nextMidpoint = midpoint(event.touches);
			if (previousDistance === null) {
				onPinchStart?.();
			}
			if (previousDistance && previousMidpoint && nextDistance > 0) {
				const nextZoom = pinchZoom(
					zoomRef.current,
					nextDistance / previousDistance,
				);
				applyZoom(nextZoom, previousMidpoint, nextMidpoint);
			}
			previousDistance = nextDistance;
			previousMidpoint = nextMidpoint;
		};
		const reset = (): void => {
			previousDistance = null;
			previousMidpoint = null;
		};
		element.addEventListener("touchmove", onTouchMove, { passive: false });
		element.addEventListener("touchend", reset);
		element.addEventListener("touchcancel", reset);
		return () => {
			element.removeEventListener("touchmove", onTouchMove);
			element.removeEventListener("touchend", reset);
			element.removeEventListener("touchcancel", reset);
		};
	}, [applyZoom, containerRef, onPinchStart, zoomRef]);
}
