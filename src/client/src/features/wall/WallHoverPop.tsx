import { useLayoutEffect, useRef, useState } from "react";
import type { PhotoQueryRecord } from "../../../../shared/api/photos.js";
import type { PreviewRect } from "./hoverPreview.js";
import {
	resolveWallMediaSource,
	type WallMediaSourceResolver,
} from "./mediaSourceResolver.js";
import { variantForDrawnSize, wallPixelRatio } from "./pixiScene.js";
import type { FeaturedFrame } from "../../../../shared/api/curation.js";
import { featuredPhotoRect } from "./featuredGeometry.js";
import { featuredFrameDataUrl } from "./featuredFrames.js";

export interface WallHoverPopState extends PreviewRect {
	photo: PhotoQueryRecord;
}

/**
 * The hovered photo lifted slightly above the wall with a drop shadow. The
 * thumbnail (already in the browser cache from the wall) shows at once; a
 * tier sharp enough for the popped size loads over it.
 */
/** Matches the `wall-hover-settle` keyframe duration in global.css. */
export const HOVER_SETTLE_MS = 140;
/** A clear followed this quickly by a new hover is a move to a neighbour. */
const HANDOFF_WINDOW_MS = 50;

/**
 * The live hover pop plus any photo settling back after the pointer moved
 * on to a neighbour. Each photo gets its own element so the pop-in plays
 * for every photo, not just the first. A pop cleared for any other reason
 * (wheel, drag, modal) vanishes at once: the wall is about to move and a
 * lingering pop would come loose from its tile. A photo already settling
 * finishes its short settle.
 */
export function WallHoverPopLayer(props: {
	preview: WallHoverPopState | null;
	mediaSourceResolver?: WallMediaSourceResolver;
	/** Hero tiles' frames, which they keep when popped. */
	featuredFrames?: ReadonlyMap<string, FeaturedFrame>;
}): JSX.Element {
	const { preview, mediaSourceResolver, featuredFrames } = props;
	const [settling, setSettling] = useState<WallHoverPopState[]>([]);
	const lastRef = useRef<WallHoverPopState | null>(null);
	// Moving straight onto a neighbour clears the hover (leave) and sets it
	// again (enter) in back-to-back events, so remember a just-cleared pop
	// briefly to recognise that hand-off.
	const clearedRef = useRef<{ pop: WallHoverPopState; at: number } | null>(
		null,
	);

	useLayoutEffect(() => {
		const last = lastRef.current;
		lastRef.current = preview;
		if (!preview) {
			clearedRef.current = last ? { pop: last, at: performance.now() } : null;
			return;
		}
		const cleared = clearedRef.current;
		clearedRef.current = null;
		const previous =
			last ??
			(cleared && performance.now() - cleared.at <= HANDOFF_WINDOW_MS
				? cleared.pop
				: null);
		if (!previous || previous.photo.id === preview.photo.id) return;
		if (prefersReducedMotion()) return;
		setSettling((prev) => [
			...prev.filter(
				(p) =>
					p.photo.id !== previous.photo.id && p.photo.id !== preview.photo.id,
			),
			previous,
		]);
		window.setTimeout(
			() => setSettling((prev) => prev.filter((p) => p !== previous)),
			HOVER_SETTLE_MS,
		);
	}, [preview]);

	return (
		<>
			{settling.map((p) => (
				<WallHoverPop
					key={`settle:${p.photo.id}`}
					preview={p}
					settling
					frame={featuredFrames?.get(p.photo.id)}
					mediaSourceResolver={mediaSourceResolver}
				/>
			))}
			{preview && (
				<WallHoverPop
					key={preview.photo.id}
					preview={preview}
					frame={featuredFrames?.get(preview.photo.id)}
					mediaSourceResolver={mediaSourceResolver}
				/>
			)}
		</>
	);
}

export function WallHoverPop(props: {
	preview: WallHoverPopState;
	settling?: boolean;
	/** A hero tile's frame: the pop shows the photo uncropped in it. */
	frame?: FeaturedFrame;
	mediaSourceResolver?: WallMediaSourceResolver;
}): JSX.Element {
	const { preview, settling = false, frame, mediaSourceResolver } = props;
	const { photo } = preview;
	const inner = frame
		? featuredPhotoRect({ x: 0, y: 0, width: preview.width, height: preview.height }, photo)
		: null;
	const variant = variantForDrawnSize(
		Math.max(inner?.width ?? preview.width, inner?.height ?? preview.height) *
			wallPixelRatio(),
		Math.max(photo.width, photo.height) || null,
	);
	const thumbSrc = resolveWallMediaSource(photo, "thumb", mediaSourceResolver);
	const className = [
		"wall-hover-preview",
		settling ? "wall-hover-preview--settling" : "",
		frame ? "wall-hover-preview--framed" : "",
	]
		.filter(Boolean)
		.join(" ");
	const image = (
		<img
			className="wall-hover-preview__img"
			data-testid="wall-hover-preview-image"
			data-media-variant={variant}
			src={resolveWallMediaSource(photo, variant, mediaSourceResolver)}
			alt=""
			draggable={false}
		/>
	);

	return (
		<div
			className={className}
			data-testid={settling ? "wall-hover-preview-settling" : "wall-hover-preview"}
			data-photo-id={photo.id}
			data-frame={frame}
			style={
				{
					width: preview.width,
					height: preview.height,
					"--hover-preview-left": `${preview.left}px`,
					"--hover-preview-top": `${preview.top}px`,
					backgroundImage: frame
						? `url("${featuredFrameDataUrl(frame, preview.width, preview.height, photo, 1600)}")`
						: `url("${thumbSrc}")`,
				} as unknown as React.CSSProperties
			}
		>
			{inner ? (
				<div
					className="wall-hover-preview__framed-photo"
					style={{
						left: inner.x,
						top: inner.y,
						width: inner.width,
						height: inner.height,
						backgroundImage: `url("${thumbSrc}")`,
					}}
				>
					{image}
				</div>
			) : (
				image
			)}
		</div>
	);
}

function prefersReducedMotion(): boolean {
	return (
		typeof window.matchMedia === "function" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches
	);
}
