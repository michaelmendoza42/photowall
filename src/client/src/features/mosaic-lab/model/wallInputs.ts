import {
	SNAPSHOT_SCHEMA_VERSION,
	type FolderFacet,
	type LibraryFacetsResponse,
	type YearFacet,
} from "../../../../../shared/api/library.js";
import type {
	PhotoQueryRecord,
	ResolvedPhotoFilters,
} from "../../../../../shared/api/photos.js";
import { hashStringToUint32, uniqueStable } from "../../wall/seeded.js";
import type { MosaicLabSampleAlbum } from "./sampleAlbums.js";

export const MOSAIC_LAB_SNAPSHOT_ID_PREFIX = "mosaic-lab";

export const MOSAIC_LAB_WALL_FILTER_MODES = ["folders", "years"] as const;

export type MosaicLabWallFilterMode =
	(typeof MOSAIC_LAB_WALL_FILTER_MODES)[number];

export interface MosaicLabSyntheticWallInputs {
	photos: readonly PhotoQueryRecord[];
	facets: LibraryFacetsResponse;
	filters: ResolvedPhotoFilters;
	snapshotId: string;
	filterMode: MosaicLabWallFilterMode;
}

interface MosaicLabWallInputBase {
	selectedAlbums: readonly MosaicLabSampleAlbum[];
	photos: readonly PhotoQueryRecord[];
	seed?: string;
	filterMode?: MosaicLabWallFilterMode;
	scannedAt?: string | null;
	playlistId?: string | null;
	snapshotId?: string;
}

interface FolderCountAccumulator {
	directPhotoCount: number;
	photoCount: number;
}

export function buildMosaicLabSyntheticFacets(
	input: Pick<
		MosaicLabWallInputBase,
		"selectedAlbums" | "photos" | "seed" | "scannedAt" | "snapshotId"
	>,
): LibraryFacetsResponse {
	const snapshotId =
		input.snapshotId ??
		buildMosaicLabSyntheticSnapshotId({
			selectedAlbums: input.selectedAlbums,
			photos: input.photos,
			seed: input.seed,
		});

	return {
		schemaVersion: SNAPSHOT_SCHEMA_VERSION,
		snapshotId,
		scannedAt: input.scannedAt ?? null,
		years: deriveSyntheticYearFacets({
			selectedAlbums: input.selectedAlbums,
			photos: input.photos,
		}),
		folders: deriveSyntheticFolderFacets({
			selectedAlbums: input.selectedAlbums,
			photos: input.photos,
		}),
	};
}

export function buildMosaicLabSyntheticResolvedFilters(
	input: Pick<
		MosaicLabWallInputBase,
		"selectedAlbums" | "filterMode" | "playlistId"
	>,
): ResolvedPhotoFilters {
	const filterMode = input.filterMode ?? "folders";
	const playlistId = input.playlistId ?? null;

	if (filterMode === "years") {
		return {
			years: uniqueStable(input.selectedAlbums.map((album) => album.year)).sort(
				(left, right) => left - right,
			),
			folders: [],
			playlistId,
		};
	}

	return {
		years: [],
		folders: uniqueStable(
			input.selectedAlbums
				.map((album) => album.rootDirectoryPath)
				.filter((path) => path.length > 0),
		).sort((left, right) => left.localeCompare(right)),
		playlistId,
	};
}

export function buildMosaicLabSyntheticSnapshotId(
	input: Pick<
		MosaicLabWallInputBase,
		"selectedAlbums" | "photos" | "seed" | "filterMode"
	>,
): string {
	const filterMode = input.filterMode ?? "folders";
	const serialized = JSON.stringify({
		seed: input.seed ?? null,
		filterMode,
		albums: input.selectedAlbums
			.map((album) => ({
				id: album.id,
				presetKey: album.presetKey,
				aspectProfileKey: album.aspectProfileKey,
				photoCount: album.photoCount,
				year: album.year,
				yearSource: album.yearSource,
				seed: album.seed,
				rootDirectoryPath: album.rootDirectoryPath,
				subfolders: [...album.subfolders].sort((left, right) =>
					left.localeCompare(right),
				),
			}))
			.sort(
				(left, right) =>
					left.id.localeCompare(right.id) ||
					left.rootDirectoryPath.localeCompare(right.rootDirectoryPath),
			),
		photos: input.photos
			.map((photo) => ({
				id: photo.id,
				directoryPath: photo.directoryPath,
				filename: photo.filename,
				width: photo.width,
				height: photo.height,
				aspectRatio: photo.aspectRatio,
				fileSize: photo.fileSize,
				mtimeMs: photo.mtimeMs,
				year: photo.year,
				yearSource: photo.yearSource,
			}))
			.sort(
				(left, right) =>
					left.id.localeCompare(right.id) ||
					left.directoryPath.localeCompare(right.directoryPath),
			),
	});
	const hash = hashStringToUint32(serialized).toString(16).padStart(8, "0");
	const seedFragment = normalizeSnapshotSeedFragment(input.seed);
	return `${MOSAIC_LAB_SNAPSHOT_ID_PREFIX}:${seedFragment}:${filterMode}:${hash}`;
}

export function buildMosaicLabSyntheticWallInputs(
	input: MosaicLabWallInputBase,
): MosaicLabSyntheticWallInputs {
	const filterMode = input.filterMode ?? "folders";
	const snapshotId =
		input.snapshotId ??
		buildMosaicLabSyntheticSnapshotId({
			selectedAlbums: input.selectedAlbums,
			photos: input.photos,
			seed: input.seed,
			filterMode,
		});

	return {
		photos: input.photos,
		facets: buildMosaicLabSyntheticFacets({
			selectedAlbums: input.selectedAlbums,
			photos: input.photos,
			seed: input.seed,
			scannedAt: input.scannedAt,
			snapshotId,
		}),
		filters: buildMosaicLabSyntheticResolvedFilters({
			selectedAlbums: input.selectedAlbums,
			filterMode,
			playlistId: input.playlistId,
		}),
		snapshotId,
		filterMode,
	};
}

function deriveSyntheticYearFacets(input: {
	selectedAlbums: readonly MosaicLabSampleAlbum[];
	photos: readonly PhotoQueryRecord[];
}): YearFacet[] {
	const counts = new Map<number, number>();

	for (const album of input.selectedAlbums) {
		counts.set(album.year, counts.get(album.year) ?? 0);
	}

	for (const photo of input.photos) {
		if (photo.year === null) {
			continue;
		}
		counts.set(photo.year, (counts.get(photo.year) ?? 0) + 1);
	}

	return [...counts.entries()]
		.sort(([left], [right]) => left - right)
		.map(([year, photoCount]) => ({ year, photoCount }));
}

function deriveSyntheticFolderFacets(input: {
	selectedAlbums: readonly MosaicLabSampleAlbum[];
	photos: readonly PhotoQueryRecord[];
}): FolderFacet[] {
	const counts = new Map<string, FolderCountAccumulator>();
	const declaredPaths = new Set<string>([""]);

	for (const album of input.selectedAlbums) {
		for (const path of ancestorPaths(album.rootDirectoryPath)) {
			declaredPaths.add(path);
		}

		for (const subfolder of album.subfolders) {
			const declaredSubfolderPath = joinSyntheticFolderPath(
				album.rootDirectoryPath,
				subfolder,
			);
			for (const path of ancestorPaths(declaredSubfolderPath)) {
				declaredPaths.add(path);
			}
		}
	}

	for (const photo of input.photos) {
		for (const path of ancestorPaths(photo.directoryPath)) {
			declaredPaths.add(path);
		}
	}

	for (const path of declaredPaths) {
		ensureFolderCount(counts, path);
	}

	for (const photo of input.photos) {
		ensureFolderCount(counts, photo.directoryPath).directPhotoCount += 1;
		for (const path of ancestorPaths(photo.directoryPath)) {
			ensureFolderCount(counts, path).photoCount += 1;
		}
	}

	return [...counts.entries()]
		.map(([path, count]) => ({
			path,
			depth: folderDepth(path),
			directPhotoCount: count.directPhotoCount,
			photoCount: count.photoCount,
		}))
		.sort(
			(left, right) =>
				left.depth - right.depth || left.path.localeCompare(right.path),
		);
}

function normalizeSnapshotSeedFragment(seed?: string): string {
	const normalized = (seed ?? "default")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 24);
	return normalized.length > 0 ? normalized : "default";
}

function ensureFolderCount(
	counts: Map<string, FolderCountAccumulator>,
	path: string,
): FolderCountAccumulator {
	const existing = counts.get(path);
	if (existing) {
		return existing;
	}
	const created: FolderCountAccumulator = {
		directPhotoCount: 0,
		photoCount: 0,
	};
	counts.set(path, created);
	return created;
}

function ancestorPaths(path: string): string[] {
	const segments = path.split("/").filter(Boolean);
	const out = [""];
	for (let index = 0; index < segments.length; index += 1) {
		out.push(segments.slice(0, index + 1).join("/"));
	}
	return out;
}

function joinSyntheticFolderPath(rootPath: string, subfolder: string): string {
	const normalizedSubfolder = subfolder.replace(/^\/+|\/+$/g, "");
	if (normalizedSubfolder.length === 0) {
		return rootPath;
	}
	return `${rootPath}/${normalizedSubfolder}`;
}

function folderDepth(path: string): number {
	if (path.length === 0) {
		return 0;
	}
	return path.split("/").filter(Boolean).length;
}
