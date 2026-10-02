import {
	expect,
	test,
	type Locator,
	type Page,
	type TestInfo,
} from "@playwright/test";

test.describe("wheel momentum", () => {
	test("adds a short two-axis inertial tail after direct wheel panning", async ({
		page,
	}, testInfo: TestInfo) => {
		await openReadyWall(page);
		const wall = page.getByTestId("wall-canvas");
		const before = await cameraPosition(wall);

		await dispatchWheel(wall, { deltaX: 80, deltaY: 120 });

		await expect
			.poll(async () => (await cameraPosition(wall)).x)
			.toBeGreaterThan(before.x + 90);
		await expect
			.poll(async () => (await cameraPosition(wall)).y)
			.toBeGreaterThan(before.y + 130);

		const screenshotPath = testInfo.outputPath("wheel-momentum.png");
		await page.screenshot({ path: screenshotPath, fullPage: false });
		await testInfo.attach("wheel-momentum", {
			path: screenshotPath,
			contentType: "image/png",
		});
	});

	test("does not add an inertial tail when reduced motion is requested", async ({
		page,
	}) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await openReadyWall(page);
		const wall = page.getByTestId("wall-canvas");
		const before = await cameraPosition(wall);

		await dispatchWheel(wall, { deltaX: 80, deltaY: 120 });
		await expect
			.poll(async () => (await cameraPosition(wall)).y)
			.toBe(before.y + 120);
		await page.waitForTimeout(250);

		expect(await cameraPosition(wall)).toEqual({
			x: before.x + 80,
			y: before.y + 120,
		});
	});

	test("stops an active inertial tail when reduced motion is enabled", async ({
		page,
	}) => {
		await openReadyWall(page);
		const wall = page.getByTestId("wall-canvas");
		const before = await cameraPosition(wall);

		await dispatchWheel(wall, { deltaX: 0, deltaY: 500 });
		await expect
			.poll(async () => (await cameraPosition(wall)).y)
			.toBeGreaterThan(before.y + 500);

		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.waitForTimeout(50);
		const cancelledAt = await cameraPosition(wall);
		await page.waitForTimeout(250);

		expect(await cameraPosition(wall)).toEqual(cancelledAt);
	});
});

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

async function dispatchWheel(
	wall: Locator,
	delta: { deltaX: number; deltaY: number },
): Promise<void> {
	await wall.evaluate((element, wheelDelta) => {
		element.dispatchEvent(
			new WheelEvent("wheel", {
				bubbles: true,
				cancelable: true,
				deltaX: wheelDelta.deltaX,
				deltaY: wheelDelta.deltaY,
			}),
		);
	}, delta);
}

async function cameraPosition(
	wall: Locator,
): Promise<{ x: number; y: number }> {
	return {
		x: Number.parseFloat((await wall.getAttribute("data-camera-x")) ?? "0"),
		y: Number.parseFloat((await wall.getAttribute("data-camera-y")) ?? "0"),
	};
}
