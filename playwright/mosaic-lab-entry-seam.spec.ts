import { writeFileSync } from "node:fs";
import {
	expect,
	test,
	type Locator,
	type Page,
	type TestInfo,
} from "@playwright/test";

test.describe("Mosaic Lab wall-first contract", () => {
	test.describe.configure({ timeout: 60_000 });

	let consoleErrors: string[];

	test.beforeEach(async ({ page }) => {
		consoleErrors = [];

		page.on("console", (message) => {
			if (message.type() === "error") {
				consoleErrors.push(message.text());
			}
		});
		page.on("pageerror", (error) => {
			consoleErrors.push(error.message);
		});
	});

	test.afterEach(async () => {
		expect(consoleErrors).toEqual([]);
	});

	test("opens the real wall by default, enters Mosaic Lab from controls, and returns to the wall", async ({
		page,
	}, testInfo: TestInfo) => {
		await openReadyWall(page);

		await expect(page).toHaveURL(/(?:#wall)?$/);
		await expect(page.getByTestId("wall-shell")).toBeVisible();
		await expect(page.getByTestId("mosaic-lab-shell")).toHaveCount(0);

		await openMosaicLab(page);

		const labShell = page.getByTestId("mosaic-lab-shell");
		const labWall = page.getByTestId("wall-canvas");

		await assertDefaultLabContract(page);
		await expect(labWall).toHaveAttribute("data-layout-mode", "grouped");
		await expect(labWall).toHaveAttribute("data-active-album-area-count", "2");
		await expect(page.getByTestId("wall-photo-tile").first()).toBeVisible();

		const groupedScreenshotPath = testInfo.outputPath(
			"mosaic-lab-grouped-default.png",
		);
		await page.screenshot({ path: groupedScreenshotPath, fullPage: false });
		await testInfo.attach("mosaic-lab-grouped-default", {
			path: groupedScreenshotPath,
			contentType: "image/png",
		});

		await page.getByTestId("mosaic-lab-return").click();
		await expect(page).toHaveURL(/#wall$/);
		await expect(page.getByTestId("wall-shell")).toHaveAttribute(
			"data-screen",
			"ready",
			{ timeout: 60_000 },
		);
		await expect(page.getByTestId("wall-photo-tile").first()).toBeVisible();
		await expect(labShell).toHaveCount(0);

		const proofSummaryPath = testInfo.outputPath(
			"mosaic-lab-entry-return.json",
		);
		writeFileSync(
			proofSummaryPath,
			`${JSON.stringify(
				{
					entryUrl: "#mosaic-lab",
					finalUrl: page.url(),
					finalWallScreen: await page
						.getByTestId("wall-shell")
						.getAttribute("data-screen"),
					groupedScreenshotPath,
				},
				null,
				2,
			)}\n`,
			"utf8",
		);
		await testInfo.attach("mosaic-lab-entry-return", {
			path: proofSummaryPath,
			contentType: "application/json",
		});
	});

	test("creates, edits, duplicates, and narrows Mosaic Lab albums down to guarded single mode", async ({
		page,
	}, testInfo: TestInfo) => {
		await openMosaicLab(page);

		const labShell = page.getByTestId("mosaic-lab-shell");
		const labWall = page.getByTestId("wall-canvas");

		await page
			.getByTestId("mosaic-lab-create-preset-select")
			.selectOption("tiny-album");
		await page.getByTestId("mosaic-lab-create-album").click();

		await expect(labShell).toHaveAttribute("data-selected-album-count", "3");
		await expect(labShell).toHaveAttribute("data-generated-photo-count", "139");
		await expect(
			page.getByTestId("mosaic-lab-active-album-name-input"),
		).toHaveValue("Tiny Album Draft");
		await expect(
			page.getByTestId("mosaic-lab-selected-album-names"),
		).toContainText("Tiny Album Draft");

		const snapshotBeforeEdit = await requiredAttr(labShell, "data-snapshot-id");
		const aspectDistributionBeforeEdit = await page
			.getByTestId("mosaic-lab-aspect-distribution")
			.innerText();

		await setInputValue(
			page.getByTestId("mosaic-lab-active-album-name-input"),
			"Tiny Stress Study",
		);
		await expect(
			page.getByTestId("mosaic-lab-selected-album-names"),
		).toContainText("Tiny Stress Study");
		await expect(
			page.getByTestId("mosaic-lab-album-edit-user-tiny-album-draft"),
		).toContainText("Tiny Stress Study");

		await setInputValue(
			page.getByTestId("mosaic-lab-active-album-count-input"),
			"11",
		);
		await expect(labShell).toHaveAttribute("data-generated-photo-count", "141");
		await expect(
			page.getByTestId("mosaic-lab-generated-photo-count"),
		).toContainText("Photos · 141");
		await expect(page.getByTestId("mosaic-lab-packed-summary")).toContainText(
			"141 packed tiles",
		);

		await page
			.getByTestId("mosaic-lab-active-album-profile-select")
			.selectOption("phone-weird");
		await expect
			.poll(async () =>
				page.getByTestId("mosaic-lab-aspect-distribution").innerText(),
			)
			.not.toBe(aspectDistributionBeforeEdit);

		await setInputValue(
			page.getByTestId("mosaic-lab-active-album-seed-input"),
			"tiny-seed-a",
		);
		await expect(page.getByTestId("mosaic-lab-seed-summary")).toHaveText(
			"tiny-seed-a",
		);
		await expect
			.poll(async () => requiredAttr(labShell, "data-snapshot-id"))
			.not.toBe(snapshotBeforeEdit);

		await page.getByTestId("mosaic-lab-duplicate-album").click();
		await expect(
			page.getByTestId("mosaic-lab-active-album-name-input"),
		).toHaveValue("Tiny Stress Study Copy");
		await expect(labShell).toHaveAttribute("data-selected-album-count", "4");
		await expect(labShell).toHaveAttribute("data-generated-photo-count", "152");
		await expect(
			page.getByTestId("mosaic-lab-selected-album-names"),
		).toContainText("Tiny Stress Study Copy");

		await toggleAlbumSelection(page, "panorama-heavy");
		await toggleAlbumSelection(page, "user-tiny-album-draft");
		await toggleAlbumSelection(page, "user-tiny-album-draft-copy");

		await expect(labShell).toHaveAttribute("data-selected-album-count", "1");
		await expect(labShell).toHaveAttribute("data-layout-mode", "single");
		await expect(labShell).toHaveAttribute("data-generated-photo-count", "72");
		await expect(labWall).toHaveAttribute("data-layout-mode", "single");
		await expect(labWall).toHaveAttribute("data-active-album-area-count", "1");
		await expect(page.getByTestId("mosaic-lab-layout-mode")).toContainText(
			"Layout · single",
		);
		await expect(
			page.getByTestId("mosaic-lab-selected-album-names"),
		).toHaveText("Mixed Vacation");

		await toggleAlbumSelection(page, "mixed-vacation");
		await expect(
			page.getByTestId("mosaic-lab-album-select-mixed-vacation"),
		).toHaveAttribute("data-selected", "true");
		await expect(labShell).toHaveAttribute("data-selected-album-count", "1");
		await expect(labShell).toHaveAttribute("data-layout-mode", "single");

		const proofSummaryPath = testInfo.outputPath("mosaic-lab-edit-flow.json");
		writeFileSync(
			proofSummaryPath,
			`${JSON.stringify(
				{
					snapshotBeforeEdit,
					snapshotAfterEdit: await requiredAttr(labShell, "data-snapshot-id"),
					selectedAlbumNames: await page
						.getByTestId("mosaic-lab-selected-album-names")
						.innerText(),
					layoutMode: await labShell.getAttribute("data-layout-mode"),
					generatedPhotoCount: await labShell.getAttribute(
						"data-generated-photo-count",
					),
				},
				null,
				2,
			)}\n`,
			"utf8",
		);
		await testInfo.attach("mosaic-lab-edit-flow", {
			path: proofSummaryPath,
			contentType: "application/json",
		});
	});

	test("keeps uniform-input albums structurally varied through the production wall", async ({
		page,
	}, testInfo: TestInfo) => {
		await openMosaicLab(page);

		const labShell = page.getByTestId("mosaic-lab-shell");
		const evidence: Record<string, TileStructureEvidence> = {};

		await toggleAlbumSelection(page, "all-landscape");
		await toggleAlbumSelection(page, "mixed-vacation");
		await toggleAlbumSelection(page, "panorama-heavy");
		await expect(labShell).toHaveAttribute("data-layout-mode", "single");
		await expect(labShell).toHaveAttribute("data-generated-photo-count", "64");
		evidence.allLandscape = await assertStructuredUniformAlbum(page);

		await toggleAlbumSelection(page, "all-portrait");
		await toggleAlbumSelection(page, "all-landscape");
		await expect(labShell).toHaveAttribute("data-layout-mode", "single");
		await expect(labShell).toHaveAttribute("data-generated-photo-count", "64");
		evidence.allPortrait = await assertStructuredUniformAlbum(page);

		const screenshotPath = testInfo.outputPath(
			"mosaic-lab-uniform-input-structure.png",
		);
		await page.screenshot({ path: screenshotPath, fullPage: false });
		await testInfo.attach("mosaic-lab-uniform-input-structure", {
			path: screenshotPath,
			contentType: "image/png",
		});

		const evidencePath = testInfo.outputPath(
			"mosaic-lab-uniform-input-structure.json",
		);
		writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
		await testInfo.attach("mosaic-lab-uniform-input-evidence", {
			path: evidencePath,
			contentType: "application/json",
		});
	});

	test("opens a focused synthetic modal with a data URL source and never hits backend lab media routes", async ({
		page,
	}, testInfo: TestInfo) => {
		const syntheticMediaRequests: string[] = [];
		const syntheticMediaResponses: Array<{ url: string; status: number }> = [];

		page.on("request", (request) => {
			const url = request.url();
			if (isSyntheticBackendMediaUrl(url)) {
				syntheticMediaRequests.push(url);
			}
		});
		page.on("response", (response) => {
			const url = response.url();
			if (isSyntheticBackendMediaUrl(url)) {
				syntheticMediaResponses.push({ url, status: response.status() });
			}
		});

		await openMosaicLab(page);

		const tile = await pickClickableTile(page);
		const syntheticPhotoId = await requiredAttr(tile, "data-photo-id");
		expect(syntheticPhotoId.startsWith("lab:")).toBe(true);

		await tile.click();

		const modal = page.getByTestId("focused-photo-modal");
		await expect(modal).toBeVisible();
		await expect(modal).toHaveAttribute("data-photo-id", syntheticPhotoId);
		const focusedPhotoImage = page.getByTestId("focused-photo-image");
		await expect(focusedPhotoImage).toHaveAttribute(
			"src",
			/^data:image\/svg\+xml/i,
		);
		const imageSource = await focusedPhotoImage.getAttribute("src");

		const modalScreenshotPath = testInfo.outputPath(
			"mosaic-lab-focused-synthetic-modal.png",
		);
		await page.screenshot({ path: modalScreenshotPath, fullPage: false });
		await testInfo.attach("mosaic-lab-focused-synthetic-modal", {
			path: modalScreenshotPath,
			contentType: "image/png",
		});

		expect(syntheticMediaRequests).toEqual([]);
		expect(syntheticMediaResponses).toEqual([]);

		await page.getByTestId("focused-photo-close").click();
		await expect(modal).toHaveCount(0);

		const proofSummaryPath = testInfo.outputPath(
			"mosaic-lab-synthetic-media-proof.json",
		);
		writeFileSync(
			proofSummaryPath,
			`${JSON.stringify(
				{
					syntheticPhotoId,
					syntheticMediaRequests,
					syntheticMediaResponses,
					imageSource,
				},
				null,
				2,
			)}\n`,
			"utf8",
		);
		await testInfo.attach("mosaic-lab-synthetic-media-proof", {
			path: proofSummaryPath,
			contentType: "application/json",
		});
	});
});

interface TileStructureEvidence {
	mountedTileCount: number;
	uniqueFootprintCount: number;
	uniqueWidthCount: number;
	uniqueHeightCount: number;
}

async function assertStructuredUniformAlbum(
	page: Page,
): Promise<TileStructureEvidence> {
	await expect(page.getByTestId("mosaic-lab-packed-summary")).toContainText(
		"64 packed tiles",
	);
	const tiles = page.getByTestId("wall-photo-tile");
	await expect.poll(async () => tiles.count()).toBeGreaterThan(8);

	const dimensions = await tiles.evaluateAll((nodes) =>
		nodes.map((node) => {
			const element = node as HTMLElement;
			return {
				width: Math.round(Number.parseFloat(element.style.width)),
				height: Math.round(Number.parseFloat(element.style.height)),
			};
		}),
	);
	const evidence = {
		mountedTileCount: dimensions.length,
		uniqueFootprintCount: new Set(
			dimensions.map(({ width, height }) => `${width}x${height}`),
		).size,
		uniqueWidthCount: new Set(dimensions.map(({ width }) => width)).size,
		uniqueHeightCount: new Set(dimensions.map(({ height }) => height)).size,
	};

	expect(evidence.mountedTileCount).toBeGreaterThan(8);
	expect(evidence.uniqueFootprintCount).toBeGreaterThan(1);
	expect(evidence.uniqueWidthCount).toBeGreaterThan(1);
	expect(evidence.uniqueHeightCount).toBeGreaterThan(1);
	return evidence;
}

async function openReadyWall(page: Page): Promise<void> {
	await page.goto("/");
	await expect(page.getByTestId("wall-shell")).toHaveAttribute(
		"data-screen",
		"ready",
		{
			timeout: 60_000,
		},
	);
	await expect(page.getByTestId("wall-photo-tile").first()).toBeVisible();
}

async function openControls(page: Page): Promise<void> {
	const trigger = page.getByTestId("controls-trigger");
	await trigger.click();
	await expect(page.getByTestId("controls-panel")).toBeVisible();
}

async function openMosaicLab(page: Page): Promise<void> {
	await openReadyWall(page);
	await openControls(page);
	await page.getByTestId("controls-open-mosaic-lab").click();
	await expect(page).toHaveURL(/#mosaic-lab$/);
	await expect(page.getByTestId("mosaic-lab-shell")).toBeVisible();
	await expect(page.getByTestId("wall-photo-tile").first()).toBeVisible();
}

async function assertDefaultLabContract(page: Page): Promise<void> {
	const labShell = page.getByTestId("mosaic-lab-shell");

	await expect(labShell).toHaveAttribute(
		"data-lab-renderer",
		"production-wall",
	);
	await expect(page.getByTestId("mosaic-lab-wall-sandbox")).toHaveAttribute(
		"data-lab-renderer",
		"production-wall",
	);
	await expect(
		page.getByText("Mosaic Lab · synthetic mockup only"),
	).toBeVisible();
	await expect(page.getByText("Production wall sandbox")).toBeVisible();
	await expect(page.getByTestId("mosaic-lab-return")).toBeVisible();
	await expect(labShell).toHaveAttribute("data-layout-mode", "grouped");
	await expect(labShell).toHaveAttribute("data-selected-album-count", "2");
	await expect(labShell).toHaveAttribute("data-generated-photo-count", "130");
	await expect(
		page.getByTestId("mosaic-lab-selected-album-count"),
	).toContainText("Albums · 2");
	await expect(
		page.getByTestId("mosaic-lab-generated-photo-count"),
	).toContainText("Photos · 130");
	await expect(page.getByTestId("mosaic-lab-layout-mode")).toContainText(
		"Layout · grouped",
	);
	await expect(page.getByTestId("mosaic-lab-selected-album-names")).toHaveText(
		"Mixed Vacation · Panorama Heavy",
	);
	await expect(page.getByTestId("mosaic-lab-seed-summary")).toHaveText(
		"mixed-vacation-v1",
	);
	await expect(page.getByTestId("mosaic-lab-packed-summary")).toContainText(
		"130 packed tiles",
	);
	await expect(page.getByTestId("mosaic-lab-world-summary")).toHaveText(
		/\d+ × \d+ px/,
	);
	await expect(page.getByTestId("mosaic-lab-deferred-metrics")).toContainText(
		"deferred",
	);
}

async function setInputValue(locator: Locator, value: string): Promise<void> {
	await locator.evaluate((node, nextValue) => {
		const input = node as HTMLInputElement;
		const descriptor = Object.getOwnPropertyDescriptor(
			window.HTMLInputElement.prototype,
			"value",
		);
		descriptor?.set?.call(input, nextValue);
		input.dispatchEvent(new Event("input", { bubbles: true }));
		input.dispatchEvent(new Event("change", { bubbles: true }));
	}, value);
}

async function toggleAlbumSelection(
	page: Page,
	albumId: string,
): Promise<void> {
	const toggle = page.getByTestId(`mosaic-lab-album-select-${albumId}`);
	await toggle.evaluate((node) => {
		(node as HTMLButtonElement).click();
	});
}

async function pickClickableTile(page: Page): Promise<Locator> {
	const tiles = page.getByTestId("wall-photo-tile");
	const index = await tiles.evaluateAll((nodes) => {
		const viewportCenterX = window.innerWidth / 2;
		const viewportCenterY = window.innerHeight / 2;
		let bestIndex = -1;
		let bestScore = Number.POSITIVE_INFINITY;

		nodes.forEach((node, index) => {
			if (!(node instanceof HTMLElement)) {
				return;
			}

			const rect = node.getBoundingClientRect();
			if (rect.width < 40 || rect.height < 40) {
				return;
			}

			const visibleWidth =
				Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0);
			const visibleHeight =
				Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
			if (
				visibleWidth < rect.width * 0.6 ||
				visibleHeight < rect.height * 0.6
			) {
				return;
			}

			const centerX = rect.left + rect.width / 2;
			const centerY = rect.top + rect.height / 2;
			const topNode = document.elementFromPoint(centerX, centerY);
			if (!(topNode instanceof Element) || !node.contains(topNode)) {
				return;
			}

			const dx = centerX - viewportCenterX;
			const dy = centerY - viewportCenterY;
			const score = dx * dx + dy * dy;
			if (score < bestScore) {
				bestScore = score;
				bestIndex = index;
			}
		});

		return bestIndex;
	});

	if (index < 0) {
		throw new Error("Expected a clickable Mosaic Lab wall tile");
	}

	return tiles.nth(index);
}

async function requiredAttr(locator: Locator, name: string): Promise<string> {
	const value = await locator.getAttribute(name);
	if (!value) {
		throw new Error(`Expected ${name} on ${locator.toString()}`);
	}
	return value;
}

function isSyntheticBackendMediaUrl(url: string): boolean {
	return /\/api\/media\/(?:lab:|lab%3A)/i.test(url);
}
