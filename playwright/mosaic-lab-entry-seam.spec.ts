import { writeFileSync } from 'node:fs';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

type StarterRecipeKey = 'all-landscape' | 'all-portrait' | 'mixed' | 'weird';
type WorldOrientation = 'landscape' | 'portrait';

interface ScenarioExpectation {
  key: StarterRecipeKey;
  name: string;
  activeArchetypes: string;
  sourcePoolText: string;
  sourceOrientationTexts: readonly string[];
  sourceFamilyTexts?: readonly string[];
  footprintTexts: readonly string[];
  worldOrientation: WorldOrientation;
}

interface ScenarioEvidence {
  key: StarterRecipeKey;
  name: string;
  screenshotPath: string;
  sourceArchetypesText: string;
  placementFootprintsText: string;
  antiGridSeamsText: string;
  sourceSignalsText: string;
  placementSignalsText: string;
  stage: Awaited<ReturnType<typeof readStageState>>;
}

const STARTER_SCENARIOS: readonly ScenarioExpectation[] = [
  {
    key: 'all-landscape',
    name: 'All Landscape',
    activeArchetypes: '1 active',
    sourcePoolText: '50 sources',
    sourceOrientationTexts: ['landscape: 50'],
    sourceFamilyTexts: ['standard: 50'],
    footprintTexts: ['3 unique', 'Square rescue', 'Standard landscape', 'Large landscape'],
    worldOrientation: 'landscape',
  },
  {
    key: 'all-portrait',
    name: 'All Portrait',
    activeArchetypes: '1 active',
    sourcePoolText: '50 sources',
    sourceOrientationTexts: ['portrait: 50'],
    sourceFamilyTexts: ['standard: 50'],
    footprintTexts: ['3 unique', 'Square rescue', 'Standard portrait', 'Large portrait'],
    worldOrientation: 'portrait',
  },
  {
    key: 'mixed',
    name: 'Mixed',
    activeArchetypes: '2 active',
    sourcePoolText: '50 sources',
    sourceOrientationTexts: ['landscape: 25', 'portrait: 25'],
    sourceFamilyTexts: ['standard: 50'],
    footprintTexts: ['3 unique', 'Square rescue', 'Standard portrait', 'Large portrait'],
    worldOrientation: 'landscape',
  },
  {
    key: 'weird',
    name: 'Weird',
    activeArchetypes: '6 active',
    sourcePoolText: '50 sources',
    sourceOrientationTexts: ['landscape: 25', 'portrait: 17', 'square: 8'],
    sourceFamilyTexts: ['nonstandard: 32', 'standard: 18'],
    footprintTexts: ['3 unique', 'Square rescue', 'Standard portrait', 'Large portrait'],
    worldOrientation: 'landscape',
  },
] as const;

test.describe('Mosaic Lab workflow', () => {
  test('opens the lab and proves the integrated Pixi-backed workflow in-browser', async ({
    page,
  }, testInfo: TestInfo) => {
    const evidence: {
      cwd: string;
      stageInteraction: Record<string, unknown>;
      recipeEditing: Record<string, unknown>;
      scenarios: ScenarioEvidence[];
      wallReturn: Record<string, unknown>;
    } = {
      cwd: process.cwd(),
      stageInteraction: {},
      recipeEditing: {},
      scenarios: [],
      wallReturn: {},
    };

    await openReadyWall(page);

    await expect(page).not.toHaveURL(/#mosaic-lab$/);
    await expect(page.getByTestId('wall-shell')).toBeVisible();
    await expect(page.getByTestId('mosaic-lab-shell')).toHaveCount(0);

    await openControls(page);
    await expect(page.getByTestId('controls-open-mosaic-lab')).toBeVisible();
    await page.getByTestId('controls-open-mosaic-lab').click();

    await expect(page).toHaveURL(/#mosaic-lab$/);
    await expect(page.getByTestId('mosaic-lab-shell')).toBeVisible();
    await expect(page.getByText('Synthetic recipe and placement lab')).toBeVisible();
    await expect(page.getByTestId('mosaic-lab-session-summary')).toContainText('Recipe · Mixed Draft');
    await expect(page.getByTestId('mosaic-lab-session-summary')).toContainText('Diagnostics · on');
    await expect(page.getByTestId('mosaic-lab-metrics')).toBeVisible();
    await expect(page.getByTestId('mosaic-lab-metric-source-archetypes')).toBeVisible();
    await expect(page.getByTestId('mosaic-lab-metric-placement-footprints')).toBeVisible();
    await expect(page.getByTestId('mosaic-lab-metric-anti-grid-seams')).toBeVisible();
    await expect(page.getByTestId('mosaic-lab-source-recipe-signals')).toBeVisible();
    await expect(page.getByTestId('mosaic-lab-placement-structure-signals')).toBeVisible();
    await expect(page.getByTestId('mosaic-lab-pixi-stage')).toBeVisible();
    await expect(page.getByTestId('mosaic-lab-stage-diagnostics')).toBeVisible();
    await expect(page.getByTestId('mosaic-lab-metric-black-space')).toHaveText('Pass');
    await expect(page.getByTestId('mosaic-lab-metric-overlap')).toHaveText('Pass');
    await expect(page.getByTestId('mosaic-lab-shell')).toHaveAttribute(
      'data-scroll-model',
      'bounded-stage',
    );

    const shellScrollBefore = await readScrollMetrics(page.getByTestId('mosaic-lab-shell'));
    expect(shellScrollBefore.scrollTop).toBe(0);

    const windowScrollBefore = await page.evaluate(() => window.scrollY);
    const stage = page.getByTestId('mosaic-lab-pixi-stage');
    const stageBox = await boundingBoxOrThrow(stage);
    await page.mouse.move(stageBox.x + stageBox.width * 0.5, stageBox.y + stageBox.height * 0.5);

    const cameraBeforePan = await readStageState(stage);
    await dispatchWheel(stage, { deltaX: 280, deltaY: 340 });
    await expect.poll(async () => (await readStageState(stage)).moveCount).toBeGreaterThan(cameraBeforePan.moveCount);
    const cameraAfterPan = await readStageState(stage);
    expect(cameraAfterPan.x).not.toBe(cameraBeforePan.x);
    expect(cameraAfterPan.y).not.toBe(cameraBeforePan.y);

    const windowScrollAfterPan = await page.evaluate(() => window.scrollY);
    expect(windowScrollAfterPan).toBe(windowScrollBefore);

    const shellScrollAfterPan = await readScrollMetrics(page.getByTestId('mosaic-lab-shell'));
    expect(shellScrollAfterPan.scrollTop).toBe(shellScrollBefore.scrollTop);

    await dispatchWheel(stage, { deltaX: 0, deltaY: -280, shiftKey: true });

    await expect.poll(async () => (await readStageState(stage)).zoom).toBeGreaterThan(cameraAfterPan.zoom);
    const cameraAfterZoom = await readStageState(stage);
    expect(cameraAfterZoom.zoomCount).toBeGreaterThan(cameraAfterPan.zoomCount);

    await dispatchDrag(stage, {
      startXRatio: 0.5,
      startYRatio: 0.5,
      endXRatio: 0.72,
      endYRatio: 0.72,
    });

    await expect.poll(async () => (await readStageState(stage)).moveCount).toBeGreaterThan(cameraAfterZoom.moveCount);
    const cameraAfterDrag = await readStageState(stage);
    expect(cameraAfterDrag.x).not.toBe(cameraAfterZoom.x);

    for (let index = 0; index < 6; index += 1) {
      await dispatchWheel(stage, { deltaX: 900, deltaY: 900 });
    }
    const boundedCamera = await readStageState(stage);
    expect(boundedCamera.x).toBeGreaterThanOrEqual(boundedCamera.minX);
    expect(boundedCamera.x).toBeLessThanOrEqual(boundedCamera.maxX);
    expect(boundedCamera.y).toBeGreaterThanOrEqual(boundedCamera.minY);
    expect(boundedCamera.y).toBeLessThanOrEqual(boundedCamera.maxY);
    expect(Math.abs(boundedCamera.x - boundedCamera.minX)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(boundedCamera.y - boundedCamera.minY)).toBeLessThanOrEqual(1.5);

    evidence.stageInteraction = {
      shellScrollBefore,
      shellScrollAfterPan,
      windowScrollBefore,
      windowScrollAfterPan,
      cameraBeforePan,
      cameraAfterPan,
      cameraAfterZoom,
      cameraAfterDrag,
      boundedCamera,
      cameraEventsText: await page.getByTestId('mosaic-lab-camera-events').innerText(),
    };

    await expect(page.getByTestId('mosaic-lab-recipe-roster-entry-user-recipe-1')).toHaveAttribute(
      'data-selected',
      'true',
    );

    const portraitScenario = STARTER_SCENARIOS.find((scenario) => scenario.key === 'all-portrait');
    if (!portraitScenario) {
      throw new Error('Expected all-portrait scenario');
    }

    evidence.scenarios.push(await captureStarterScenario(page, testInfo, portraitScenario));
    await expect(page.getByTestId('mosaic-lab-starter-edit-note')).toBeVisible();

    await page.getByTestId('mosaic-lab-create-recipe').click();
    await expect(page.getByTestId('mosaic-lab-recipe-name-input')).toHaveValue('Recipe 2');
    await expect(page.getByTestId('mosaic-lab-selected-recipe-origin')).toHaveText('Editable recipe');
    await expect(page.getByTestId('mosaic-lab-editable-recipe-note')).toBeVisible();
    await expect(page.getByTestId('mosaic-lab-metric-recipe')).toHaveText('Recipe 2');

    await setInputValue(page.getByTestId('mosaic-lab-recipe-name-input'), 'Portrait Study A');
    await expect(page.getByTestId('mosaic-lab-metric-recipe')).toHaveText('Portrait Study A');
    await expect(page.getByTestId('mosaic-lab-session-summary')).toContainText('Recipe · Portrait Study A');
    await expect(page.getByTestId('mosaic-lab-recipe-roster-entry-user-recipe-2')).toContainText(
      'Portrait Study A',
    );
    await expect(page.getByText('Packed workspace for Portrait Study A')).toBeVisible();

    await setInputValue(page.getByTestId('mosaic-lab-source-count-source-standard-portrait'), '18');
    await expect(page.getByTestId('mosaic-lab-selected-recipe-total')).toHaveText('18 sources');
    await expect(page.getByTestId('mosaic-lab-metric-recipe')).toHaveText('Portrait Study A');
    await expect
      .poll(async () => normalizeText(await page.getByTestId('mosaic-lab-source-recipe-signals').innerText()).toLowerCase())
      .toContain('source pool 18 sources');
    await expect(page.getByTestId('mosaic-lab-pixi-stage')).toBeVisible();

    const editedStage = await readStageState(stage);
    expect(editedStage.worldHeight).toBeGreaterThan(editedStage.worldWidth);

    await page.getByTestId('mosaic-lab-duplicate-recipe').click();
    await expect(page.getByTestId('mosaic-lab-recipe-name-input')).toHaveValue('Portrait Study A Copy');
    await expect(page.getByTestId('mosaic-lab-selected-recipe-cloned-from')).toHaveText(
      'Cloned from user-recipe-2',
    );

    evidence.recipeEditing = {
      createdRecipeKey: 'user-recipe-2',
      renamedRecipe: 'Portrait Study A',
      editedSourcePool: await page.getByTestId('mosaic-lab-selected-recipe-total').innerText(),
      duplicateRecipeKey: 'user-recipe-3',
      duplicateRecipeName: await page.getByTestId('mosaic-lab-recipe-name-input').inputValue(),
      clonedFrom: await page.getByTestId('mosaic-lab-selected-recipe-cloned-from').innerText(),
      sourceSignalsText: normalizeText(await page.getByTestId('mosaic-lab-source-recipe-signals').innerText()),
      stage: editedStage,
    };

    for (const scenario of STARTER_SCENARIOS.filter((candidate) => candidate.key !== 'all-portrait')) {
      evidence.scenarios.push(await captureStarterScenario(page, testInfo, scenario));
    }

    const proofSummaryPath = testInfo.outputPath('mosaic-lab-proof-summary.json');
    writeFileSync(proofSummaryPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

    await page.getByTestId('mosaic-lab-exit').click();
    await expect(page).toHaveURL(/#wall$/);
    await expect(page.getByTestId('wall-shell')).toHaveAttribute('data-screen', 'ready', {
      timeout: 60_000,
    });
    await expect(page.getByTestId('wall-photo-tile').first()).toBeVisible();

    evidence.wallReturn = {
      url: page.url(),
      wallScreen: await page.getByTestId('wall-shell').getAttribute('data-screen'),
      firstTileVisible: await page.getByTestId('wall-photo-tile').first().isVisible(),
    };

    writeFileSync(proofSummaryPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    await testInfo.attach('mosaic-lab-proof-summary', {
      path: proofSummaryPath,
      contentType: 'application/json',
    });
  });
});

async function captureStarterScenario(
  page: Page,
  testInfo: TestInfo,
  scenario: ScenarioExpectation,
): Promise<ScenarioEvidence> {
  const stage = page.getByTestId('mosaic-lab-pixi-stage');

  await page.getByTestId(`mosaic-lab-recipe-roster-entry-${scenario.key}`).click();
  await expect(page.getByTestId(`mosaic-lab-recipe-roster-entry-${scenario.key}`)).toHaveAttribute(
    'data-selected',
    'true',
  );
  await expect(page.getByTestId('mosaic-lab-metric-recipe')).toHaveText(scenario.name);
  await expect(page.getByTestId('mosaic-lab-metric-source-archetypes')).toHaveText(
    scenario.activeArchetypes,
  );
  await expect(page.getByTestId('mosaic-lab-metric-black-space')).toHaveText('Pass');
  await expect(page.getByTestId('mosaic-lab-metric-overlap')).toHaveText('Pass');

  await expect
    .poll(async () => {
      const current = await readStageState(stage);
      return scenario.worldOrientation === 'portrait'
        ? current.worldHeight - current.worldWidth
        : current.worldWidth - current.worldHeight;
    })
    .toBeGreaterThan(0);

  const sourceSignalsText = normalizeText(await page.getByTestId('mosaic-lab-source-recipe-signals').innerText());
  const placementSignalsText = normalizeText(
    await page.getByTestId('mosaic-lab-placement-structure-signals').innerText(),
  );
  const placementFootprintsText = await readMetricCardText(page.getByTestId('mosaic-lab-metric-placement-footprints'));
  const antiGridSeamsText = await readMetricCardText(page.getByTestId('mosaic-lab-metric-anti-grid-seams'));
  const sourceArchetypesText = await readMetricCardText(page.getByTestId('mosaic-lab-metric-source-archetypes'));

  expect(sourceSignalsText).toContain(scenario.sourcePoolText);
  for (const text of scenario.sourceOrientationTexts) {
    expect(sourceSignalsText).toContain(text);
  }
  for (const text of scenario.sourceFamilyTexts ?? []) {
    expect(sourceSignalsText).toContain(text);
  }
  for (const text of scenario.footprintTexts) {
    expect(placementFootprintsText).toContain(text);
    expect(placementSignalsText).toContain(text);
  }

  const screenshotPath = testInfo.outputPath(`mosaic-lab-${scenario.key}.png`);
  await page.getByTestId('mosaic-lab-shell').screenshot({ path: screenshotPath });
  await testInfo.attach(`mosaic-lab-${scenario.key}`, {
    path: screenshotPath,
    contentType: 'image/png',
  });

  return {
    key: scenario.key,
    name: scenario.name,
    screenshotPath,
    sourceArchetypesText,
    placementFootprintsText,
    antiGridSeamsText,
    sourceSignalsText,
    placementSignalsText,
    stage: await readStageState(stage),
  };
}

async function openReadyWall(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('wall-shell')).toHaveAttribute('data-screen', 'ready', {
    timeout: 60_000,
  });
  await expect(page.getByTestId('wall-photo-tile').first()).toBeVisible();
}

async function openControls(page: Page): Promise<void> {
  const trigger = page.getByTestId('controls-trigger');
  await trigger.click();
  await expect(page.getByTestId('controls-panel')).toBeVisible();
}

async function setInputValue(locator: Locator, value: string): Promise<void> {
  await locator.evaluate((node, nextValue) => {
    const input = node as HTMLInputElement;
    const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    descriptor?.set?.call(input, nextValue);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function dispatchWheel(
  locator: Locator,
  init: { deltaX: number; deltaY: number; shiftKey?: boolean },
): Promise<void> {
  await locator.evaluate((node, nextInit) => {
    const element = node as HTMLElement;
    const rect = element.getBoundingClientRect();
    const event = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      deltaX: nextInit.deltaX,
      deltaY: nextInit.deltaY,
      shiftKey: nextInit.shiftKey ?? false,
    });
    element.dispatchEvent(event);
  }, init);
}

async function dispatchDrag(
  locator: Locator,
  init: {
    startXRatio: number;
    startYRatio: number;
    endXRatio: number;
    endYRatio: number;
  },
): Promise<void> {
  await locator.evaluate((node, nextInit) => {
    const element = node as HTMLElement;
    const rect = element.getBoundingClientRect();
    const startX = rect.left + rect.width * nextInit.startXRatio;
    const startY = rect.top + rect.height * nextInit.startYRatio;
    const endX = rect.left + rect.width * nextInit.endXRatio;
    const endY = rect.top + rect.height * nextInit.endYRatio;

    element.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        button: 0,
        buttons: 1,
        clientX: startX,
        clientY: startY,
      }),
    );
    element.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        button: 0,
        buttons: 1,
        clientX: endX,
        clientY: endY,
      }),
    );
    element.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        button: 0,
        buttons: 0,
        clientX: endX,
        clientY: endY,
      }),
    );
  }, init);
}

async function boundingBoxOrThrow(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('Expected element bounding box');
  }
  return box;
}

async function readScrollMetrics(locator: Locator) {
  return locator.evaluate((node) => {
    const element = node as HTMLElement;
    return {
      scrollTop: element.scrollTop,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    };
  });
}

async function readStageState(locator: Locator) {
  return locator.evaluate((node) => {
    const read = (name: string) => Number(node.getAttribute(name) ?? '0');

    return {
      x: read('data-camera-x'),
      y: read('data-camera-y'),
      zoom: read('data-camera-zoom'),
      minX: read('data-camera-min-x'),
      maxX: read('data-camera-max-x'),
      minY: read('data-camera-min-y'),
      maxY: read('data-camera-max-y'),
      worldWidth: read('data-world-width'),
      worldHeight: read('data-world-height'),
      viewportWidth: read('data-viewport-width'),
      viewportHeight: read('data-viewport-height'),
      moveCount: read('data-move-count'),
      zoomCount: read('data-zoom-count'),
    };
  });
}

async function readMetricCardText(locator: Locator): Promise<string> {
  return locator.evaluate((node) =>
    (node.parentElement?.innerText ?? node.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
