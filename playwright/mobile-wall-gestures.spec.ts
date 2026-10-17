import {
	expect,
	test,
	type Locator,
	type Page,
	type TestInfo,
} from "@playwright/test";

test.describe("mobile wall gestures", () => {
	test.beforeEach(async ({ page, isMobile }) => {
		test.skip(!isMobile, "touch gestures are intentionally mobile-only");
		await page.goto("/");
		await expect(page.getByTestId("wall-shell")).toHaveAttribute(
			"data-screen",
			"ready",
			{
				timeout: 60_000,
			},
		);
		await expect(page.getByTestId("wall-photo-tile").first()).toBeVisible();
	});

	test("continues panning briefly after a single-finger drag release", async ({
		page,
	}) => {
		const wall = page.getByTestId("wall-canvas");

		// Stay above the debug overlay and zoom controls, which intentionally
		// intercept gestures instead of passing them through to the wall.
		const atRelease = await performTouchDrag(
			page,
			{ x: 280, y: 180 },
			{ x: 80, y: 120 },
		);

		// Pointer-event coalescing can vary direct travel, but not eliminate
		// the clearly perceptible post-release tail.
		await expect
			.poll(async () => (await cameraPosition(wall)).x)
			.toBeGreaterThan(atRelease.x + 20);
	});

	test("coasts materially farther after a fast flick than a slow drag", async ({
		page,
	}, testInfo) => {
		const wall = page.getByTestId("wall-canvas");
		const slowRelease = await performTouchDrag(
			page,
			{ x: 120, y: 180 },
			{ x: 40, y: 120 },
			120,
		);
		await page.waitForTimeout(500);
		const slowTail = Math.abs((await cameraPosition(wall)).x - slowRelease.x);

		const fastRelease = await performTouchDrag(
			page,
			{ x: 80, y: 180 },
			{ x: 280, y: 120 },
		);
		await page.waitForTimeout(500);
		const fastTail = Math.abs((await cameraPosition(wall)).x - fastRelease.x);

		expect(slowTail).toBeLessThan(12);
		expect(fastTail).toBeGreaterThan(slowTail * 2);
		expect(fastTail).toBeGreaterThan(40);
		console.log("Mobile fling distances (CSS px):", { slowTail, fastTail });
		await testInfo.attach("fling-distances", {
			body: JSON.stringify({ slowTail, fastTail }), contentType: "application/json",
		});
		const screenshot = testInfo.outputPath("mobile-fling.png");
		await page.screenshot({ path: screenshot });
		await testInfo.attach("mobile-fling", { path: screenshot, contentType: "image/png" });
	});

	for (const grouped of [false, true]) {
		test(`stops slow release, honors pause and reduced motion (${grouped ? "grouped" : "stream"})`, async ({ page }) => {
			if (grouped) {
				await page.getByTestId("controls-trigger").click();
				await page.getByTestId("controls-year-2024").click();
				await page.getByTestId("controls-trigger").click();
			}
			const wall = page.getByTestId("wall-canvas");
			await expect(wall).toHaveAttribute("data-layout-mode", grouped ? "grouped" : "single");
			const slow = await performTouchDrag(page, { x: 120, y: 180 }, { x: 40, y: 120 }, 120);
			await page.waitForTimeout(150);
			const stopped = await cameraPosition(wall);
			expect(Math.abs(stopped.x - slow.x)).toBeLessThan(12);
			await page.waitForTimeout(150);
			expect(await cameraPosition(wall)).toEqual(stopped);
			const paused = await performTouchDrag(page, { x: 280, y: 180 }, { x: 80, y: 180 }, 16, 200);
			await page.waitForTimeout(250);
			expect(await cameraPosition(wall)).toEqual(paused);
			await page.emulateMedia({ reducedMotion: "reduce" });
			const reduced = await performTouchDrag(page, { x: 80, y: 180 }, { x: 280, y: 180 });
			await page.waitForTimeout(250);
			expect(await cameraPosition(wall)).toEqual(reduced);
			await expect(page.getByTestId("focused-photo-modal")).toHaveCount(0);
		});

		test(`new touch catches an active fling after zoom (${grouped ? "grouped" : "stream"})`, async ({ page }) => {
			if (grouped) {
				await page.getByTestId("controls-trigger").click();
				await page.getByTestId("controls-year-2024").click();
				await page.getByTestId("controls-trigger").click();
			}
			const wall = page.getByTestId("wall-canvas");
			await expect(wall).toHaveAttribute("data-layout-mode", grouped ? "grouped" : "single");
			// Set up non-default zoom through keyboard activation: the existing
			// debug overlay covers the mobile button's pointer target.
			const zoomIn = page.getByRole("button", { name: "Zoom in", exact: true });
			await zoomIn.focus();
			await zoomIn.press("Enter");
			await zoomIn.press("Enter");
			await expect(wall).not.toHaveAttribute("data-zoom", "1.00");
			const release = await performTouchDrag(page, { x: 280, y: 180 }, { x: 80, y: 180 });
			await expect.poll(async () => (await cameraPosition(wall)).x).toBeGreaterThan(release.x + 10);
			const client = await page.context().newCDPSession(page);
			await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 180, y: 180, id: 61 }] });
			await page.waitForTimeout(50);
			const caught = await cameraPosition(wall);
			await page.waitForTimeout(250);
			expect(await cameraPosition(wall)).toEqual(caught);
			await client.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
			await client.detach();
		});
	}

	for (const grouped of [false, true]) {
		test(`fling glides forward without backward jitter (${grouped ? "grouped" : "stream"})`, async ({ page }) => {
			if (grouped) {
				await page.getByTestId("controls-trigger").click();
				await page.getByTestId("controls-year-2024").click();
				await page.getByTestId("controls-trigger").click();
			}
			const wall = page.getByTestId("wall-canvas");
			await expect(wall).toHaveAttribute("data-layout-mode", grouped ? "grouped" : "single");
			// Sample the rendered camera every frame through the glide.
			await wall.evaluate((element) => {
				const samples: number[] = [];
				(window as unknown as { __flingSamples: number[] }).__flingSamples = samples;
				const sample = () => {
					samples.push(Number(element.getAttribute("data-camera-x")));
					if (samples.length < 240) requestAnimationFrame(sample);
				};
				requestAnimationFrame(sample);
			});
			const release = await performTouchDrag(page, { x: 280, y: 180 }, { x: 80, y: 180 });
			await expect.poll(async () => (await cameraPosition(wall)).x).toBeGreaterThan(release.x + 20);
			await page.waitForTimeout(1500);
			const samples = await page.evaluate(
				() => (window as unknown as { __flingSamples: number[] }).__flingSamples,
			);
			const backwardSteps = samples.filter((x, index) => index > 0 && x < samples[index - 1]!);
			expect(backwardSteps).toEqual([]);
		});
	}

	test("does not open or fling a photo gesture that becomes a pinch", async ({
		page,
	}) => {
		const wall = page.getByTestId("wall-canvas");
		await performPinch(page);
		await page.waitForTimeout(50);
		const afterPinch = await cameraPosition(wall);
		await page.waitForTimeout(250);

		await expect(page.getByTestId("focused-photo-modal")).toHaveCount(0);
		expect(await cameraPosition(wall)).toEqual(afterPinch);
	});

	test("opens a photo whose tile overlaps a later row hit region", async ({
		page,
	}, testInfo: TestInfo) => {
		const candidate = await findTileOverlappedByLaterRow(page);
		expect(candidate).not.toBeNull();
		if (!candidate) return;

		await page.touchscreen.tap(candidate.x, candidate.y);

		const modal = page.getByTestId("focused-photo-modal");
		await expect(modal).toBeVisible();
		await expect(modal).toHaveAttribute("data-photo-id", candidate.photoId);

		const screenshotPath = testInfo.outputPath("mobile-tap-focused-photo.png");
		await page.screenshot({ path: screenshotPath, fullPage: false });
		await testInfo.attach("mobile-tap-focused-photo", {
			path: screenshotPath,
			contentType: "image/png",
		});
	});
});

async function performTouchDrag(
	page: Page,
	start: { x: number; y: number },
	end: { x: number; y: number },
	stepDelayMs = 16,
	pauseBeforeReleaseMs = 0,
): Promise<{ x: number; y: number }> {
	const client = await page.context().newCDPSession(page);
	const touchPoint = (point: { x: number; y: number }) => ({
		...point,
		id: 41,
		radiusX: 6,
		radiusY: 6,
		force: 1,
	});

	await client.send("Input.dispatchTouchEvent", {
		type: "touchStart",
		touchPoints: [touchPoint(start)],
	});
	for (const progress of [0.2, 0.4, 0.6, 0.8, 1]) {
		await page.waitForTimeout(stepDelayMs);
		await client.send("Input.dispatchTouchEvent", {
			type: "touchMove",
			touchPoints: [
				touchPoint({
					x: start.x + (end.x - start.x) * progress,
					y: start.y + (end.y - start.y) * progress,
				}),
			],
		});
	}
	// Wait for the direct-pan publisher, otherwise its last delta is counted as
	// fling distance even when momentum is disabled.
	await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
	if (pauseBeforeReleaseMs > 0) await page.waitForTimeout(pauseBeforeReleaseMs);
	const atRelease = await cameraPosition(page.getByTestId("wall-canvas"));
	await client.send("Input.dispatchTouchEvent", {
		type: "touchEnd",
		touchPoints: [],
	});
	await client.detach();
	return atRelease;
}

async function performPinch(page: Page): Promise<void> {
	const client = await page.context().newCDPSession(page);
	const point = (id: number, x: number) => ({
		id,
		x,
		y: 240,
		radiusX: 6,
		radiusY: 6,
		force: 1,
	});

	await client.send("Input.dispatchTouchEvent", {
		type: "touchStart",
		touchPoints: [point(51, 150)],
	});
	await client.send("Input.dispatchTouchEvent", {
		type: "touchStart",
		touchPoints: [point(51, 150), point(52, 250)],
	});
	await client.send("Input.dispatchTouchEvent", {
		type: "touchMove",
		touchPoints: [point(51, 110), point(52, 290)],
	});
	await client.send("Input.dispatchTouchEvent", {
		type: "touchEnd",
		touchPoints: [],
	});
	await client.detach();
}

async function cameraPosition(
	wall: Locator,
): Promise<{ x: number; y: number }> {
	return {
		x: Number.parseFloat((await wall.getAttribute("data-camera-x")) ?? "0"),
		y: Number.parseFloat((await wall.getAttribute("data-camera-y")) ?? "0"),
	};
}

async function findTileOverlappedByLaterRow(page: Page): Promise<{
	photoId: string;
	x: number;
	y: number;
} | null> {
	return page.getByTestId("wall-photo-tile").evaluateAll((tiles) => {
		const rows = Array.from(
			document.querySelectorAll<HTMLElement>(".wall-canvas__row"),
		);
		const controls = Array.from(
			document.querySelectorAll<HTMLElement>(".wall-zoom-controls button"),
		).map((control) => control.getBoundingClientRect());

		for (const tile of tiles) {
			if (
				!(tile instanceof HTMLElement) ||
				!(tile.parentElement instanceof HTMLElement)
			)
				continue;
			const tileRect = tile.getBoundingClientRect();
			if (
				tileRect.width < 40 ||
				tileRect.height < 40 ||
				tileRect.right <= 0 ||
				tileRect.bottom <= 0 ||
				tileRect.left >= window.innerWidth ||
				tileRect.top >= window.innerHeight
			)
				continue;

			const x = tileRect.left + tileRect.width / 2;
			const y = tileRect.top + tileRect.height / 2;
			if (
				controls.some(
					(rect) =>
						x >= rect.left &&
						x <= rect.right &&
						y >= rect.top &&
						y <= rect.bottom,
				)
			) {
				continue;
			}

			const ownRowIndex = rows.indexOf(tile.parentElement);
			const overlapsLaterRow = rows.slice(ownRowIndex + 1).some((row) => {
				const rect = row.getBoundingClientRect();
				return (
					x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
				);
			});
			if (!overlapsLaterRow) continue;

			const photoId = tile.dataset["photoId"];
			if (photoId) return { photoId, x, y };
		}
		return null;
	});
}
