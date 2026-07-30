import type { PhotoQueryRecord } from "../../../../../shared/api/photos.js";
import { hashStringToUint32, stableUnitInterval } from "../../wall/seeded.js";
import {
	getMosaicLabAspectProfile,
	type MosaicLabAspectBandDefinition,
	type MosaicLabAspectBandKey,
	type MosaicLabSampleAlbum,
	type MosaicLabSampleAlbumPresetKey,
	type MosaicLabSyntheticPhotoOrientation,
} from "./sampleAlbums.js";

export const MOSAIC_LAB_SYNTHETIC_PHOTO_ID_PREFIX = "lab";
export const DEFAULT_MOSAIC_LAB_SYNTHETIC_PHOTO_SEED =
	"mosaic-lab-synthetic-photo-v1";

export interface MosaicLabSyntheticPlaceholderMetadata {
	label: string;
	hue: number;
	backgroundColor: string;
	accentColor: string;
	textColor: string;
}

export interface MosaicLabSyntheticPhotoMetadata {
	albumId: string;
	albumName: string;
	presetKey: MosaicLabSampleAlbumPresetKey;
	generationSeed: string;
	sequenceNumber: number;
	orientation: MosaicLabSyntheticPhotoOrientation;
	aspectBandKey: MosaicLabAspectBandKey;
	seedFragment: string;
	placeholder: MosaicLabSyntheticPlaceholderMetadata;
}

export interface MosaicLabSyntheticPhotoRecord {
	photo: PhotoQueryRecord;
	metadata: MosaicLabSyntheticPhotoMetadata;
}

export interface MosaicLabSyntheticPhotoBundle {
	album: MosaicLabSampleAlbum;
	generationSeed: string;
	photos: readonly MosaicLabSyntheticPhotoRecord[];
}

interface WeightedAspectBand extends MosaicLabAspectBandDefinition {
	count: number;
}

function roundAspectRatio(value: number): number {
	return Math.round(value * 1000) / 1000;
}

function padIndex(index: number, total: number): string {
	const digits = Math.max(3, String(total).length);
	return String(index + 1).padStart(digits, "0");
}

function seedFragment(value: string): string {
	return hashStringToUint32(value).toString(16).padStart(8, "0").slice(0, 6);
}

function combineGenerationSeed(
	album: MosaicLabSampleAlbum,
	seed?: string,
): string {
	const globalSeed = seed ?? DEFAULT_MOSAIC_LAB_SYNTHETIC_PHOTO_SEED;
	return `${globalSeed}::${album.seed}`;
}

function allocateAspectBandCounts(
	album: MosaicLabSampleAlbum,
): WeightedAspectBand[] {
	const profile = getMosaicLabAspectProfile(album.aspectProfileKey);
	if (album.photoCount <= 0) {
		return profile.bands.map((band) => ({ ...band, count: 0 }));
	}

	const provisional = profile.bands.map((band) => {
		const exact = band.weight * album.photoCount;
		const count = Math.floor(exact);
		return {
			...band,
			count,
			remainder: exact - count,
		};
	});

	let remaining =
		album.photoCount - provisional.reduce((sum, band) => sum + band.count, 0);

	provisional
		.slice()
		.sort(
			(left, right) =>
				right.remainder - left.remainder || left.key.localeCompare(right.key),
		)
		.forEach((band) => {
			if (remaining <= 0) {
				return;
			}
			const target = provisional.find(
				(candidate) => candidate.key === band.key,
			);
			if (!target) {
				return;
			}
			target.count += 1;
			remaining -= 1;
		});

	return provisional.map(({ remainder: _remainder, ...band }) => band);
}

function createOrderedBandDrafts(
	album: MosaicLabSampleAlbum,
	generationSeed: string,
) {
	return allocateAspectBandCounts(album)
		.flatMap((band) =>
			Array.from({ length: band.count }, (_, occurrence) => ({
				band,
				occurrence,
			})),
		)
		.map((draft) => ({
			...draft,
			rank: hashStringToUint32(
				`${album.id}|${generationSeed}|${draft.band.key}|${draft.occurrence}`,
			),
		}))
		.sort((left, right) => {
			if (left.rank !== right.rank) {
				return left.rank - right.rank;
			}
			if (left.band.key !== right.band.key) {
				return left.band.key.localeCompare(right.band.key);
			}
			return left.occurrence - right.occurrence;
		});
}

function pickAspectRatio(
	band: MosaicLabAspectBandDefinition,
	generationSeed: string,
	photoKey: string,
): number {
	const unit = stableUnitInterval(`${generationSeed}|aspect`, photoKey);
	return roundAspectRatio(
		band.aspectRatioRange.min +
			(band.aspectRatioRange.max - band.aspectRatioRange.min) * unit,
	);
}

function pickLongEdge(
	band: MosaicLabAspectBandDefinition,
	generationSeed: string,
	photoKey: string,
): number {
	const unit = stableUnitInterval(`${generationSeed}|long-edge`, photoKey);
	return Math.round(
		band.longEdgeRange.min +
			(band.longEdgeRange.max - band.longEdgeRange.min) * unit,
	);
}

function createDimensions(
	band: MosaicLabAspectBandDefinition,
	aspectRatio: number,
	longEdge: number,
): Pick<PhotoQueryRecord, "width" | "height" | "aspectRatio"> {
	if (band.orientation === "square") {
		return {
			width: longEdge,
			height: longEdge,
			aspectRatio: 1,
		};
	}

	if (band.orientation === "landscape") {
		const width = longEdge;
		const height = Math.max(1, Math.round(width / aspectRatio));
		return {
			width,
			height,
			aspectRatio: roundAspectRatio(width / height),
		};
	}

	const height = longEdge;
	const width = Math.max(1, Math.round(height * aspectRatio));
	return {
		width,
		height,
		aspectRatio: roundAspectRatio(width / height),
	};
}

function pickDirectoryPath(
	album: MosaicLabSampleAlbum,
	generationSeed: string,
	sequenceNumber: number,
): string {
	if (album.subfolders.length === 0) {
		return album.rootDirectoryPath;
	}

	const rootBias = stableUnitInterval(
		`${generationSeed}|directory-root-bias`,
		`${album.id}:${sequenceNumber}`,
	);
	if (rootBias < 0.28) {
		return album.rootDirectoryPath;
	}

	const index = Math.min(
		album.subfolders.length - 1,
		Math.floor(
			stableUnitInterval(
				`${generationSeed}|directory-subfolder`,
				`${album.id}:${sequenceNumber}`,
			) * album.subfolders.length,
		),
	);
	const subfolder = album.subfolders[index] ?? album.subfolders[0]!;
	return `${album.rootDirectoryPath}/${subfolder}`;
}

function pickFileExtension(
	album: MosaicLabSampleAlbum,
	generationSeed: string,
	photoKey: string,
): string {
	const unit = stableUnitInterval(`${generationSeed}|extension`, photoKey);
	if (album.presetKey === "phone-weird-mix" && unit > 0.72) {
		return "heic";
	}
	return unit > 0.88 ? "jpeg" : "jpg";
}

function pickFileSize(
	width: number,
	height: number,
	generationSeed: string,
	photoKey: string,
): number {
	const compressionFactor =
		0.17 + stableUnitInterval(`${generationSeed}|file-size`, photoKey) * 0.14;
	return Math.max(32768, Math.round(width * height * compressionFactor));
}

function pickMtimeMs(
	album: MosaicLabSampleAlbum,
	generationSeed: string,
	photoKey: string,
): number {
	const month = Math.floor(
		stableUnitInterval(`${generationSeed}|month`, photoKey) * 12,
	);
	const day =
		1 + Math.floor(stableUnitInterval(`${generationSeed}|day`, photoKey) * 28);
	const hour = Math.floor(
		stableUnitInterval(`${generationSeed}|hour`, photoKey) * 24,
	);
	const minute = Math.floor(
		stableUnitInterval(`${generationSeed}|minute`, photoKey) * 60,
	);
	const second = Math.floor(
		stableUnitInterval(`${generationSeed}|second`, photoKey) * 60,
	);
	return Date.UTC(album.year, month, day, hour, minute, second);
}

function createPlaceholder(
	album: MosaicLabSampleAlbum,
	sequenceNumber: number,
	generationSeed: string,
	photoKey: string,
): MosaicLabSyntheticPlaceholderMetadata {
	const hue = Math.round(
		stableUnitInterval(`${generationSeed}|hue`, photoKey) * 359,
	);
	const saturation =
		52 +
		Math.round(
			stableUnitInterval(`${generationSeed}|saturation`, photoKey) * 18,
		);
	const lightness =
		42 +
		Math.round(
			stableUnitInterval(`${generationSeed}|lightness`, photoKey) * 18,
		);
	const accentHue =
		(hue +
			38 +
			Math.round(
				stableUnitInterval(`${generationSeed}|accent`, photoKey) * 60,
			)) %
		360;

	return {
		label: `${album.name} ${String(sequenceNumber).padStart(2, "0")}`,
		hue,
		backgroundColor: `hsl(${hue} ${saturation}% ${lightness}%)`,
		accentColor: `hsl(${accentHue} ${Math.min(90, saturation + 8)}% ${Math.min(76, lightness + 14)}%)`,
		textColor: `hsl(${(hue + 180) % 360} 18% 96%)`,
	};
}

function createSyntheticPhotoRecord(input: {
	album: MosaicLabSampleAlbum;
	generationSeed: string;
	band: MosaicLabAspectBandDefinition;
	sequenceNumber: number;
	occurrence: number;
}): MosaicLabSyntheticPhotoRecord {
	const { album, generationSeed, band, sequenceNumber, occurrence } = input;
	const sequenceLabel = padIndex(sequenceNumber - 1, album.photoCount);
	const photoKey = `${album.id}|${generationSeed}|${band.key}|${occurrence}|${sequenceNumber}`;
	const aspectRatio = pickAspectRatio(band, generationSeed, photoKey);
	const longEdge = pickLongEdge(band, generationSeed, photoKey);
	const dimensions = createDimensions(band, aspectRatio, longEdge);
	const seedKeyFragment = seedFragment(`${album.id}|${generationSeed}`);
	const directoryPath = pickDirectoryPath(
		album,
		generationSeed,
		sequenceNumber,
	);
	const extension = pickFileExtension(album, generationSeed, photoKey);
	const filename = `photo-${sequenceLabel}-${band.key}-${seedKeyFragment}.${extension}`;
	const relativePath = `${directoryPath}/${filename}`;
	const id = `${MOSAIC_LAB_SYNTHETIC_PHOTO_ID_PREFIX}:${album.id}:${sequenceLabel}:${seedKeyFragment}`;

	return {
		photo: {
			id,
			relativePath,
			directoryPath,
			filename,
			width: dimensions.width,
			height: dimensions.height,
			aspectRatio: dimensions.aspectRatio,
			fileSize: pickFileSize(
				dimensions.width,
				dimensions.height,
				generationSeed,
				photoKey,
			),
			mtimeMs: pickMtimeMs(album, generationSeed, photoKey),
			year: album.year,
			yearSource: album.yearSource,
		},
		metadata: {
			albumId: album.id,
			albumName: album.name,
			presetKey: album.presetKey,
			generationSeed,
			sequenceNumber,
			orientation: band.orientation,
			aspectBandKey: band.key,
			seedFragment: seedKeyFragment,
			placeholder: createPlaceholder(
				album,
				sequenceNumber,
				generationSeed,
				photoKey,
			),
		},
	};
}

export function generateMosaicLabSyntheticPhotoBundle(input: {
	album: MosaicLabSampleAlbum;
	seed?: string;
}): MosaicLabSyntheticPhotoBundle {
	const generationSeed = combineGenerationSeed(input.album, input.seed);
	const drafts = createOrderedBandDrafts(input.album, generationSeed);

	return Object.freeze({
		album: input.album,
		generationSeed,
		photos: Object.freeze(
			drafts.map((draft, index) =>
				createSyntheticPhotoRecord({
					album: input.album,
					generationSeed,
					band: draft.band,
					occurrence: draft.occurrence,
					sequenceNumber: index + 1,
				}),
			),
		),
	});
}

export function generateMosaicLabSyntheticPhotos(input: {
	albums: readonly MosaicLabSampleAlbum[];
	seed?: string;
}): readonly MosaicLabSyntheticPhotoRecord[] {
	return Object.freeze(
		input.albums.flatMap(
			(album) =>
				generateMosaicLabSyntheticPhotoBundle({ album, seed: input.seed })
					.photos,
		),
	);
}

export function generateMosaicLabSyntheticPhotoQueryRecords(input: {
	albums: readonly MosaicLabSampleAlbum[];
	seed?: string;
}): PhotoQueryRecord[] {
	return generateMosaicLabSyntheticPhotos(input).map((record) => record.photo);
}

export function isMosaicLabSyntheticPhotoId(photoId: string): boolean {
	return photoId.startsWith(`${MOSAIC_LAB_SYNTHETIC_PHOTO_ID_PREFIX}:`);
}
