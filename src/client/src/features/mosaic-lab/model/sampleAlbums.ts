import type { YearSource } from "../../../../../shared/api/library.js";

export const MOSAIC_LAB_SAMPLE_ALBUM_PRESET_KEYS = [
	"mixed-vacation",
	"all-landscape",
	"all-portrait",
	"panorama-heavy",
	"phone-weird-mix",
	"tiny-album",
	"dense-year-mock",
] as const;

export type MosaicLabSampleAlbumPresetKey =
	(typeof MOSAIC_LAB_SAMPLE_ALBUM_PRESET_KEYS)[number];

export const MOSAIC_LAB_ASPECT_ORIENTATION_KEYS = [
	"landscape",
	"portrait",
	"square",
] as const;

export type MosaicLabSyntheticPhotoOrientation =
	(typeof MOSAIC_LAB_ASPECT_ORIENTATION_KEYS)[number];

export const MOSAIC_LAB_ASPECT_BAND_KEYS = [
	"landscape-standard",
	"landscape-wide",
	"portrait-standard",
	"portrait-tall",
	"square",
	"panorama",
] as const;

export type MosaicLabAspectBandKey =
	(typeof MOSAIC_LAB_ASPECT_BAND_KEYS)[number];

export interface MosaicLabAspectBandDefinition {
	key: MosaicLabAspectBandKey;
	label: string;
	orientation: MosaicLabSyntheticPhotoOrientation;
	weight: number;
	aspectRatioRange: {
		min: number;
		max: number;
	};
	longEdgeRange: {
		min: number;
		max: number;
	};
}

export const MOSAIC_LAB_ASPECT_PROFILE_KEYS = [
	"balanced-travel",
	"landscape-only",
	"portrait-only",
	"panorama-heavy",
	"phone-weird",
	"dense-archive",
] as const;

export type MosaicLabAspectProfileKey =
	(typeof MOSAIC_LAB_ASPECT_PROFILE_KEYS)[number];

export interface MosaicLabAspectOrientationProfileDefinition {
	key: MosaicLabAspectProfileKey;
	name: string;
	description: string;
	bands: readonly MosaicLabAspectBandDefinition[];
}

export interface MosaicLabSampleAlbumPresetDefinition {
	key: MosaicLabSampleAlbumPresetKey;
	name: string;
	description: string;
	aspectProfileKey: MosaicLabAspectProfileKey;
	defaultPhotoCount: number;
	defaultYear: number;
	defaultSeed: string;
	defaultRootSlug: string;
	defaultSubfolders: readonly string[];
	failureHints: readonly string[];
}

export interface MosaicLabSampleAlbum {
	id: string;
	name: string;
	presetKey: MosaicLabSampleAlbumPresetKey;
	aspectProfileKey: MosaicLabAspectProfileKey;
	photoCount: number;
	year: number;
	yearSource: YearSource;
	seed: string;
	rootDirectoryPath: string;
	subfolders: readonly string[];
	failureHints: readonly string[];
}

const DEFAULT_YEAR_SOURCE: YearSource = "top-level";

export const MOSAIC_LAB_ASPECT_PROFILE_DEFINITIONS = [
	{
		key: "balanced-travel",
		name: "Balanced travel mix",
		description:
			"Mostly standard travel photos with enough portraits and squares to feel organic.",
		bands: [
			{
				key: "landscape-standard",
				label: "Landscape standard",
				orientation: "landscape",
				weight: 0.36,
				aspectRatioRange: { min: 1.22, max: 1.54 },
				longEdgeRange: { min: 2800, max: 4600 },
			},
			{
				key: "landscape-wide",
				label: "Landscape wide",
				orientation: "landscape",
				weight: 0.18,
				aspectRatioRange: { min: 1.55, max: 1.95 },
				longEdgeRange: { min: 3000, max: 5200 },
			},
			{
				key: "portrait-standard",
				label: "Portrait standard",
				orientation: "portrait",
				weight: 0.24,
				aspectRatioRange: { min: 0.66, max: 0.84 },
				longEdgeRange: { min: 3000, max: 4600 },
			},
			{
				key: "portrait-tall",
				label: "Portrait tall",
				orientation: "portrait",
				weight: 0.08,
				aspectRatioRange: { min: 0.48, max: 0.64 },
				longEdgeRange: { min: 3400, max: 5200 },
			},
			{
				key: "square",
				label: "Square",
				orientation: "square",
				weight: 0.08,
				aspectRatioRange: { min: 0.98, max: 1.02 },
				longEdgeRange: { min: 2200, max: 3800 },
			},
			{
				key: "panorama",
				label: "Panorama",
				orientation: "landscape",
				weight: 0.06,
				aspectRatioRange: { min: 2.05, max: 2.9 },
				longEdgeRange: { min: 3600, max: 6400 },
			},
		],
	},
	{
		key: "landscape-only",
		name: "Landscape only",
		description:
			"A landscape-dominant album with standard frames plus occasional wides and panoramas.",
		bands: [
			{
				key: "landscape-standard",
				label: "Landscape standard",
				orientation: "landscape",
				weight: 0.72,
				aspectRatioRange: { min: 1.24, max: 1.58 },
				longEdgeRange: { min: 3200, max: 4800 },
			},
			{
				key: "landscape-wide",
				label: "Landscape wide",
				orientation: "landscape",
				weight: 0.18,
				aspectRatioRange: { min: 1.6, max: 2.0 },
				longEdgeRange: { min: 3400, max: 5600 },
			},
			{
				key: "panorama",
				label: "Panorama",
				orientation: "landscape",
				weight: 0.1,
				aspectRatioRange: { min: 2.1, max: 3.0 },
				longEdgeRange: { min: 4200, max: 7000 },
			},
		],
	},
	{
		key: "portrait-only",
		name: "Portrait only",
		description:
			"A portrait-only album for stressing narrow columns and tall rescue choices.",
		bands: [
			{
				key: "portrait-standard",
				label: "Portrait standard",
				orientation: "portrait",
				weight: 0.78,
				aspectRatioRange: { min: 0.67, max: 0.83 },
				longEdgeRange: { min: 3200, max: 5000 },
			},
			{
				key: "portrait-tall",
				label: "Portrait tall",
				orientation: "portrait",
				weight: 0.22,
				aspectRatioRange: { min: 0.45, max: 0.63 },
				longEdgeRange: { min: 3600, max: 5600 },
			},
		],
	},
	{
		key: "panorama-heavy",
		name: "Panorama heavy",
		description:
			"Large sweeps and seam-breakers that intentionally stress wide-photo packing.",
		bands: [
			{
				key: "panorama",
				label: "Panorama",
				orientation: "landscape",
				weight: 0.48,
				aspectRatioRange: { min: 2.2, max: 3.2 },
				longEdgeRange: { min: 4200, max: 7600 },
			},
			{
				key: "landscape-wide",
				label: "Landscape wide",
				orientation: "landscape",
				weight: 0.24,
				aspectRatioRange: { min: 1.72, max: 2.12 },
				longEdgeRange: { min: 3400, max: 5600 },
			},
			{
				key: "landscape-standard",
				label: "Landscape standard",
				orientation: "landscape",
				weight: 0.14,
				aspectRatioRange: { min: 1.25, max: 1.52 },
				longEdgeRange: { min: 3000, max: 4400 },
			},
			{
				key: "portrait-standard",
				label: "Portrait standard",
				orientation: "portrait",
				weight: 0.08,
				aspectRatioRange: { min: 0.68, max: 0.82 },
				longEdgeRange: { min: 2800, max: 4200 },
			},
			{
				key: "square",
				label: "Square",
				orientation: "square",
				weight: 0.06,
				aspectRatioRange: { min: 0.98, max: 1.02 },
				longEdgeRange: { min: 2200, max: 3400 },
			},
		],
	},
	{
		key: "phone-weird",
		name: "Phone and weird mix",
		description:
			"Tall phone captures, screenshots, squares, and a few accidental wides.",
		bands: [
			{
				key: "portrait-standard",
				label: "Portrait standard",
				orientation: "portrait",
				weight: 0.3,
				aspectRatioRange: { min: 0.63, max: 0.81 },
				longEdgeRange: { min: 2800, max: 4400 },
			},
			{
				key: "portrait-tall",
				label: "Portrait tall",
				orientation: "portrait",
				weight: 0.28,
				aspectRatioRange: { min: 0.44, max: 0.61 },
				longEdgeRange: { min: 3600, max: 6400 },
			},
			{
				key: "square",
				label: "Square",
				orientation: "square",
				weight: 0.16,
				aspectRatioRange: { min: 0.96, max: 1.04 },
				longEdgeRange: { min: 1800, max: 3200 },
			},
			{
				key: "landscape-standard",
				label: "Landscape standard",
				orientation: "landscape",
				weight: 0.1,
				aspectRatioRange: { min: 1.22, max: 1.48 },
				longEdgeRange: { min: 2200, max: 3600 },
			},
			{
				key: "landscape-wide",
				label: "Landscape wide",
				orientation: "landscape",
				weight: 0.08,
				aspectRatioRange: { min: 1.6, max: 2.05 },
				longEdgeRange: { min: 2600, max: 4200 },
			},
			{
				key: "panorama",
				label: "Panorama",
				orientation: "landscape",
				weight: 0.08,
				aspectRatioRange: { min: 2.0, max: 2.8 },
				longEdgeRange: { min: 3000, max: 5000 },
			},
		],
	},
	{
		key: "dense-archive",
		name: "Dense archive year",
		description:
			"A broad yearly archive with enough variety to exercise grouped and deep-scroll scenarios.",
		bands: [
			{
				key: "landscape-standard",
				label: "Landscape standard",
				orientation: "landscape",
				weight: 0.32,
				aspectRatioRange: { min: 1.22, max: 1.52 },
				longEdgeRange: { min: 2600, max: 4200 },
			},
			{
				key: "portrait-standard",
				label: "Portrait standard",
				orientation: "portrait",
				weight: 0.26,
				aspectRatioRange: { min: 0.68, max: 0.84 },
				longEdgeRange: { min: 2800, max: 4200 },
			},
			{
				key: "square",
				label: "Square",
				orientation: "square",
				weight: 0.1,
				aspectRatioRange: { min: 0.98, max: 1.02 },
				longEdgeRange: { min: 1800, max: 3200 },
			},
			{
				key: "landscape-wide",
				label: "Landscape wide",
				orientation: "landscape",
				weight: 0.14,
				aspectRatioRange: { min: 1.58, max: 2.0 },
				longEdgeRange: { min: 2800, max: 5000 },
			},
			{
				key: "portrait-tall",
				label: "Portrait tall",
				orientation: "portrait",
				weight: 0.1,
				aspectRatioRange: { min: 0.46, max: 0.62 },
				longEdgeRange: { min: 3200, max: 5200 },
			},
			{
				key: "panorama",
				label: "Panorama",
				orientation: "landscape",
				weight: 0.08,
				aspectRatioRange: { min: 2.0, max: 2.7 },
				longEdgeRange: { min: 3400, max: 5600 },
			},
		],
	},
] as const satisfies readonly MosaicLabAspectOrientationProfileDefinition[];

export const MOSAIC_LAB_ASPECT_PROFILE_DEFINITIONS_BY_KEY = Object.freeze(
	Object.fromEntries(
		MOSAIC_LAB_ASPECT_PROFILE_DEFINITIONS.map((profile) => [
			profile.key,
			profile,
		]),
	) as Record<
		MosaicLabAspectProfileKey,
		(typeof MOSAIC_LAB_ASPECT_PROFILE_DEFINITIONS)[number]
	>,
);

export const MOSAIC_LAB_SAMPLE_ALBUM_PRESET_DEFINITIONS = [
	{
		key: "mixed-vacation",
		name: "Mixed Vacation",
		description:
			"Travel-style album with a realistic spread of landscape, portrait, and a few panoramic keepsakes.",
		aspectProfileKey: "balanced-travel",
		defaultPhotoCount: 72,
		defaultYear: 2024,
		defaultSeed: "mixed-vacation-v1",
		defaultRootSlug: "summer-vacation",
		defaultSubfolders: ["arrivals", "city-walk", "beach-day", "night-market"],
		failureHints: ["Mixed baseline for normal wall behavior."],
	},
	{
		key: "all-landscape",
		name: "All Landscape",
		description:
			"Landscape-only album for testing wide horizontal rhythm and repeat seams.",
		aspectProfileKey: "landscape-only",
		defaultPhotoCount: 64,
		defaultYear: 2021,
		defaultSeed: "all-landscape-v1",
		defaultRootSlug: "high-desert-loop",
		defaultSubfolders: ["trailhead", "overlooks", "sunset-camp"],
		failureHints: [
			"Exercises repeated horizontal rows with minimal portrait interruption.",
		],
	},
	{
		key: "all-portrait",
		name: "All Portrait",
		description:
			"Portrait-only album for stressing narrow columns and tall rescue choices.",
		aspectProfileKey: "portrait-only",
		defaultPhotoCount: 64,
		defaultYear: 2022,
		defaultSeed: "all-portrait-v1",
		defaultRootSlug: "studio-portraits",
		defaultSubfolders: ["window-light", "backstage", "hallway"],
		failureHints: ["Exercises tall columns and portrait clustering."],
	},
	{
		key: "panorama-heavy",
		name: "Panorama Heavy",
		description:
			"Panorama-heavy album built to expose seam breaks, long strips, and overscan edge cases.",
		aspectProfileKey: "panorama-heavy",
		defaultPhotoCount: 58,
		defaultYear: 2023,
		defaultSeed: "panorama-heavy-v1",
		defaultRootSlug: "coastal-lookouts",
		defaultSubfolders: ["cliffs", "harbor", "ridge-road"],
		failureHints: [
			"High wide-photo density can reveal spacing and crop issues.",
		],
	},
	{
		key: "phone-weird-mix",
		name: "Phone Weird Mix",
		description:
			"Phone-style camera roll with screenshots, awkward crops, and inconsistent orientation.",
		aspectProfileKey: "phone-weird",
		defaultPhotoCount: 45,
		defaultYear: 2020,
		defaultSeed: "phone-weird-mix-v1",
		defaultRootSlug: "camera-roll-mix",
		defaultSubfolders: ["messaging", "receipts", "weekend"],
		failureHints: ["Mixes tall phone images with squares and odd wides."],
	},
	{
		key: "tiny-album",
		name: "Tiny Album",
		description:
			"Very small album for empty-edge behavior and minimum-photo layout checks.",
		aspectProfileKey: "balanced-travel",
		defaultPhotoCount: 9,
		defaultYear: 2018,
		defaultSeed: "tiny-album-v1",
		defaultRootSlug: "weekend-sprint",
		defaultSubfolders: ["check-in", "street", "goodbye"],
		failureHints: ["Low count coverage for short walls and small selections."],
	},
	{
		key: "dense-year-mock",
		name: "Dense Year Mock",
		description:
			"Large archive-style album that simulates a heavy year of mixed capture sources.",
		aspectProfileKey: "dense-archive",
		defaultPhotoCount: 180,
		defaultYear: 2019,
		defaultSeed: "dense-year-mock-v1",
		defaultRootSlug: "year-in-review",
		defaultSubfolders: ["winter", "spring", "summer", "fall", "holidays"],
		failureHints: [
			"Long scroll depth and dense variety can expose regrouping issues.",
		],
	},
] as const satisfies readonly MosaicLabSampleAlbumPresetDefinition[];

export const MOSAIC_LAB_SAMPLE_ALBUM_PRESET_DEFINITIONS_BY_KEY = Object.freeze(
	Object.fromEntries(
		MOSAIC_LAB_SAMPLE_ALBUM_PRESET_DEFINITIONS.map((preset) => [
			preset.key,
			preset,
		]),
	) as Record<
		MosaicLabSampleAlbumPresetKey,
		(typeof MOSAIC_LAB_SAMPLE_ALBUM_PRESET_DEFINITIONS)[number]
	>,
);

function normalizeDirectorySegment(value: string): string {
	return value
		.trim()
		.replace(/\\+/g, "/")
		.replace(/^\/+|\/+$/g, "")
		.replace(/\s+/g, "-")
		.replace(/[^a-zA-Z0-9/_-]+/g, "-")
		.replace(/-{2,}/g, "-")
		.toLowerCase();
}

function buildRootDirectoryPath(year: number, slug: string): string {
	return `${year}/${normalizeDirectorySegment(slug)}`;
}

function freezeSampleAlbum(album: MosaicLabSampleAlbum): MosaicLabSampleAlbum {
	return Object.freeze({
		...album,
		subfolders: Object.freeze([...album.subfolders]),
		failureHints: Object.freeze([...album.failureHints]),
	});
}

function findUniqueValue(
	base: string,
	existing: ReadonlySet<string>,
	variant: (value: string, index: number) => string,
): string {
	let index = 1;
	let candidate = base;
	while (existing.has(candidate)) {
		index += 1;
		candidate = variant(base, index);
	}
	return candidate;
}

function createExistingAlbumValueSets(albums: readonly MosaicLabSampleAlbum[]) {
	return {
		ids: new Set(albums.map((album) => album.id)),
		names: new Set(albums.map((album) => album.name)),
		rootDirectoryPaths: new Set(albums.map((album) => album.rootDirectoryPath)),
	};
}

function createUniqueSessionAlbumId(
	baseId: string,
	existingIds: ReadonlySet<string>,
): string {
	return findUniqueValue(
		baseId,
		existingIds,
		(value, index) => `${value}-${index}`,
	);
}

function createUniqueSessionAlbumName(
	baseName: string,
	existingNames: ReadonlySet<string>,
): string {
	return findUniqueValue(
		baseName,
		existingNames,
		(value, index) => `${value} ${index}`,
	);
}

function createUniqueSessionAlbumRootDirectoryPath(
	baseRootDirectoryPath: string,
	existingRootDirectoryPaths: ReadonlySet<string>,
): string {
	return findUniqueValue(
		normalizeDirectorySegment(baseRootDirectoryPath),
		existingRootDirectoryPaths,
		(value, index) => `${value}-${index}`,
	);
}

export const MOSAIC_LAB_SAMPLE_ALBUM_MIN_PHOTO_COUNT = 1;
export const MOSAIC_LAB_SAMPLE_ALBUM_MAX_PHOTO_COUNT = 240;

export function clampMosaicLabSampleAlbumPhotoCount(value: number): number {
	if (!Number.isFinite(value)) {
		return MOSAIC_LAB_SAMPLE_ALBUM_MIN_PHOTO_COUNT;
	}

	return Math.min(
		MOSAIC_LAB_SAMPLE_ALBUM_MAX_PHOTO_COUNT,
		Math.max(MOSAIC_LAB_SAMPLE_ALBUM_MIN_PHOTO_COUNT, Math.round(value)),
	);
}

export function getMosaicLabAspectProfile(
	key: MosaicLabAspectProfileKey,
): MosaicLabAspectOrientationProfileDefinition {
	return MOSAIC_LAB_ASPECT_PROFILE_DEFINITIONS_BY_KEY[key];
}

export function getMosaicLabSampleAlbumPreset(
	key: MosaicLabSampleAlbumPresetKey,
): MosaicLabSampleAlbumPresetDefinition {
	return MOSAIC_LAB_SAMPLE_ALBUM_PRESET_DEFINITIONS_BY_KEY[key];
}

export function createMosaicLabSampleAlbum(input: {
	presetKey: MosaicLabSampleAlbumPresetKey;
	id?: string;
	name?: string;
	photoCount?: number;
	year?: number;
	yearSource?: YearSource;
	seed?: string;
	rootDirectoryPath?: string;
	subfolders?: readonly string[];
}): MosaicLabSampleAlbum {
	const preset = getMosaicLabSampleAlbumPreset(input.presetKey);
	const year = input.year ?? preset.defaultYear;

	return freezeSampleAlbum({
		id: input.id ?? preset.key,
		name: input.name ?? preset.name,
		presetKey: preset.key,
		aspectProfileKey: preset.aspectProfileKey,
		photoCount: clampMosaicLabSampleAlbumPhotoCount(
			input.photoCount ?? preset.defaultPhotoCount,
		),
		year,
		yearSource: input.yearSource ?? DEFAULT_YEAR_SOURCE,
		seed: input.seed ?? preset.defaultSeed,
		rootDirectoryPath: normalizeDirectorySegment(
			input.rootDirectoryPath ??
				buildRootDirectoryPath(year, preset.defaultRootSlug),
		),
		subfolders: input.subfolders ?? preset.defaultSubfolders,
		failureHints: preset.failureHints,
	});
}

export function createMosaicLabSessionSampleAlbum(input: {
	presetKey: MosaicLabSampleAlbumPresetKey;
	existingAlbums: readonly MosaicLabSampleAlbum[];
}): MosaicLabSampleAlbum {
	const preset = getMosaicLabSampleAlbumPreset(input.presetKey);
	const existingValues = createExistingAlbumValueSets(input.existingAlbums);
	const year = preset.defaultYear;
	const draftName = createUniqueSessionAlbumName(
		`${preset.name} Draft`,
		existingValues.names,
	);
	const rootDirectoryPath = createUniqueSessionAlbumRootDirectoryPath(
		buildRootDirectoryPath(year, `${preset.defaultRootSlug}-draft`),
		existingValues.rootDirectoryPaths,
	);

	return createMosaicLabSampleAlbum({
		presetKey: preset.key,
		id: createUniqueSessionAlbumId(
			`user-${preset.key}-draft`,
			existingValues.ids,
		),
		name: draftName,
		seed: `${preset.defaultSeed}-draft`,
		rootDirectoryPath,
	});
}

export function duplicateMosaicLabSampleAlbum(
	album: MosaicLabSampleAlbum,
	input?: {
		id?: string;
		name?: string;
		photoCount?: number;
		year?: number;
		yearSource?: YearSource;
		seed?: string;
		rootDirectoryPath?: string;
		subfolders?: readonly string[];
	},
): MosaicLabSampleAlbum {
	return freezeSampleAlbum({
		...album,
		id: input?.id ?? `${album.id}-copy`,
		name: input?.name ?? `${album.name} Copy`,
		photoCount: clampMosaicLabSampleAlbumPhotoCount(
			input?.photoCount ?? album.photoCount,
		),
		year: input?.year ?? album.year,
		yearSource: input?.yearSource ?? album.yearSource,
		seed: input?.seed ?? album.seed,
		rootDirectoryPath:
			input?.rootDirectoryPath === undefined
				? album.rootDirectoryPath
				: normalizeDirectorySegment(input.rootDirectoryPath),
		subfolders: input?.subfolders ?? album.subfolders,
		failureHints: album.failureHints,
	});
}

export function duplicateMosaicLabSessionSampleAlbum(input: {
	album: MosaicLabSampleAlbum;
	existingAlbums: readonly MosaicLabSampleAlbum[];
}): MosaicLabSampleAlbum {
	const existingValues = createExistingAlbumValueSets(input.existingAlbums);
	return duplicateMosaicLabSampleAlbum(input.album, {
		id: createUniqueSessionAlbumId(
			`${input.album.id}-copy`,
			existingValues.ids,
		),
		name: createUniqueSessionAlbumName(
			`${input.album.name} Copy`,
			existingValues.names,
		),
		rootDirectoryPath: createUniqueSessionAlbumRootDirectoryPath(
			`${input.album.rootDirectoryPath}-copy`,
			existingValues.rootDirectoryPaths,
		),
	});
}

export function updateMosaicLabSampleAlbum(
	album: MosaicLabSampleAlbum,
	patch: Partial<
		Pick<
			MosaicLabSampleAlbum,
			| "name"
			| "aspectProfileKey"
			| "photoCount"
			| "year"
			| "yearSource"
			| "seed"
			| "rootDirectoryPath"
			| "subfolders"
		>
	>,
): MosaicLabSampleAlbum {
	return freezeSampleAlbum({
		...album,
		...patch,
		photoCount:
			patch.photoCount === undefined
				? album.photoCount
				: clampMosaicLabSampleAlbumPhotoCount(patch.photoCount),
		rootDirectoryPath:
			patch.rootDirectoryPath === undefined
				? album.rootDirectoryPath
				: normalizeDirectorySegment(patch.rootDirectoryPath),
		subfolders: patch.subfolders ?? album.subfolders,
		failureHints: album.failureHints,
	});
}

export const MOSAIC_LAB_STARTER_SAMPLE_ALBUMS =
	MOSAIC_LAB_SAMPLE_ALBUM_PRESET_DEFINITIONS.map((preset) =>
		createMosaicLabSampleAlbum({ presetKey: preset.key }),
	) as readonly MosaicLabSampleAlbum[];

export const MOSAIC_LAB_STARTER_SAMPLE_ALBUMS_BY_PRESET_KEY = Object.freeze(
	Object.fromEntries(
		MOSAIC_LAB_STARTER_SAMPLE_ALBUMS.map((album) => [album.presetKey, album]),
	) as Record<MosaicLabSampleAlbumPresetKey, MosaicLabSampleAlbum>,
);

export function getMosaicLabStarterSampleAlbum(
	presetKey: MosaicLabSampleAlbumPresetKey,
): MosaicLabSampleAlbum {
	return MOSAIC_LAB_STARTER_SAMPLE_ALBUMS_BY_PRESET_KEY[presetKey];
}
