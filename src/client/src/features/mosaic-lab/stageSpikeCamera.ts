export interface MosaicLabStageViewport {
  width: number;
  height: number;
}

export interface MosaicLabStageWorld {
  frameX: number;
  frameY: number;
  frameWidth: number;
  frameHeight: number;
  width: number;
  height: number;
  padding: number;
}

export interface MosaicLabStageCamera {
  x: number;
  y: number;
  zoom: number;
}

export interface MosaicLabStagePoint {
  x: number;
  y: number;
}

export interface MosaicLabStageCameraBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface MosaicLabVisibleWorldRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const MOSAIC_LAB_STAGE_MIN_ZOOM = 0.55;
export const MOSAIC_LAB_STAGE_MAX_ZOOM = 2.8;

const VIEWPORT_MARGIN = 48;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function centerOffset(viewportSize: number, scaledWorldSize: number): number {
  return (viewportSize - scaledWorldSize) / 2;
}

export function buildMosaicLabStageWorld(frame: {
  width: number;
  height: number;
}): MosaicLabStageWorld {
  const padding = Math.max(200, Math.round(Math.max(frame.width, frame.height) * 0.28));

  return Object.freeze({
    frameX: padding,
    frameY: padding,
    frameWidth: frame.width,
    frameHeight: frame.height,
    width: frame.width + padding * 2,
    height: frame.height + padding * 2,
    padding,
  });
}

export function getMosaicLabStageCameraBounds(
  viewport: MosaicLabStageViewport,
  world: MosaicLabStageWorld,
  zoom: number,
): MosaicLabStageCameraBounds {
  const scaledWorldWidth = world.width * zoom;
  const scaledWorldHeight = world.height * zoom;

  const xOffset = centerOffset(viewport.width, scaledWorldWidth);
  const yOffset = centerOffset(viewport.height, scaledWorldHeight);

  return {
    minX: scaledWorldWidth > viewport.width ? viewport.width - scaledWorldWidth : xOffset,
    maxX: scaledWorldWidth > viewport.width ? 0 : xOffset,
    minY: scaledWorldHeight > viewport.height ? viewport.height - scaledWorldHeight : yOffset,
    maxY: scaledWorldHeight > viewport.height ? 0 : yOffset,
  };
}

export function clampMosaicLabStageCamera(
  camera: MosaicLabStageCamera,
  viewport: MosaicLabStageViewport,
  world: MosaicLabStageWorld,
): MosaicLabStageCamera {
  const zoom = clamp(camera.zoom, MOSAIC_LAB_STAGE_MIN_ZOOM, MOSAIC_LAB_STAGE_MAX_ZOOM);
  const bounds = getMosaicLabStageCameraBounds(viewport, world, zoom);

  return {
    x: clamp(camera.x, bounds.minX, bounds.maxX),
    y: clamp(camera.y, bounds.minY, bounds.maxY),
    zoom,
  };
}

export function createMosaicLabStageHomeCamera(
  viewport: MosaicLabStageViewport,
  world: MosaicLabStageWorld,
): MosaicLabStageCamera {
  const fitZoom = Math.min(
    (viewport.width - VIEWPORT_MARGIN) / world.width,
    (viewport.height - VIEWPORT_MARGIN) / world.height,
  );
  const zoom = clamp(fitZoom, MOSAIC_LAB_STAGE_MIN_ZOOM, 1.25);
  const centered = {
    x: centerOffset(viewport.width, world.width * zoom),
    y: centerOffset(viewport.height, world.height * zoom),
    zoom,
  };

  return clampMosaicLabStageCamera(centered, viewport, world);
}

export function translateMosaicLabStageCamera(
  camera: MosaicLabStageCamera,
  translation: MosaicLabStagePoint,
  viewport: MosaicLabStageViewport,
  world: MosaicLabStageWorld,
): MosaicLabStageCamera {
  return clampMosaicLabStageCamera(
    {
      x: camera.x + translation.x,
      y: camera.y + translation.y,
      zoom: camera.zoom,
    },
    viewport,
    world,
  );
}

export function zoomMosaicLabStageCameraAtPoint(
  camera: MosaicLabStageCamera,
  factor: number,
  anchor: MosaicLabStagePoint,
  viewport: MosaicLabStageViewport,
  world: MosaicLabStageWorld,
): MosaicLabStageCamera {
  const nextZoom = clamp(
    camera.zoom * factor,
    MOSAIC_LAB_STAGE_MIN_ZOOM,
    MOSAIC_LAB_STAGE_MAX_ZOOM,
  );

  if (nextZoom === camera.zoom) {
    return clampMosaicLabStageCamera(camera, viewport, world);
  }

  const worldX = (anchor.x - camera.x) / camera.zoom;
  const worldY = (anchor.y - camera.y) / camera.zoom;

  return clampMosaicLabStageCamera(
    {
      x: anchor.x - worldX * nextZoom,
      y: anchor.y - worldY * nextZoom,
      zoom: nextZoom,
    },
    viewport,
    world,
  );
}

export function describeMosaicLabVisibleWorldRect(
  camera: MosaicLabStageCamera,
  viewport: MosaicLabStageViewport,
): MosaicLabVisibleWorldRect {
  return {
    left: (0 - camera.x) / camera.zoom,
    top: (0 - camera.y) / camera.zoom,
    right: (viewport.width - camera.x) / camera.zoom,
    bottom: (viewport.height - camera.y) / camera.zoom,
  };
}
