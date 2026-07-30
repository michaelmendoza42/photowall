import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAppSurfaceHref } from "../../app/appSurface.js";
import {
	INITIAL_CAMERA,
	panTo,
	withViewport,
	withWorldBounds,
} from "../../state/camera.js";
import { FocusedPhotoLightbox } from "../modal/FocusedPhotoLightbox.js";
import type { WallStats } from "../wall/WallCanvas.js";
import { PhotoWallSurface } from "../wall/PhotoWallSurface.js";
import { deriveActiveAlbumAreaCount } from "../wall/activeAlbumAreaCount.js";
import {
	deriveGroupedCameraTarget,
	deriveGroupedWallFoundation,
} from "../wall/groupedWall.js";
import { computeWorldWidth, WORLD_WIDTH_MAX } from "../wall/worldWidth.js";
import {
	buildMosaicLabSyntheticWallInputs,
	clampMosaicLabSampleAlbumPhotoCount,
	createMosaicLabSessionSampleAlbum,
	createMosaicLabSyntheticMediaSourceResolver,
	duplicateMosaicLabSessionSampleAlbum,
	generateMosaicLabSyntheticPhotoBundle,
	getMosaicLabAspectProfile,
	getMosaicLabSampleAlbumPreset,
	MOSAIC_LAB_ASPECT_PROFILE_DEFINITIONS,
	MOSAIC_LAB_SAMPLE_ALBUM_MAX_PHOTO_COUNT,
	MOSAIC_LAB_SAMPLE_ALBUM_MIN_PHOTO_COUNT,
	MOSAIC_LAB_SAMPLE_ALBUM_PRESET_DEFINITIONS,
	MOSAIC_LAB_STARTER_SAMPLE_ALBUMS,
	type MosaicLabAspectBandKey,
	type MosaicLabSampleAlbum,
	type MosaicLabSampleAlbumPresetKey,
	type MosaicLabSyntheticPhotoOrientation,
	updateMosaicLabSampleAlbum,
} from "./model/index.js";
import type { PhotoQueryRecord } from "../../../../shared/api/photos.js";

const DEFAULT_SELECTED_ALBUM_IDS = [
	"mixed-vacation",
	"panorama-heavy",
] as const;
const NOOP = (): void => {};
const ASPECT_BAND_LABELS = Object.freeze(
	Object.fromEntries(
		MOSAIC_LAB_ASPECT_PROFILE_DEFINITIONS.flatMap((profile) =>
			profile.bands.map((band) => [band.key, band.label]),
		),
	) as Record<MosaicLabAspectBandKey, string>,
);

function formatCountList(entries: ReadonlyMap<string, number>): string {
	const values = [...entries.entries()].filter(([, count]) => count > 0);
	if (values.length === 0) {
		return "none";
	}

	return values
		.sort(([leftLabel], [rightLabel]) => leftLabel.localeCompare(rightLabel))
		.map(([label, count]) => `${label}: ${count}`)
		.join(" · ");
}

function createSeedToken(): string {
	const token =
		typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
			? crypto.randomUUID().slice(0, 8)
			: Math.random().toString(36).slice(2, 10);

	return `lab-seed-${token}`;
}

function deriveDynamicFailureHints(
	album: MosaicLabSampleAlbum,
): readonly string[] {
	const hints = [...album.failureHints];
	const preset = getMosaicLabSampleAlbumPreset(album.presetKey);

	if (album.photoCount <= 12) {
		hints.push("Low counts can expose short-wall and empty-edge behavior.");
	}

	if (album.aspectProfileKey !== preset.aspectProfileKey) {
		const profile = getMosaicLabAspectProfile(album.aspectProfileKey);
		hints.push(`Profile override · ${profile.name}. ${profile.description}`);
	}

	return hints;
}

export function MosaicLabShell(): JSX.Element {
	const [sampleAlbums, setSampleAlbums] = useState<readonly MosaicLabSampleAlbum[]>(
		MOSAIC_LAB_STARTER_SAMPLE_ALBUMS,
	);
	const [selectedAlbumIds, setSelectedAlbumIds] = useState<readonly string[]>(
		DEFAULT_SELECTED_ALBUM_IDS,
	);
	const [activeAlbumId, setActiveAlbumId] = useState<string | null>(
		DEFAULT_SELECTED_ALBUM_IDS[0],
	);
	const [createPresetKey, setCreatePresetKey] =
		useState<MosaicLabSampleAlbumPresetKey>("mixed-vacation");
	const [camera, setCamera] = useState(INITIAL_CAMERA);
	const [wallStats, setWallStats] = useState<WallStats | null>(null);
	const [focusedPhoto, setFocusedPhoto] = useState<PhotoQueryRecord | null>(
		null,
	);

	useEffect(() => {
		function syncViewport(): void {
			setCamera((prev) =>
				withViewport(prev, {
					width: window.innerWidth,
					height: window.innerHeight,
				}),
			);
		}

		syncViewport();
		window.addEventListener("resize", syncViewport);
		return () => window.removeEventListener("resize", syncViewport);
	}, []);

	useEffect(() => {
		document.body.dataset["appReady"] = "true";
	}, []);

	useEffect(() => {
		setSelectedAlbumIds((prev) => {
			const availableIds = new Set(sampleAlbums.map((album) => album.id));
			const next = prev.filter((albumId) => availableIds.has(albumId));
			if (next.length > 0) {
				return next;
			}
			const fallbackAlbum = sampleAlbums[0];
			return fallbackAlbum ? [fallbackAlbum.id] : [];
		});
	}, [sampleAlbums]);

	useEffect(() => {
		setActiveAlbumId((prev) => {
			if (prev && selectedAlbumIds.includes(prev)) {
				return prev;
			}
			return selectedAlbumIds[0] ?? sampleAlbums[0]?.id ?? null;
		});
	}, [sampleAlbums, selectedAlbumIds]);

	const selectedAlbums = useMemo(() => {
		const selectedIdSet = new Set(selectedAlbumIds);
		const matches = sampleAlbums.filter((album) => selectedIdSet.has(album.id));
		if (matches.length > 0) {
			return matches;
		}
		return sampleAlbums[0] ? [sampleAlbums[0]] : [];
	}, [sampleAlbums, selectedAlbumIds]);

	const activeAlbum = useMemo(
		() =>
			selectedAlbums.find((album) => album.id === activeAlbumId) ??
			selectedAlbums[0] ??
			null,
		[activeAlbumId, selectedAlbums],
	);

	const syntheticBundles = useMemo(
		() =>
			selectedAlbums.map((album) =>
				generateMosaicLabSyntheticPhotoBundle({
					album,
				}),
			),
		[selectedAlbums],
	);

	const syntheticRecords = useMemo(
		() => syntheticBundles.flatMap((bundle) => bundle.photos),
		[syntheticBundles],
	);
	const syntheticPhotos = useMemo(
		() => syntheticRecords.map((record) => record.photo),
		[syntheticRecords],
	);

	const syntheticWallInputs = useMemo(
		() =>
			buildMosaicLabSyntheticWallInputs({
				selectedAlbums,
				photos: syntheticPhotos,
			}),
		[selectedAlbums, syntheticPhotos],
	);

	const worldWidth = useMemo(
		() => computeWorldWidth(camera.viewport.width || WORLD_WIDTH_MAX),
		[camera.viewport.width],
	);

	const groupedFoundation = useMemo(
		() =>
			deriveGroupedWallFoundation({
				filters: syntheticWallInputs.filters,
				facets: syntheticWallInputs.facets,
				photos: syntheticWallInputs.photos,
				snapshotId: syntheticWallInputs.snapshotId,
				worldWidth,
			}),
		[
			syntheticWallInputs.filters,
			syntheticWallInputs.facets,
			syntheticWallInputs.photos,
			syntheticWallInputs.snapshotId,
			worldWidth,
		],
	);

	const activeAlbumAreaCount = useMemo(
		() =>
			deriveActiveAlbumAreaCount({
				filters: syntheticWallInputs.filters,
				facets: syntheticWallInputs.facets,
				photos: syntheticWallInputs.photos,
				snapshotId: syntheticWallInputs.snapshotId,
				worldWidth,
			}),
		[
			syntheticWallInputs.filters,
			syntheticWallInputs.facets,
			syntheticWallInputs.photos,
			syntheticWallInputs.snapshotId,
			worldWidth,
		],
	);

	const syntheticMediaSourceResolver = useMemo(
		() => createMosaicLabSyntheticMediaSourceResolver(syntheticRecords),
		[syntheticRecords],
	);

	useEffect(() => {
		setCamera((prev) =>
			withWorldBounds(prev, {
				width: worldWidth,
				height: groupedFoundation.estimatedWorldHeight,
			}),
		);
	}, [groupedFoundation.estimatedWorldHeight, worldWidth]);

	useEffect(() => {
		if (!wallStats) {
			return;
		}

		setCamera((prev) =>
			withWorldBounds(prev, {
				width: wallStats.worldWidth,
				height: wallStats.contentHeight,
			}),
		);
	}, [wallStats]);

	const wallViewKey = `${syntheticWallInputs.snapshotId}:${groupedFoundation.viewKey}`;
	const lastCameraResetKeyRef = useRef<string | null>(null);

	useEffect(() => {
		if (lastCameraResetKeyRef.current === wallViewKey) {
			return;
		}

		if (groupedFoundation.mode === "grouped") {
			const target = deriveGroupedCameraTarget({
				foundation: groupedFoundation,
				viewportWidth: camera.viewport.width,
				viewportHeight: camera.viewport.height,
			});

			if (!target) {
				return;
			}

			lastCameraResetKeyRef.current = wallViewKey;
			setWallStats(null);
			setFocusedPhoto(null);
			setCamera((prev) =>
				panTo(
					withWorldBounds(prev, {
						width: worldWidth,
						height: groupedFoundation.estimatedWorldHeight,
					}),
					target,
				),
			);
			return;
		}

		lastCameraResetKeyRef.current = wallViewKey;
		setWallStats(null);
		setFocusedPhoto(null);
		setCamera((prev) =>
			panTo(
				withWorldBounds(prev, {
					width: worldWidth,
					height: groupedFoundation.estimatedWorldHeight,
				}),
				{ x: 0, y: 0 },
			),
		);
	}, [
		camera.viewport.height,
		camera.viewport.width,
		groupedFoundation,
		wallViewKey,
		worldWidth,
	]);

	const orientationCounts = useMemo(() => {
		const counts = new Map<MosaicLabSyntheticPhotoOrientation, number>([
			["landscape", 0],
			["portrait", 0],
			["square", 0],
		]);

		for (const record of syntheticRecords) {
			counts.set(
				record.metadata.orientation,
				(counts.get(record.metadata.orientation) ?? 0) + 1,
			);
		}

		return counts;
	}, [syntheticRecords]);

	const aspectBandCounts = useMemo(() => {
		const counts = new Map<string, number>();

		for (const record of syntheticRecords) {
			const label = ASPECT_BAND_LABELS[record.metadata.aspectBandKey];
			counts.set(label, (counts.get(label) ?? 0) + 1);
		}

		return counts;
	}, [syntheticRecords]);

	const selectedFailureHints = useMemo(
		() =>
			[
				...new Set(
					selectedAlbums.flatMap((album) => deriveDynamicFailureHints(album)),
				),
			],
		[selectedAlbums],
	);

	const selectedAlbumNames = useMemo(
		() => selectedAlbums.map((album) => album.name).join(" · "),
		[selectedAlbums],
	);

	const updateAlbum = useCallback(
		(
			albumId: string,
			patch: Parameters<typeof updateMosaicLabSampleAlbum>[1],
		) => {
			setSampleAlbums((prev) =>
				prev.map((album) =>
					album.id === albumId ? updateMosaicLabSampleAlbum(album, patch) : album,
				),
			);
		},
		[],
	);

	const focusAlbum = useCallback((albumId: string) => {
		setSelectedAlbumIds((prev) =>
			prev.includes(albumId) ? prev : [...prev, albumId],
		);
		setActiveAlbumId(albumId);
	}, []);

	const toggleAlbum = useCallback((albumId: string) => {
		setSelectedAlbumIds((prev) => {
			if (prev.includes(albumId)) {
				return prev.length > 1
					? prev.filter((candidate) => candidate !== albumId)
					: prev;
			}

			return [...prev, albumId];
		});
	}, []);

	const createAlbum = useCallback(() => {
		const createdAlbum = createMosaicLabSessionSampleAlbum({
			presetKey: createPresetKey,
			existingAlbums: sampleAlbums,
		});
		setSampleAlbums((prev) => [...prev, createdAlbum]);
		setSelectedAlbumIds((prev) => [...prev, createdAlbum.id]);
		setActiveAlbumId(createdAlbum.id);
	}, [createPresetKey, sampleAlbums]);

	const duplicateAlbum = useCallback(() => {
		if (!activeAlbum) {
			return;
		}

		const duplicatedAlbum = duplicateMosaicLabSessionSampleAlbum({
			album: activeAlbum,
			existingAlbums: sampleAlbums,
		});
		setSampleAlbums((prev) => [...prev, duplicatedAlbum]);
		setSelectedAlbumIds((prev) => [...prev, duplicatedAlbum.id]);
		setActiveAlbumId(duplicatedAlbum.id);
	}, [activeAlbum, sampleAlbums]);

	const sharedWallProps = {
		photos: syntheticWallInputs.photos,
		worldWidth,
		hasNextPage: false,
		isFetchingNextPage: false,
		onLoadMore: NOOP,
		onStatsChange: setWallStats,
		camera,
		onCameraChange: setCamera,
		activeAlbumAreaCount,
		onPhotoOpen: setFocusedPhoto,
		isModalOpen: focusedPhoto !== null,
		mediaSourceResolver: syntheticMediaSourceResolver,
	};

	const activeProfile = activeAlbum
		? getMosaicLabAspectProfile(activeAlbum.aspectProfileKey)
		: null;
	const groupedAlbumCount =
		groupedFoundation.mode === "grouped"
			? groupedFoundation.albums.length
			: selectedAlbums.length;

	return (
		<main
			className="mosaic-lab"
			data-testid="mosaic-lab-shell"
			data-app-surface="mosaic-lab"
			data-lab-renderer="production-wall"
			data-layout-mode={groupedFoundation.mode}
			data-selected-album-count={selectedAlbums.length}
			data-selected-album-names={selectedAlbumNames}
			data-generated-photo-count={syntheticPhotos.length}
			data-snapshot-id={syntheticWallInputs.snapshotId}
			data-view-key={groupedFoundation.viewKey}
			data-active-album-id={activeAlbum?.id ?? "none"}
		>
			<div
				className="mosaic-lab__wall-sandbox"
				data-testid="mosaic-lab-wall-sandbox"
				data-lab-renderer="production-wall"
			>
				<PhotoWallSurface
					{...sharedWallProps}
					groupedFoundation={groupedFoundation}
				/>
			</div>

			<div className="mosaic-lab__overlay">
				<section className="mosaic-lab__banner" aria-live="polite">
					<p className="mosaic-lab__eyebrow">
						Mosaic Lab · synthetic mockup only
					</p>
					<h1 className="mosaic-lab__title">Production wall sandbox</h1>
					<p className="mosaic-lab__body">
						Compact session-local album controls feed the shared production wall
						renderer immediately so grouped and single layout behavior stay easy
						to inspect.
					</p>
					<div className="mosaic-lab__actions">
						<button
							className="mosaic-lab__link mosaic-lab__link--primary"
							data-testid="mosaic-lab-return"
							type="button"
							onClick={() => {
								window.location.hash = getAppSurfaceHref("wall");
							}}
						>
							Return to photo wall
						</button>
						<button
							className="mosaic-lab__link"
							data-testid="mosaic-lab-regenerate"
							type="button"
							onClick={() => {
								if (!activeAlbum) {
									return;
								}
								updateAlbum(activeAlbum.id, {
									seed: createSeedToken(),
								});
							}}
							disabled={!activeAlbum}
						>
							Regenerate active seed
						</button>
					</div>
				</section>

				<aside
					className="mosaic-lab__panel"
					data-testid="mosaic-lab-summary-panel"
					aria-label="Mosaic Lab session summary"
				>
					<div className="mosaic-lab__panel-block">
						<p className="mosaic-lab__panel-eyebrow">Current synthetic wall</p>
						<div data-testid="mosaic-lab-session-summary">
							<div
								className="mosaic-lab__chip-row"
								data-testid="mosaic-lab-selection-summary"
							>
								<span
									className="mosaic-lab__chip"
									data-testid="mosaic-lab-selected-album-count"
								>
									Albums · {selectedAlbums.length}
								</span>
								<span
									className="mosaic-lab__chip"
									data-testid="mosaic-lab-generated-photo-count"
								>
									Photos · {syntheticPhotos.length}
								</span>
								<span
									className="mosaic-lab__chip"
									data-testid="mosaic-lab-layout-mode"
								>
									Layout · {groupedFoundation.mode}
								</span>
							</div>
						</div>
						<dl
							className="mosaic-lab__facts"
							data-testid="mosaic-lab-diagnostics"
						>
							<div>
								<dt>Selected albums</dt>
								<dd data-testid="mosaic-lab-selected-album-names">
									{selectedAlbumNames || "Waiting for selection"}
								</dd>
							</div>
							<div>
								<dt>Active seed</dt>
								<dd data-testid="mosaic-lab-seed-summary">
									{activeAlbum?.seed ?? "Waiting for active album"}
								</dd>
							</div>
							<div>
								<dt>Orientation mix</dt>
								<dd>{formatCountList(orientationCounts)}</dd>
							</div>
							<div>
								<dt>Aspect bands</dt>
								<dd data-testid="mosaic-lab-aspect-distribution">
									{formatCountList(aspectBandCounts)}
								</dd>
							</div>
							<div>
								<dt>Packed / mounted</dt>
								<dd data-testid="mosaic-lab-packed-summary">
									{wallStats
										? `${wallStats.packedPhotoCount} packed tiles · ${wallStats.mountedRows}/${wallStats.totalRows} mounted rows`
										: "Waiting for production wall stats"}
								</dd>
							</div>
							<div>
								<dt>Grouped albums</dt>
								<dd data-testid="mosaic-lab-grouped-album-count">
									{groupedAlbumCount} active album areas
								</dd>
							</div>
							<div>
								<dt>World</dt>
								<dd data-testid="mosaic-lab-world-summary">
									{wallStats
										? `${Math.round(wallStats.worldWidth)} × ${Math.round(wallStats.contentHeight)} px`
										: "Waiting for layout stats"}
								</dd>
							</div>
							<div>
								<dt>Viewport</dt>
								<dd>
									{Math.round(camera.viewport.width)} ×{" "}
									{Math.round(camera.viewport.height)} px
								</dd>
							</div>
							<div>
								<dt>Camera</dt>
								<dd data-testid="mosaic-lab-camera-summary">
									x {Math.round(camera.x)} · y {Math.round(camera.y)}
								</dd>
							</div>
							<div>
								<dt>Precision metrics</dt>
								<dd data-testid="mosaic-lab-deferred-metrics">
									Black space / overlap / crop · deferred — not yet measured
									from the production wall.
								</dd>
							</div>
							<div>
								<dt>Modal + hover</dt>
								<dd>
									Synthetic SVG resolver enabled for wall, hover preview, and
									modal.
								</dd>
							</div>
						</dl>
					</div>

					<div className="mosaic-lab__panel-block">
						<p className="mosaic-lab__panel-eyebrow">Session albums</p>
						<div className="mosaic-lab__inline-controls">
							<select
								className="mosaic-lab__select"
								data-testid="mosaic-lab-create-preset-select"
								value={createPresetKey}
								onChange={(event) =>
									setCreatePresetKey(
										event.target.value as MosaicLabSampleAlbumPresetKey,
									)
								}
							>
								{MOSAIC_LAB_SAMPLE_ALBUM_PRESET_DEFINITIONS.map((preset) => (
									<option key={preset.key} value={preset.key}>
										{preset.name}
									</option>
								))}
							</select>
							<button
								className="mosaic-lab__link"
								data-testid="mosaic-lab-create-album"
								type="button"
								onClick={createAlbum}
							>
								Create album
							</button>
						</div>
						<div
							className="mosaic-lab__album-list"
							data-testid="mosaic-lab-starter-roster"
						>
							{sampleAlbums.map((album) => {
								const selected = selectedAlbums.some(
									(candidate) => candidate.id === album.id,
								);
								const active = activeAlbum?.id === album.id;

								return (
									<div
										key={album.id}
										className="mosaic-lab__album-entry"
										data-selected={selected ? "true" : "false"}
										data-active={active ? "true" : "false"}
									>
										<button
											type="button"
											className="mosaic-lab__album-select"
											data-testid={`mosaic-lab-album-select-${album.id}`}
											data-selected={selected ? "true" : "false"}
											aria-pressed={selected}
											onClick={() => toggleAlbum(album.id)}
										>
											{selected ? "On" : "Off"}
										</button>
										<button
											type="button"
											className="mosaic-lab__album-toggle"
											data-testid={`mosaic-lab-album-edit-${album.id}`}
											data-selected={selected ? "true" : "false"}
											data-active={active ? "true" : "false"}
											onClick={() => focusAlbum(album.id)}
										>
											<span className="mosaic-lab__album-name">
												{album.name}
											</span>
											<span className="mosaic-lab__album-meta">
												{album.photoCount} photos · {album.year} · {album.aspectProfileKey}
											</span>
										</button>
									</div>
								);
							})}
						</div>
					</div>

					<div className="mosaic-lab__panel-block">
						<p className="mosaic-lab__panel-eyebrow">Active album</p>
						{activeAlbum ? (
							<>
								<div className="mosaic-lab__inline-controls">
									<button
										className="mosaic-lab__link"
										data-testid="mosaic-lab-duplicate-album"
										type="button"
										onClick={duplicateAlbum}
									>
										Duplicate album
									</button>
								</div>
								<p className="mosaic-lab__supporting-copy">
									Preset · {getMosaicLabSampleAlbumPreset(activeAlbum.presetKey).name}
									. Profile · {activeProfile?.name ?? activeAlbum.aspectProfileKey}.
								</p>
								<div
									className="mosaic-lab__field-grid"
									data-testid="mosaic-lab-active-album-panel"
								>
									<label className="mosaic-lab__field mosaic-lab__field--full">
										<span>Name</span>
										<input
											className="mosaic-lab__input"
											data-testid="mosaic-lab-active-album-name-input"
											type="text"
											value={activeAlbum.name}
											onChange={(event) =>
												updateAlbum(activeAlbum.id, {
													name: event.target.value,
												})
											}
										/>
									</label>
									<label className="mosaic-lab__field">
										<span>Photo count</span>
										<input
											className="mosaic-lab__input"
											data-testid="mosaic-lab-active-album-count-input"
											type="number"
											min={MOSAIC_LAB_SAMPLE_ALBUM_MIN_PHOTO_COUNT}
											max={MOSAIC_LAB_SAMPLE_ALBUM_MAX_PHOTO_COUNT}
											value={activeAlbum.photoCount}
											onChange={(event) =>
												updateAlbum(activeAlbum.id, {
													photoCount: clampMosaicLabSampleAlbumPhotoCount(
														event.target.valueAsNumber,
													),
												})
											}
										/>
									</label>
									<label className="mosaic-lab__field">
										<span>Aspect profile</span>
										<select
											className="mosaic-lab__select"
											data-testid="mosaic-lab-active-album-profile-select"
											value={activeAlbum.aspectProfileKey}
											onChange={(event) =>
												updateAlbum(activeAlbum.id, {
													aspectProfileKey: event.target
														.value as MosaicLabSampleAlbum["aspectProfileKey"],
												})
											}
										>
											{MOSAIC_LAB_ASPECT_PROFILE_DEFINITIONS.map((profile) => (
												<option key={profile.key} value={profile.key}>
													{profile.name}
												</option>
											))}
										</select>
									</label>
									<label className="mosaic-lab__field mosaic-lab__field--full">
										<span>Seed</span>
										<div className="mosaic-lab__field-inline">
											<input
												className="mosaic-lab__input"
												data-testid="mosaic-lab-active-album-seed-input"
												type="text"
												value={activeAlbum.seed}
												onChange={(event) =>
													updateAlbum(activeAlbum.id, {
														seed: event.target.value,
													})
												}
											/>
											<button
												className="mosaic-lab__link"
												data-testid="mosaic-lab-active-album-seed-regenerate"
												type="button"
												onClick={() =>
													updateAlbum(activeAlbum.id, {
														seed: createSeedToken(),
													})
												}
											>
												Regenerate
											</button>
										</div>
									</label>
								</div>
							</>
						) : (
							<p className="mosaic-lab__body">
								Select an album to edit its session-local settings.
							</p>
						)}
					</div>

					<div className="mosaic-lab__panel-block">
						<p className="mosaic-lab__panel-eyebrow">Failure hints</p>
						<ul className="mosaic-lab__hint-list">
							{selectedFailureHints.map((hint) => (
								<li key={hint}>{hint}</li>
							))}
						</ul>
					</div>
				</aside>
			</div>

			{focusedPhoto && (
				<FocusedPhotoLightbox
					photo={focusedPhoto}
					onClose={() => setFocusedPhoto(null)}
					mediaSourceResolver={syntheticMediaSourceResolver}
				/>
			)}
		</main>
	);
}
