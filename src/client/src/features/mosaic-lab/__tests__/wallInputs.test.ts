import { describe, expect, it } from "vitest";
import type { PhotoQueryRecord } from "../../../../../shared/api/photos.js";
import {
	bucketPhotosByAlbum,
	deriveAlbumAreas,
} from "../../wall/albumAreas.js";
import { deriveGroupedWallFoundation } from "../../wall/groupedWall.js";
import {
	buildMosaicLabSyntheticFacets,
	buildMosaicLabSyntheticResolvedFilters,
	buildMosaicLabSyntheticSnapshotId,
	buildMosaicLabSyntheticWallInputs,
	createMosaicLabSampleAlbum,
	generateMosaicLabSyntheticPhotoQueryRecords,
	getMosaicLabStarterSampleAlbum,
	updateMosaicLabSampleAlbum,
} from "../model/index.js";

function photo(input: {
	id: string;
	directoryPath: string;
	year: number;
}): PhotoQueryRecord {
	return {
		id: input.id,
		relativePath: `${input.directoryPath}/${input.id}.jpg`,
		directoryPath: input.directoryPath,
		filename: `${input.id}.jpg`,
		width: 160,
		height: 90,
		aspectRatio: 160 / 90,
		fileSize: 1000,
		mtimeMs: 0,
		year: input.year,
		yearSource: "top-level",
	};
}

describe("Mosaic Lab synthetic wall inputs", () => {
	it("builds synthetic facets with correct folder counts, depths, and year totals", () => {
		const albums = [
			createMosaicLabSampleAlbum({
				presetKey: "mixed-vacation",
				id: "trip-2024",
				name: "Trip 2024",
				photoCount: 4,
				year: 2024,
				rootDirectoryPath: "2024/trip",
				subfolders: ["day-1", "day-2"],
			}),
			createMosaicLabSampleAlbum({
				presetKey: "tiny-album",
				id: "family-2025",
				name: "Family 2025",
				photoCount: 2,
				year: 2025,
				rootDirectoryPath: "2025/family",
				subfolders: ["dinner"],
			}),
		] as const;
		const photos = [
			photo({ id: "trip-root", directoryPath: "2024/trip", year: 2024 }),
			photo({ id: "trip-a", directoryPath: "2024/trip/day-1", year: 2024 }),
			photo({ id: "trip-b", directoryPath: "2024/trip/day-1", year: 2024 }),
			photo({ id: "trip-c", directoryPath: "2024/trip/day-2", year: 2024 }),
			photo({ id: "family-root", directoryPath: "2025/family", year: 2025 }),
			photo({
				id: "family-dinner",
				directoryPath: "2025/family/dinner",
				year: 2025,
			}),
		] as const;

		const facets = buildMosaicLabSyntheticFacets({
			selectedAlbums: albums,
			photos,
			seed: "facet-seed",
			scannedAt: "2026-06-26T18:00:00.000Z",
		});
		const folder = (path: string) =>
			facets.folders.find((candidate) => candidate.path === path);

		expect(facets.scannedAt).toBe("2026-06-26T18:00:00.000Z");
		expect(facets.years).toEqual([
			{ year: 2024, photoCount: 4 },
			{ year: 2025, photoCount: 2 },
		]);
		expect(folder("")).toEqual({
			path: "",
			depth: 0,
			directPhotoCount: 0,
			photoCount: 6,
		});
		expect(folder("2024")).toEqual({
			path: "2024",
			depth: 1,
			directPhotoCount: 0,
			photoCount: 4,
		});
		expect(folder("2024/trip")).toEqual({
			path: "2024/trip",
			depth: 2,
			directPhotoCount: 1,
			photoCount: 4,
		});
		expect(folder("2024/trip/day-1")).toEqual({
			path: "2024/trip/day-1",
			depth: 3,
			directPhotoCount: 2,
			photoCount: 2,
		});
		expect(folder("2024/trip/day-2")).toEqual({
			path: "2024/trip/day-2",
			depth: 3,
			directPhotoCount: 1,
			photoCount: 1,
		});
		expect(folder("2025")).toEqual({
			path: "2025",
			depth: 1,
			directPhotoCount: 0,
			photoCount: 2,
		});
		expect(folder("2025/family")).toEqual({
			path: "2025/family",
			depth: 2,
			directPhotoCount: 1,
			photoCount: 2,
		});
		expect(folder("2025/family/dinner")).toEqual({
			path: "2025/family/dinner",
			depth: 3,
			directPhotoCount: 1,
			photoCount: 1,
		});
	});

	it("derives resolved filters for single, multi-album, and year-based grouped selections", () => {
		const mixedVacation = updateMosaicLabSampleAlbum(
			getMosaicLabStarterSampleAlbum("mixed-vacation"),
			{ photoCount: 12 },
		);
		const tinyAlbum = updateMosaicLabSampleAlbum(
			getMosaicLabStarterSampleAlbum("tiny-album"),
			{ photoCount: 6 },
		);
		const sameYearPair = [
			updateMosaicLabSampleAlbum(
				getMosaicLabStarterSampleAlbum("dense-year-mock"),
				{
					year: 2019,
					rootDirectoryPath: "2019/year-in-review",
				},
			),
			createMosaicLabSampleAlbum({
				presetKey: "mixed-vacation",
				id: "road-trip-2019",
				name: "Road Trip 2019",
				photoCount: 72,
				year: 2019,
				seed: "road-trip-2019-seed",
				rootDirectoryPath: "2019/road-trip",
				subfolders: ["arrivals", "desert"],
			}),
		] as const;

		expect(
			buildMosaicLabSyntheticResolvedFilters({
				selectedAlbums: [mixedVacation],
			}),
		).toEqual({
			years: [],
			folders: [mixedVacation.rootDirectoryPath],
			playlistId: null,
		});
		expect(
			buildMosaicLabSyntheticResolvedFilters({
				selectedAlbums: [tinyAlbum, mixedVacation],
			}),
		).toEqual({
			years: [],
			folders: [
				mixedVacation.rootDirectoryPath,
				tinyAlbum.rootDirectoryPath,
			].sort(),
			playlistId: null,
		});
		expect(
			buildMosaicLabSyntheticResolvedFilters({
				selectedAlbums: sameYearPair,
				filterMode: "years",
			}),
		).toEqual({
			years: [2019],
			folders: [],
			playlistId: null,
		});
	});

	it("creates stable snapshot ids that ignore selection order but change when relevant inputs change", () => {
		const albums = [
			updateMosaicLabSampleAlbum(
				getMosaicLabStarterSampleAlbum("mixed-vacation"),
				{ photoCount: 8 },
			),
			updateMosaicLabSampleAlbum(getMosaicLabStarterSampleAlbum("tiny-album"), {
				photoCount: 4,
			}),
		] as const;
		const photos = generateMosaicLabSyntheticPhotoQueryRecords({
			albums,
			seed: "snapshot-seed-a",
		});
		const first = buildMosaicLabSyntheticSnapshotId({
			selectedAlbums: albums,
			photos,
			seed: "snapshot-seed-a",
		});
		const second = buildMosaicLabSyntheticSnapshotId({
			selectedAlbums: [albums[1], albums[0]],
			photos: [...photos].reverse(),
			seed: "snapshot-seed-a",
		});
		const changed = buildMosaicLabSyntheticSnapshotId({
			selectedAlbums: albums,
			photos: generateMosaicLabSyntheticPhotoQueryRecords({
				albums,
				seed: "snapshot-seed-b",
			}),
			seed: "snapshot-seed-b",
		});
		const changedMode = buildMosaicLabSyntheticSnapshotId({
			selectedAlbums: albums,
			photos,
			seed: "snapshot-seed-a",
			filterMode: "years",
		});

		expect(first).toMatch(/^mosaic-lab:/);
		expect(second).toBe(first);
		expect(changed).not.toBe(first);
		expect(changedMode).not.toBe(first);
	});

	it("drives production grouped wall helpers from synthetic folder-based wall inputs", () => {
		const singleAlbum = updateMosaicLabSampleAlbum(
			getMosaicLabStarterSampleAlbum("mixed-vacation"),
			{ photoCount: 10 },
		);
		const singlePhotos = generateMosaicLabSyntheticPhotoQueryRecords({
			albums: [singleAlbum],
			seed: "foundation-single",
		});
		const singleInputs = buildMosaicLabSyntheticWallInputs({
			selectedAlbums: [singleAlbum],
			photos: singlePhotos,
			seed: "foundation-single",
		});
		const singleFoundation = deriveGroupedWallFoundation({
			filters: singleInputs.filters,
			facets: singleInputs.facets,
			photos: singleInputs.photos,
			snapshotId: singleInputs.snapshotId,
			worldWidth: 1280,
		});

		expect(singleFoundation.mode).toBe("single");
		expect(singleFoundation.albums).toEqual([]);

		const groupedAlbums = [
			updateMosaicLabSampleAlbum(
				getMosaicLabStarterSampleAlbum("mixed-vacation"),
				{ photoCount: 10 },
			),
			updateMosaicLabSampleAlbum(getMosaicLabStarterSampleAlbum("tiny-album"), {
				photoCount: 6,
			}),
		] as const;
		const groupedPhotos = generateMosaicLabSyntheticPhotoQueryRecords({
			albums: groupedAlbums,
			seed: "foundation-grouped",
		});
		const groupedInputs = buildMosaicLabSyntheticWallInputs({
			selectedAlbums: groupedAlbums,
			photos: groupedPhotos,
			seed: "foundation-grouped",
		});
		const groupedFoundation = deriveGroupedWallFoundation({
			filters: groupedInputs.filters,
			facets: groupedInputs.facets,
			photos: groupedInputs.photos,
			snapshotId: groupedInputs.snapshotId,
			worldWidth: 1280,
		});

		expect(groupedFoundation.mode).toBe("grouped");
		if (groupedFoundation.mode === "grouped") {
			expect(groupedFoundation.albums).toHaveLength(groupedAlbums.length);
			expect(
				groupedFoundation.albums.map((album) => album.area.albumKey).sort(),
			).toEqual(
				groupedAlbums
					.map((album) => `folder:${album.rootDirectoryPath}`)
					.sort(),
			);
			expect(
				groupedFoundation.albums
					.map((album) => album.photos.length)
					.sort((left, right) => left - right),
			).toEqual(
				groupedAlbums
					.map((album) => album.photoCount)
					.sort((left, right) => left - right),
			);
		}
	});

	it("supports year-based grouped foundations and buckets synthetic photos into the expected album areas", () => {
		const albums = [
			updateMosaicLabSampleAlbum(
				getMosaicLabStarterSampleAlbum("dense-year-mock"),
				{
					photoCount: 18,
					year: 2019,
					rootDirectoryPath: "2019/year-in-review",
				},
			),
			createMosaicLabSampleAlbum({
				presetKey: "mixed-vacation",
				id: "road-trip-2019",
				name: "Road Trip 2019",
				photoCount: 12,
				year: 2019,
				seed: "road-trip-2019-seed",
				rootDirectoryPath: "2019/road-trip",
				subfolders: ["arrivals", "desert"],
			}),
		] as const;
		const photos = generateMosaicLabSyntheticPhotoQueryRecords({
			albums,
			seed: "foundation-years",
		});
		const wallInputs = buildMosaicLabSyntheticWallInputs({
			selectedAlbums: albums,
			photos,
			seed: "foundation-years",
			filterMode: "years",
		});
		const foundation = deriveGroupedWallFoundation({
			filters: wallInputs.filters,
			facets: wallInputs.facets,
			photos: wallInputs.photos,
			snapshotId: wallInputs.snapshotId,
			worldWidth: 1280,
		});

		expect(foundation.mode).toBe("grouped");
		if (foundation.mode !== "grouped") {
			throw new Error("Expected grouped foundation");
		}
		expect(foundation.albums.map((album) => album.area.kind)).toEqual([
			"folder",
			"folder",
		]);
		expect(
			foundation.albums.map((album) => album.area.albumKey).sort(),
		).toEqual(
			[
				`folder:${albums[0].rootDirectoryPath}`,
				`folder:${albums[1].rootDirectoryPath}`,
			].sort(),
		);

		const derivedAreas = deriveAlbumAreas({
			filters: wallInputs.filters,
			facets: wallInputs.facets,
			photos,
			snapshotId: wallInputs.snapshotId,
			worldWidth: 1280,
		});
		const buckets = bucketPhotosByAlbum(photos, derivedAreas.albums);

		for (const album of albums) {
			const expectedAlbumKey = `folder:${album.rootDirectoryPath}`;
			const bucket = buckets.get(expectedAlbumKey) ?? [];
			expect(bucket).toHaveLength(album.photoCount);
			expect(
				bucket.every(
					(item) =>
						item.directoryPath === album.rootDirectoryPath ||
						item.directoryPath.startsWith(`${album.rootDirectoryPath}/`),
				),
			).toBe(true);
		}
	});
});
