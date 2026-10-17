import type { PhotoQueryRecord } from "../../../../shared/api/photos.js";
import type { PreviewRect } from "./hoverPreview.js";
import {
	resolveWallMediaSource,
	type WallMediaSourceResolver,
} from "./mediaSourceResolver.js";
import { variantForDrawnSize, wallPixelRatio } from "./pixiScene.js";

export interface WallHoverPopState extends PreviewRect {
	photo: PhotoQueryRecord;
}

/**
 * The hovered photo lifted slightly above the wall with a drop shadow. The
 * thumbnail (already in the browser cache from the wall) shows at once; a
 * tier sharp enough for the popped size loads over it.
 */
export function WallHoverPop(props: {
	preview: WallHoverPopState;
	mediaSourceResolver?: WallMediaSourceResolver;
}): JSX.Element {
	const { preview, mediaSourceResolver } = props;
	const { photo } = preview;
	const variant = variantForDrawnSize(
		Math.max(preview.width, preview.height) * wallPixelRatio(),
		Math.max(photo.width, photo.height) || null,
	);
	const thumbSrc = resolveWallMediaSource(photo, "thumb", mediaSourceResolver);

	return (
		<div
			className="wall-hover-preview"
			data-testid="wall-hover-preview"
			data-photo-id={photo.id}
			style={
				{
					width: preview.width,
					height: preview.height,
					"--hover-preview-left": `${preview.left}px`,
					"--hover-preview-top": `${preview.top}px`,
					backgroundImage: `url("${thumbSrc}")`,
				} as unknown as React.CSSProperties
			}
		>
			<img
				className="wall-hover-preview__img"
				data-testid="wall-hover-preview-image"
				data-media-variant={variant}
				src={resolveWallMediaSource(photo, variant, mediaSourceResolver)}
				alt=""
				draggable={false}
			/>
		</div>
	);
}
