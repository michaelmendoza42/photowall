import {
	mediaResourcePath,
	type MediaVariant,
} from "../../../../../shared/api/media.js";
import type { PhotoQueryRecord } from "../../../../../shared/api/photos.js";
import type { WallMediaSourceResolver } from "../../wall/mediaSourceResolver.js";
import {
	isMosaicLabSyntheticPhotoId,
	type MosaicLabSyntheticPhotoMetadata,
	type MosaicLabSyntheticPhotoRecord,
} from "./syntheticPhotos.js";

const VARIANT_LABELS: Record<MediaVariant, string> = {
	thumb: "Thumb",
	wall: "Wall",
	modal: "Modal",
};

function escapeSvgText(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function createSyntheticMediaSvg(input: {
	photo: Pick<PhotoQueryRecord, "width" | "height">;
	metadata: MosaicLabSyntheticPhotoMetadata;
	variant: MediaVariant;
}): string {
	const { photo, metadata, variant } = input;
	const width = Math.max(1, photo.width);
	const height = Math.max(1, photo.height);
	const label = escapeSvgText(metadata.placeholder.label);
	const albumName = escapeSvgText(metadata.albumName);
	const variantLabel = escapeSvgText(VARIANT_LABELS[variant]);
	const aspectLabel = escapeSvgText(`${photo.width} × ${photo.height}`);
	const bandLabel = escapeSvgText(metadata.aspectBandKey);

	return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}">
  <defs>
    <linearGradient id="lab-gradient" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${metadata.placeholder.backgroundColor}" />
      <stop offset="100%" stop-color="${metadata.placeholder.accentColor}" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#lab-gradient)" />
  <rect x="3%" y="4%" width="94%" height="92%" rx="28" ry="28" fill="rgba(20,17,15,0.14)" stroke="rgba(255,255,255,0.22)" stroke-width="10" />
  <g fill="${metadata.placeholder.textColor}" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">
    <text x="7%" y="14%" font-size="${Math.max(54, width * 0.034)}" font-weight="700" letter-spacing="0.04em">${variantLabel}</text>
    <text x="7%" y="26%" font-size="${Math.max(68, width * 0.05)}" font-weight="700">${label}</text>
    <text x="7%" y="35%" font-size="${Math.max(38, width * 0.024)}" opacity="0.94">${albumName}</text>
    <text x="7%" y="84%" font-size="${Math.max(34, width * 0.021)}" opacity="0.9">${bandLabel}</text>
    <text x="7%" y="91%" font-size="${Math.max(32, width * 0.019)}" opacity="0.8">${aspectLabel}</text>
  </g>
</svg>`.trim();
}

export function buildMosaicLabSyntheticMediaDataUrl(input: {
	photo: Pick<PhotoQueryRecord, "width" | "height">;
	metadata: MosaicLabSyntheticPhotoMetadata;
	variant: MediaVariant;
}): string {
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
		createSyntheticMediaSvg(input),
	)}`;
}

export function createMosaicLabSyntheticMediaSourceResolver(
	records: readonly MosaicLabSyntheticPhotoRecord[],
): WallMediaSourceResolver {
	const recordsById = new Map(
		records.map((record) => [record.photo.id, record]),
	);

	return ({ photo, variant }) => {
		const record = recordsById.get(photo.id);
		if (record) {
			return buildMosaicLabSyntheticMediaDataUrl({
				photo: record.photo,
				metadata: record.metadata,
				variant,
			});
		}

		if (isMosaicLabSyntheticPhotoId(photo.id)) {
			let aspectBandKey: MosaicLabSyntheticPhotoMetadata["aspectBandKey"];
			if (photo.width === photo.height) {
				aspectBandKey = "square";
			} else if (photo.width > photo.height) {
				aspectBandKey = "landscape-standard";
			} else {
				aspectBandKey = "portrait-standard";
			}

			return buildMosaicLabSyntheticMediaDataUrl({
				photo,
				metadata: {
					albumId: "synthetic-fallback",
					albumName: "Synthetic fallback",
					presetKey: "mixed-vacation",
					generationSeed: "synthetic-fallback",
					sequenceNumber: 0,
					orientation: photo.width >= photo.height ? "landscape" : "portrait",
					aspectBandKey,
					seedFragment: "fallback",
					placeholder: {
						label: "Synthetic placeholder",
						hue: 32,
						backgroundColor: "hsl(32 34% 34%)",
						accentColor: "hsl(41 62% 56%)",
						textColor: "hsl(36 40% 96%)",
					},
				},
				variant,
			});
		}

		return mediaResourcePath(photo.id, variant);
	};
}
