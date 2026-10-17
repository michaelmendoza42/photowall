import { useEffect, type MutableRefObject, type RefObject } from "react";
import { pinchZoom } from "./zoomInput.js";

export function useTouchPinchZoom(
	containerRef: RefObject<HTMLElement>,
	zoomRef: MutableRefObject<number>,
	setZoom: (zoom: number) => void,
	onPinchStart?: () => void,
): void {
	useEffect(() => {
		const element = containerRef.current;
		if (!element) return undefined;
		let previousDistance: number | null = null;
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
			if (previousDistance === null) {
				onPinchStart?.();
			}
			if (previousDistance && nextDistance > 0) {
				const nextZoom = pinchZoom(
					zoomRef.current,
					nextDistance / previousDistance,
				);
				if (nextZoom !== zoomRef.current) {
					zoomRef.current = nextZoom;
					setZoom(nextZoom);
				}
			}
			previousDistance = nextDistance;
		};
		const reset = (): void => {
			previousDistance = null;
		};
		element.addEventListener("touchmove", onTouchMove, { passive: false });
		element.addEventListener("touchend", reset);
		element.addEventListener("touchcancel", reset);
		return () => {
			element.removeEventListener("touchmove", onTouchMove);
			element.removeEventListener("touchend", reset);
			element.removeEventListener("touchcancel", reset);
		};
	}, [containerRef, onPinchStart, setZoom, zoomRef]);
}
