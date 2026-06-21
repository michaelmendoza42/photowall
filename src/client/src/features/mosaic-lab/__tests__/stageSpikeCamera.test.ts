import { describe, expect, it } from 'vitest';
import {
  buildMosaicLabStageWorld,
  clampMosaicLabStageCamera,
  createMosaicLabStageHomeCamera,
  describeMosaicLabVisibleWorldRect,
  getMosaicLabStageCameraBounds,
  translateMosaicLabStageCamera,
  zoomMosaicLabStageCameraAtPoint,
} from '../stageSpikeCamera.js';

describe('stageSpikeCamera', () => {
  it('builds a padded finite world around the lab frame', () => {
    const world = buildMosaicLabStageWorld({ width: 960, height: 720 });

    expect(world.width).toBeGreaterThan(960);
    expect(world.height).toBeGreaterThan(720);
    expect(world.frameX).toBe(world.padding);
    expect(world.frameY).toBe(world.padding);
  });

  it('creates a centered home camera that stays within bounds', () => {
    const viewport = { width: 880, height: 620 };
    const world = buildMosaicLabStageWorld({ width: 960, height: 720 });

    const camera = createMosaicLabStageHomeCamera(viewport, world);
    const bounds = getMosaicLabStageCameraBounds(viewport, world, camera.zoom);

    expect(camera.zoom).toBeGreaterThan(0.5);
    expect(camera.zoom).toBeLessThanOrEqual(1.25);
    expect(camera.x).toBeGreaterThanOrEqual(bounds.minX);
    expect(camera.x).toBeLessThanOrEqual(bounds.maxX);
    expect(camera.y).toBeGreaterThanOrEqual(bounds.minY);
    expect(camera.y).toBeLessThanOrEqual(bounds.maxY);
  });

  it('clamps panning to the finite world bounds', () => {
    const viewport = { width: 880, height: 620 };
    const world = buildMosaicLabStageWorld({ width: 960, height: 720 });
    const home = createMosaicLabStageHomeCamera(viewport, world);
    const bounds = getMosaicLabStageCameraBounds(viewport, world, home.zoom);

    const panned = translateMosaicLabStageCamera(
      home,
      { x: -10_000, y: -10_000 },
      viewport,
      world,
    );

    expect(panned.x).toBe(bounds.minX);
    expect(panned.y).toBe(bounds.minY);
  });

  it('keeps the zoom anchor stable when zooming in around a point', () => {
    const viewport = { width: 900, height: 640 };
    const world = buildMosaicLabStageWorld({ width: 960, height: 720 });
    const home = createMosaicLabStageHomeCamera(viewport, world);
    const anchor = { x: 420, y: 280 };

    const beforeWorldPoint = {
      x: (anchor.x - home.x) / home.zoom,
      y: (anchor.y - home.y) / home.zoom,
    };

    const zoomed = zoomMosaicLabStageCameraAtPoint(home, 1.35, anchor, viewport, world);
    const afterWorldPoint = {
      x: (anchor.x - zoomed.x) / zoomed.zoom,
      y: (anchor.y - zoomed.y) / zoomed.zoom,
    };

    expect(zoomed.zoom).toBeGreaterThan(home.zoom);
    expect(afterWorldPoint.x).toBeCloseTo(beforeWorldPoint.x, 5);
    expect(afterWorldPoint.y).toBeCloseTo(beforeWorldPoint.y, 5);
  });

  it('describes the visible world rect from the current camera', () => {
    const viewport = { width: 900, height: 640 };
    const world = buildMosaicLabStageWorld({ width: 960, height: 720 });
    const clamped = clampMosaicLabStageCamera(
      {
        x: -180,
        y: -120,
        zoom: 1.1,
      },
      viewport,
      world,
    );

    const visible = describeMosaicLabVisibleWorldRect(clamped, viewport);

    expect(visible.right).toBeGreaterThan(visible.left);
    expect(visible.bottom).toBeGreaterThan(visible.top);
  });
});
