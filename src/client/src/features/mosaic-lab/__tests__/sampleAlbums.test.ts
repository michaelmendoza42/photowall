import { describe, expect, it } from "vitest";
import {
	clampMosaicLabSampleAlbumPhotoCount,
	createMosaicLabSampleAlbum,
	createMosaicLabSessionSampleAlbum,
	duplicateMosaicLabSampleAlbum,
	duplicateMosaicLabSessionSampleAlbum,
	generateMosaicLabSyntheticPhotoBundle,
	generateMosaicLabSyntheticPhotoQueryRecords,
	generateMosaicLabSyntheticPhotos,
	getMosaicLabAspectProfile,
	getMosaicLabSampleAlbumPreset,
	getMosaicLabStarterSampleAlbum,
	isMosaicLabSyntheticPhotoId,
	MOSAIC_LAB_ASPECT_PROFILE_DEFINITIONS,
	MOSAIC_LAB_SAMPLE_ALBUM_MAX_PHOTO_COUNT,
	MOSAIC_LAB_SAMPLE_ALBUM_PRESET_DEFINITIONS,
	MOSAIC_LAB_STARTER_SAMPLE_ALBUMS,
	type MosaicLabSyntheticPhotoRecord,
	updateMosaicLabSampleAlbum,
} from "../model/index.js";

function countByOrientation(photos: readonly MosaicLabSyntheticPhotoRecord[]) {
	return photos.reduce<Record<string, number>>((counts, photo) => {
		counts[photo.metadata.orientation] =
			(counts[photo.metadata.orientation] ?? 0) + 1;
		return counts;
	}, {});
}

function countByBand(photos: readonly MosaicLabSyntheticPhotoRecord[]) {
	return photos.reduce<Record<string, number>>((counts, photo) => {
		counts[photo.metadata.aspectBandKey] =
			(counts[photo.metadata.aspectBandKey] ?? 0) + 1;
		return counts;
	}, {});
}

describe("Mosaic Lab sample album presets", () => {
	it("covers the required starter presets and links them to reusable aspect profiles", () => {
		expect(
			MOSAIC_LAB_SAMPLE_ALBUM_PRESET_DEFINITIONS.map((preset) => preset.key),
		).toEqual([
			"mixed-vacation",
			"all-landscape",
			"all-portrait",
			"panorama-heavy",
			"phone-weird-mix",
			"tiny-album",
			"dense-year-mock",
		]);

		expect(
			MOSAIC_LAB_STARTER_SAMPLE_ALBUMS.map((album) => album.presetKey),
		).toEqual(
			MOSAIC_LAB_SAMPLE_ALBUM_PRESET_DEFINITIONS.map((preset) => preset.key),
		);
		expect(
			MOSAIC_LAB_ASPECT_PROFILE_DEFINITIONS.map((profile) => profile.key),
		).toEqual([
			"balanced-travel",
			"landscape-only",
			"portrait-only",
			"panorama-heavy",
			"phone-weird",
			"dense-archive",
		]);

		for (const album of MOSAIC_LAB_STARTER_SAMPLE_ALBUMS) {
			const preset = getMosaicLabSampleAlbumPreset(album.presetKey);
			const profile = getMosaicLabAspectProfile(album.aspectProfileKey);

			expect(album.name).toBe(preset.name);
			expect(album.photoCount).toBeGreaterThan(0);
			expect(album.rootDirectoryPath).toBe(
				`${album.year}/${preset.defaultRootSlug}`,
			);
			expect(profile.key).toBe(preset.aspectProfileKey);
			expect(
				profile.bands.reduce((sum, band) => sum + band.weight, 0),
			).toBeCloseTo(1, 6);
		}
	});

	it("supports creation, duplication, and targeted editing without losing preset identity", () => {
		const created = createMosaicLabSampleAlbum({
			presetKey: "mixed-vacation",
			id: "vacation-a",
			name: "Vacation A",
			photoCount: 24,
			year: 2026,
			seed: "vacation-a-seed",
			rootDirectoryPath: "/2026/Trips/Coastal Escape/",
			subfolders: ["pier", "boardwalk"],
		});
		const duplicated = duplicateMosaicLabSampleAlbum(created, {
			id: "vacation-b",
		});
		const updated = updateMosaicLabSampleAlbum(duplicated, {
			name: "Vacation B",
			aspectProfileKey: "portrait-only",
			photoCount: 18,
			seed: "vacation-b-seed",
		});

		expect(created).toMatchObject({
			id: "vacation-a",
			presetKey: "mixed-vacation",
			photoCount: 24,
			year: 2026,
			seed: "vacation-a-seed",
			rootDirectoryPath: "2026/trips/coastal-escape",
			subfolders: ["pier", "boardwalk"],
		});
		expect(duplicated).toMatchObject({
			id: "vacation-b",
			name: "Vacation A Copy",
			presetKey: "mixed-vacation",
			photoCount: 24,
		});
		expect(updated).toMatchObject({
			id: "vacation-b",
			name: "Vacation B",
			presetKey: "mixed-vacation",
			aspectProfileKey: "portrait-only",
			photoCount: 18,
			seed: "vacation-b-seed",
		});
		expect(updated.failureHints).toEqual(created.failureHints);
	});

	it("creates and duplicates session-local albums with unique ids, names, and folder roots", () => {
		const created = createMosaicLabSessionSampleAlbum({
			presetKey: "mixed-vacation",
			existingAlbums: MOSAIC_LAB_STARTER_SAMPLE_ALBUMS,
		});
		const second = createMosaicLabSessionSampleAlbum({
			presetKey: "mixed-vacation",
			existingAlbums: [...MOSAIC_LAB_STARTER_SAMPLE_ALBUMS, created],
		});
		const duplicated = duplicateMosaicLabSessionSampleAlbum({
			album: created,
			existingAlbums: [...MOSAIC_LAB_STARTER_SAMPLE_ALBUMS, created, second],
		});

		expect(created.id).toBe("user-mixed-vacation-draft");
		expect(created.name).toBe("Mixed Vacation Draft");
		expect(created.rootDirectoryPath).toBe("2024/summer-vacation-draft");
		expect(second.id).toBe("user-mixed-vacation-draft-2");
		expect(second.name).toBe("Mixed Vacation Draft 2");
		expect(second.rootDirectoryPath).toBe("2024/summer-vacation-draft-2");
		expect(duplicated.id).toBe("user-mixed-vacation-draft-copy");
		expect(duplicated.name).toBe("Mixed Vacation Draft Copy");
		expect(duplicated.rootDirectoryPath).toBe(
			"2024/summer-vacation-draft-copy",
		);
	});

	it("clamps edited and created photo counts to sane positive values", () => {
		const created = createMosaicLabSampleAlbum({
			presetKey: "tiny-album",
			photoCount: 0,
		});
		const updated = updateMosaicLabSampleAlbum(created, {
			photoCount: 999,
		});

		expect(clampMosaicLabSampleAlbumPhotoCount(Number.NaN)).toBe(1);
		expect(created.photoCount).toBe(1);
		expect(updated.photoCount).toBe(MOSAIC_LAB_SAMPLE_ALBUM_MAX_PHOTO_COUNT);
	});
});

describe("Mosaic Lab synthetic photo generation", () => {
	it("is deterministic for the same sample album config and seed", () => {
		const album = updateMosaicLabSampleAlbum(
			getMosaicLabStarterSampleAlbum("mixed-vacation"),
			{
				photoCount: 18,
			},
		);

		const first = generateMosaicLabSyntheticPhotoBundle({
			album,
			seed: "lab-seed-01",
		});
		const second = generateMosaicLabSyntheticPhotoBundle({
			album,
			seed: "lab-seed-01",
		});

		expect(second).toEqual(first);
		expect(second).not.toBe(first);
		expect(second.photos).not.toBe(first.photos);
	});

	it("changes order, ids, and placeholder visuals when the seed changes", () => {
		const album = updateMosaicLabSampleAlbum(
			getMosaicLabStarterSampleAlbum("phone-weird-mix"),
			{
				photoCount: 16,
			},
		);

		const first = generateMosaicLabSyntheticPhotoBundle({
			album,
			seed: "lab-seed-01",
		});
		const changed = generateMosaicLabSyntheticPhotoBundle({
			album,
			seed: "lab-seed-02",
		});

		expect(changed.photos.map((record) => record.photo.id)).not.toEqual(
			first.photos.map((record) => record.photo.id),
		);
		expect(changed.photos.map((record) => record.photo.filename)).not.toEqual(
			first.photos.map((record) => record.photo.filename),
		);
		expect(changed.photos.map((record) => record.photo.width)).not.toEqual(
			first.photos.map((record) => record.photo.width),
		);
		expect(
			changed.photos.map(
				(record) => record.metadata.placeholder.backgroundColor,
			),
		).not.toEqual(
			first.photos.map((record) => record.metadata.placeholder.backgroundColor),
		);
	});

	it("matches the intended orientation distributions for key presets", () => {
		const allLandscape = generateMosaicLabSyntheticPhotoBundle({
			album: getMosaicLabStarterSampleAlbum("all-landscape"),
			seed: "distribution-seed",
		}).photos;
		const allPortrait = generateMosaicLabSyntheticPhotoBundle({
			album: getMosaicLabStarterSampleAlbum("all-portrait"),
			seed: "distribution-seed",
		}).photos;
		const panoramaHeavy = generateMosaicLabSyntheticPhotoBundle({
			album: getMosaicLabStarterSampleAlbum("panorama-heavy"),
			seed: "distribution-seed",
		}).photos;
		const phoneWeird = generateMosaicLabSyntheticPhotoBundle({
			album: getMosaicLabStarterSampleAlbum("phone-weird-mix"),
			seed: "distribution-seed",
		}).photos;

		expect(
			new Set(allLandscape.map((record) => record.metadata.orientation)),
		).toEqual(new Set(["landscape"]));
		expect(
			new Set(allPortrait.map((record) => record.metadata.orientation)),
		).toEqual(new Set(["portrait"]));

		const panoramaBands = countByBand(panoramaHeavy);
		expect(panoramaBands.panorama ?? 0).toBeGreaterThanOrEqual(27);
		expect(panoramaBands.panorama ?? 0).toBeGreaterThan(
			panoramaBands["landscape-wide"] ?? 0,
		);

		const phoneWeirdOrientations = countByOrientation(phoneWeird);
		expect(phoneWeirdOrientations.portrait ?? 0).toBeGreaterThan(
			phoneWeirdOrientations.landscape ?? 0,
		);
		expect(phoneWeirdOrientations.square ?? 0).toBeGreaterThan(0);
	});

	it("produces PhotoQueryRecord-compatible output with stable album-root paths", () => {
		const albums = [
			updateMosaicLabSampleAlbum(
				getMosaicLabStarterSampleAlbum("mixed-vacation"),
				{ photoCount: 12 },
			),
			updateMosaicLabSampleAlbum(getMosaicLabStarterSampleAlbum("tiny-album"), {
				photoCount: 6,
			}),
		] as const;

		const photos = generateMosaicLabSyntheticPhotos({
			albums,
			seed: "wall-sandbox-seed",
		});
		const records = generateMosaicLabSyntheticPhotoQueryRecords({
			albums,
			seed: "wall-sandbox-seed",
		});

		expect(records).toHaveLength(18);
		expect(records).toEqual(photos.map((record) => record.photo));

		for (const album of albums) {
			const albumPhotos = photos.filter(
				(record) => record.metadata.albumId === album.id,
			);
			expect(albumPhotos).toHaveLength(album.photoCount);

			for (const record of albumPhotos) {
				const { photo, metadata } = record;
				const yearStart = Date.UTC(album.year, 0, 1, 0, 0, 0);
				const yearEnd = Date.UTC(album.year + 1, 0, 1, 0, 0, 0);

				expect(isMosaicLabSyntheticPhotoId(photo.id)).toBe(true);
				expect(photo.id.startsWith(`lab:${album.id}:`)).toBe(true);
				expect(photo.id.split(":")[2] ?? "").toHaveLength(3);
				expect(
					photo.directoryPath === album.rootDirectoryPath ||
						photo.directoryPath.startsWith(`${album.rootDirectoryPath}/`),
				).toBe(true);
				expect(photo.relativePath).toBe(
					`${photo.directoryPath}/${photo.filename}`,
				);
				expect(
					photo.relativePath.startsWith(`${album.rootDirectoryPath}/`),
				).toBe(true);
				expect(photo.width).toBeGreaterThan(0);
				expect(photo.height).toBeGreaterThan(0);
				expect(photo.aspectRatio).toBeCloseTo(photo.width / photo.height, 3);
				expect(photo.fileSize).toBeGreaterThan(0);
				expect(photo.year).toBe(album.year);
				expect(photo.yearSource).toBe(album.yearSource);
				expect(photo.mtimeMs).toBeGreaterThanOrEqual(yearStart);
				expect(photo.mtimeMs).toBeLessThan(yearEnd);
				expect(metadata.albumName).toBe(album.name);
				expect(metadata.presetKey).toBe(album.presetKey);
				expect(metadata.placeholder.label).toContain(album.name);
			}
		}
	});
});
