import { useEffect, useMemo, useRef, useState } from 'react';
import { Application, Container, Graphics, Text } from 'pixi.js';
import { MOSAIC_LAB_CATEGORY_APPEARANCE } from './appearance.js';
import {
  scaleRectForRender,
  type MosaicLabPackedScene,
} from './model/index.js';
import {
  clampMosaicLabStageCamera,
  createMosaicLabStageHomeCamera,
  buildMosaicLabStageWorld,
  describeMosaicLabVisibleWorldRect,
  getMosaicLabStageCameraBounds,
  translateMosaicLabStageCamera,
  zoomMosaicLabStageCameraAtPoint,
  type MosaicLabStageCamera,
} from './stageSpikeCamera.js';

const STAGE_CONTENT_SCALE = 6;
const EPSILON = 0.001;

interface MosaicLabPixiStageProps {
  scene: MosaicLabPackedScene;
  recipeName: string;
  seed: string;
  sourceCount: number;
  globalZoom: number;
  showLabels: boolean;
  showCategories: boolean;
  showSeams: boolean;
  showDiagnostics: boolean;
}

interface CameraSnapshot {
  x: number;
  y: number;
  zoom: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  viewportWidth: number;
  viewportHeight: number;
  worldWidth: number;
  worldHeight: number;
  visibleLeft: number;
  visibleTop: number;
  visibleRight: number;
  visibleBottom: number;
  moveCount: number;
  zoomCount: number;
}

const EMPTY_CAMERA_SNAPSHOT: CameraSnapshot = {
  x: 0,
  y: 0,
  zoom: 1,
  minX: 0,
  maxX: 0,
  minY: 0,
  maxY: 0,
  viewportWidth: 0,
  viewportHeight: 0,
  worldWidth: 0,
  worldHeight: 0,
  visibleLeft: 0,
  visibleTop: 0,
  visibleRight: 0,
  visibleBottom: 0,
  moveCount: 0,
  zoomCount: 0,
};

function formatStageNumber(value: number): string {
  return value.toFixed(2);
}

function formatZoom(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}

function cameraDidChange(next: MosaicLabStageCamera, previous: MosaicLabStageCamera | null): boolean {
  if (!previous) return true;

  return (
    Math.abs(next.x - previous.x) > EPSILON ||
    Math.abs(next.y - previous.y) > EPSILON ||
    Math.abs(next.zoom - previous.zoom) > EPSILON
  );
}

export function MosaicLabPixiStage(props: MosaicLabPixiStageProps): JSX.Element {
  const {
    scene,
    recipeName,
    seed,
    sourceCount,
    globalZoom,
    showLabels,
    showCategories,
    showSeams,
    showDiagnostics,
  } = props;

  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const worldLayerRef = useRef<Container | null>(null);
  const cameraRef = useRef<MosaicLabStageCamera | null>(null);
  const worldKeyRef = useRef<string | null>(null);
  const interactionRef = useRef({
    dragging: false,
    lastPointerX: 0,
    lastPointerY: 0,
    moveCount: 0,
    zoomCount: 0,
  });

  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [cameraSnapshot, setCameraSnapshot] = useState<CameraSnapshot>(EMPTY_CAMERA_SNAPSHOT);
  const [isDragging, setIsDragging] = useState(false);
  const [appInitCount, setAppInitCount] = useState(0);

  const renderScale = scene.result.contract.globalZoom * STAGE_CONTENT_SCALE;
  const frameRect = useMemo(
    () => scaleRectForRender(scene.result.contract.frame, renderScale),
    [scene.result.contract.frame, renderScale],
  );
  const stageWorld = useMemo(
    () => buildMosaicLabStageWorld({ width: frameRect.width, height: frameRect.height }),
    [frameRect.height, frameRect.width],
  );
  const stageWorldKey = `${stageWorld.width}x${stageWorld.height}`;

  const updateCameraSnapshot = (camera: MosaicLabStageCamera): void => {
    const bounds = getMosaicLabStageCameraBounds(viewportSize, stageWorld, camera.zoom);
    const visible = describeMosaicLabVisibleWorldRect(camera, viewportSize);

    setCameraSnapshot({
      x: camera.x,
      y: camera.y,
      zoom: camera.zoom,
      minX: bounds.minX,
      maxX: bounds.maxX,
      minY: bounds.minY,
      maxY: bounds.maxY,
      viewportWidth: viewportSize.width,
      viewportHeight: viewportSize.height,
      worldWidth: stageWorld.width,
      worldHeight: stageWorld.height,
      visibleLeft: visible.left,
      visibleTop: visible.top,
      visibleRight: visible.right,
      visibleBottom: visible.bottom,
      moveCount: interactionRef.current.moveCount,
      zoomCount: interactionRef.current.zoomCount,
    });
  };

  const applyCamera = (camera: MosaicLabStageCamera): void => {
    const worldLayer = worldLayerRef.current;
    if (!worldLayer) return;

    cameraRef.current = camera;
    worldLayer.position.set(camera.x, camera.y);
    worldLayer.scale.set(camera.zoom);
    updateCameraSnapshot(camera);
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    let disposed = false;
    const app = new Application();

    const setup = async (): Promise<void> => {
      await app.init({
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resizeTo: host,
      });
      if (disposed) {
        app.destroy(true, { children: true });
        return;
      }

      app.canvas.style.width = '100%';
      app.canvas.style.height = '100%';
      host.appendChild(app.canvas);

      const worldLayer = new Container();
      app.stage.addChild(worldLayer);

      appRef.current = app;
      worldLayerRef.current = worldLayer;
      setAppInitCount((count) => count + 1);
    };

    void setup();

    return () => {
      disposed = true;
      const children = worldLayerRef.current?.removeChildren() ?? [];
      for (const child of children) {
        child.destroy({ children: true });
      }
      worldLayerRef.current = null;
      cameraRef.current = null;
      appRef.current?.destroy(true, { children: true });
      appRef.current = null;
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const observer = new ResizeObserver(() => {
      setViewportSize({
        width: Math.max(1, Math.round(host.clientWidth)),
        height: Math.max(1, Math.round(host.clientHeight)),
      });
    });

    observer.observe(host);
    setViewportSize({
      width: Math.max(1, Math.round(host.clientWidth)),
      height: Math.max(1, Math.round(host.clientHeight)),
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const worldLayer = worldLayerRef.current;
    if (!worldLayer) return;

    const removedChildren = worldLayer.removeChildren();
    for (const child of removedChildren) {
      child.destroy({ children: true });
    }

    const workspace = new Graphics()
      .roundRect(0, 0, stageWorld.width, stageWorld.height, 32)
      .fill('#0f0d0c')
      .stroke({ width: 2, color: '#26201c', alpha: 1 });
    worldLayer.addChild(workspace);

    const grid = new Graphics();
    const gridSize = 80;
    for (let x = 0; x <= stageWorld.width; x += gridSize) {
      grid.moveTo(x, 0).lineTo(x, stageWorld.height);
    }
    for (let y = 0; y <= stageWorld.height; y += gridSize) {
      grid.moveTo(0, y).lineTo(stageWorld.width, y);
    }
    grid.stroke({ width: 1, color: '#1c1815', alpha: 1 });
    worldLayer.addChild(grid);

    const frame = new Graphics()
      .roundRect(
        stageWorld.frameX,
        stageWorld.frameY,
        stageWorld.frameWidth,
        stageWorld.frameHeight,
        28,
      )
      .fill({ color: '#161311', alpha: 1 })
      .stroke({ width: 3, color: '#6f6255', alpha: 1 });
    worldLayer.addChild(frame);

    if (showSeams) {
      const seamOverlay = new Graphics();
      for (const segment of scene.horizontalSeams) {
        seamOverlay
          .moveTo(
            stageWorld.frameX + segment.start * renderScale,
            stageWorld.frameY + segment.position * renderScale,
          )
          .lineTo(
            stageWorld.frameX + segment.end * renderScale,
            stageWorld.frameY + segment.position * renderScale,
          );
      }
      for (const segment of scene.verticalSeams) {
        seamOverlay
          .moveTo(
            stageWorld.frameX + segment.position * renderScale,
            stageWorld.frameY + segment.start * renderScale,
          )
          .lineTo(
            stageWorld.frameX + segment.position * renderScale,
            stageWorld.frameY + segment.end * renderScale,
          );
      }
      seamOverlay.stroke({ width: 2, color: '#ece6dc', alpha: 0.92 });
      worldLayer.addChild(seamOverlay);
    }

    if (showDiagnostics) {
      const diagnosticOverlay = new Graphics();
      for (const rect of scene.result.metrics.blackSpace.uncoveredRects) {
        const scaled = scaleRectForRender(rect, renderScale);
        diagnosticOverlay
          .roundRect(
            stageWorld.frameX + scaled.x,
            stageWorld.frameY + scaled.y,
            scaled.width,
            scaled.height,
            8,
          )
          .fill({ color: '#d97b5b', alpha: 0.14 })
          .stroke({ width: 2, color: '#d97b5b', alpha: 0.88 });
      }
      for (const rect of scene.result.metrics.overlap.overlapRects) {
        const scaled = scaleRectForRender(rect, renderScale);
        diagnosticOverlay
          .roundRect(
            stageWorld.frameX + scaled.x,
            stageWorld.frameY + scaled.y,
            scaled.width,
            scaled.height,
            8,
          )
          .fill({ color: '#ffb08d', alpha: 0.22 })
          .stroke({ width: 2, color: '#ffb08d', alpha: 1 });
      }
      worldLayer.addChild(diagnosticOverlay);
    }

    for (const tile of scene.result.packedTiles) {
      try {
        const appearance = MOSAIC_LAB_CATEGORY_APPEARANCE[tile.categoryFamily];
        const scaledTile = scaleRectForRender(tile, renderScale);
        const tileX = stageWorld.frameX + scaledTile.x;
        const tileY = stageWorld.frameY + scaledTile.y;

        const tileGraphic = new Graphics()
          .roundRect(tileX, tileY, scaledTile.width, scaledTile.height, 22)
          .fill(tile.sourceTile.color)
          .stroke({ width: 3, color: appearance.accentSolid, alpha: 0.9 });
        worldLayer.addChild(tileGraphic);

        if (showCategories && scaledTile.width >= 72 && scaledTile.height >= 52) {
          const badgeWidth = Math.min(180, scaledTile.width - 36);
          const badge = new Graphics()
            .roundRect(tileX + 18, tileY + 18, badgeWidth, 34, 17)
            .fill(appearance.badgeFill);
          worldLayer.addChild(badge);
          const categoryText = new Text({
            text: tile.categoryFamily,
            style: {
              fill: appearance.ink,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 12,
              fontWeight: '600',
            },
          });
          categoryText.position.set(tileX + 30, tileY + 26);
          worldLayer.addChild(categoryText);
        }

        if (showLabels && scaledTile.width >= 96 && scaledTile.height >= 96) {
          const labelText = new Text({
            text: tile.sourceTile.label,
            style: {
              fill: appearance.accentSolid,
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: 22,
              fontWeight: '600',
              wordWrap: true,
              wordWrapWidth: Math.max(80, scaledTile.width - 32),
            },
          });
          labelText.position.set(tileX + 18, tileY + scaledTile.height - 76);
          worldLayer.addChild(labelText);

          const noteText = new Text({
            text: `${tile.footprint.name} · ${tile.sourceTile.sourceOrientation}`,
            style: {
              fill: appearance.accentSolid,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 12,
              fontWeight: '500',
            },
          });
          noteText.position.set(tileX + 18, tileY + scaledTile.height - 28);
          worldLayer.addChild(noteText);
        }
      } catch (error) {
        console.error('Mosaic Lab stage tile render skipped', {
          tileId: tile.sourceTile.id,
          recipeKey: tile.sourceTile.recipeKey,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }, [
    renderScale,
    scene.horizontalSeams,
    scene.result.metrics.blackSpace.uncoveredRects,
    scene.result.metrics.overlap.overlapRects,
    scene.result.packedTiles,
    showCategories,
    showDiagnostics,
    showLabels,
    showSeams,
    stageWorld.frameHeight,
    stageWorld.frameWidth,
    stageWorld.frameX,
    stageWorld.frameY,
    stageWorld.height,
    stageWorld.width,
  ]);

  useEffect(() => {
    const app = appRef.current;
    if (!app || viewportSize.width <= 0 || viewportSize.height <= 0) return;

    app.renderer.resize(viewportSize.width, viewportSize.height);

    const worldChanged = worldKeyRef.current !== stageWorldKey;
    worldKeyRef.current = stageWorldKey;

    if (worldChanged || !cameraRef.current) {
      interactionRef.current.moveCount = 0;
      interactionRef.current.zoomCount = 0;
      applyCamera(createMosaicLabStageHomeCamera(viewportSize, stageWorld));
      return;
    }

    applyCamera(clampMosaicLabStageCamera(cameraRef.current, viewportSize, stageWorld));
  }, [stageWorld, stageWorldKey, viewportSize.height, viewportSize.width]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || viewportSize.width <= 0 || viewportSize.height <= 0) return undefined;

    const applyInteractionCamera = (nextCamera: MosaicLabStageCamera, didZoom: boolean): void => {
      if (!cameraDidChange(nextCamera, cameraRef.current)) {
        return;
      }

      interactionRef.current.moveCount += 1;
      if (didZoom) {
        interactionRef.current.zoomCount += 1;
      }
      applyCamera(nextCamera);
    };

    const handleWheel = (event: WheelEvent): void => {
      event.preventDefault();

      const currentCamera = cameraRef.current ?? createMosaicLabStageHomeCamera(viewportSize, stageWorld);
      if (event.shiftKey || event.ctrlKey || event.metaKey) {
        const rect = host.getBoundingClientRect();
        const anchor = {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        };
        const factor = Math.exp(-event.deltaY * 0.0015);
        applyInteractionCamera(
          zoomMosaicLabStageCameraAtPoint(
            currentCamera,
            factor,
            anchor,
            viewportSize,
            stageWorld,
          ),
          true,
        );
        return;
      }

      applyInteractionCamera(
        translateMosaicLabStageCamera(
          currentCamera,
          {
            x: -event.deltaX,
            y: -event.deltaY,
          },
          viewportSize,
          stageWorld,
        ),
        false,
      );
    };

    const finishDrag = (event?: PointerEvent): void => {
      if (!interactionRef.current.dragging) return;
      interactionRef.current.dragging = false;
      setIsDragging(false);
      if (event && host.hasPointerCapture?.(event.pointerId)) {
        host.releasePointerCapture(event.pointerId);
      }
    };

    const handlePointerDown = (event: PointerEvent): void => {
      if (event.button !== 0) return;

      interactionRef.current.dragging = true;
      interactionRef.current.lastPointerX = event.clientX;
      interactionRef.current.lastPointerY = event.clientY;
      host.setPointerCapture?.(event.pointerId);
      setIsDragging(true);
    };

    const handlePointerMove = (event: PointerEvent): void => {
      if (!interactionRef.current.dragging) return;

      const deltaX = event.clientX - interactionRef.current.lastPointerX;
      const deltaY = event.clientY - interactionRef.current.lastPointerY;
      interactionRef.current.lastPointerX = event.clientX;
      interactionRef.current.lastPointerY = event.clientY;

      const currentCamera = cameraRef.current ?? createMosaicLabStageHomeCamera(viewportSize, stageWorld);
      applyInteractionCamera(
        translateMosaicLabStageCamera(
          currentCamera,
          {
            x: deltaX,
            y: deltaY,
          },
          viewportSize,
          stageWorld,
        ),
        false,
      );
    };

    const handleLostPointerCapture = (): void => finishDrag();

    host.addEventListener('wheel', handleWheel, { passive: false });
    host.addEventListener('pointerdown', handlePointerDown);
    host.addEventListener('pointermove', handlePointerMove);
    host.addEventListener('pointerup', finishDrag);
    host.addEventListener('pointercancel', finishDrag);
    host.addEventListener('lostpointercapture', handleLostPointerCapture);

    return () => {
      host.removeEventListener('wheel', handleWheel);
      host.removeEventListener('pointerdown', handlePointerDown);
      host.removeEventListener('pointermove', handlePointerMove);
      host.removeEventListener('pointerup', finishDrag);
      host.removeEventListener('pointercancel', finishDrag);
      host.removeEventListener('lostpointercapture', handleLostPointerCapture);
    };
  }, [stageWorld, viewportSize.height, viewportSize.width]);

  return (
    <div className="mosaic-lab__viewport-frame" data-testid="mosaic-lab-stage-workspace">
      <div className="mosaic-lab__stage-overlay">
        <div>
          <p className="mosaic-lab__panel-eyebrow">Synthetic Pixi stage</p>
          <h3 className="mosaic-lab__stage-title">Packed workspace for {recipeName}</h3>
          <p className="mosaic-lab__stage-hint">
            Viewing {sourceCount} synthetic sources at {formatZoom(globalZoom)}. Wheel or trackpad
            pans the stage, Shift/Ctrl/⌘ + wheel zooms around the pointer, and dragging pans as a
            mouse fallback.
          </p>
        </div>
        <div className="mosaic-lab__stage-chip-row">
          <span className="mosaic-lab__stage-chip" data-testid="mosaic-lab-stage-chip-seed">
            Seed · {seed}
          </span>
          <span className="mosaic-lab__stage-chip">synthetic-only</span>
          <span className="mosaic-lab__stage-chip">two-axis camera</span>
          <span className="mosaic-lab__stage-chip">wall return intact</span>
        </div>
      </div>

      <div
        className={`mosaic-lab__pixi-stage-host${isDragging ? ' is-dragging' : ''}`}
        data-testid="mosaic-lab-pixi-stage"
        data-stage-mode="pixi-packed-stage"
        data-app-init-count={appInitCount}
        data-camera-x={formatStageNumber(cameraSnapshot.x)}
        data-camera-y={formatStageNumber(cameraSnapshot.y)}
        data-camera-zoom={formatStageNumber(cameraSnapshot.zoom)}
        data-camera-min-x={formatStageNumber(cameraSnapshot.minX)}
        data-camera-max-x={formatStageNumber(cameraSnapshot.maxX)}
        data-camera-min-y={formatStageNumber(cameraSnapshot.minY)}
        data-camera-max-y={formatStageNumber(cameraSnapshot.maxY)}
        data-world-width={formatStageNumber(cameraSnapshot.worldWidth)}
        data-world-height={formatStageNumber(cameraSnapshot.worldHeight)}
        data-viewport-width={formatStageNumber(cameraSnapshot.viewportWidth)}
        data-viewport-height={formatStageNumber(cameraSnapshot.viewportHeight)}
        data-move-count={cameraSnapshot.moveCount}
        data-zoom-count={cameraSnapshot.zoomCount}
        ref={hostRef}
      />

      <dl className="mosaic-lab__stage-diagnostics" data-testid="mosaic-lab-stage-diagnostics">
        <div>
          <dt>camera</dt>
          <dd data-testid="mosaic-lab-camera-state">
            x {formatStageNumber(cameraSnapshot.x)} · y {formatStageNumber(cameraSnapshot.y)} · z{' '}
            {formatStageNumber(cameraSnapshot.zoom)}
          </dd>
        </div>
        <div>
          <dt>bounds</dt>
          <dd>
            x {formatStageNumber(cameraSnapshot.minX)} → {formatStageNumber(cameraSnapshot.maxX)} · y{' '}
            {formatStageNumber(cameraSnapshot.minY)} → {formatStageNumber(cameraSnapshot.maxY)}
          </dd>
        </div>
        <div>
          <dt>visible world</dt>
          <dd>
            {formatStageNumber(cameraSnapshot.visibleLeft)},{' '}
            {formatStageNumber(cameraSnapshot.visibleTop)} →{' '}
            {formatStageNumber(cameraSnapshot.visibleRight)},{' '}
            {formatStageNumber(cameraSnapshot.visibleBottom)}
          </dd>
        </div>
        <div>
          <dt>workspace</dt>
          <dd>
            {formatStageNumber(cameraSnapshot.worldWidth)} × {formatStageNumber(cameraSnapshot.worldHeight)}
          </dd>
        </div>
        <div>
          <dt>viewport</dt>
          <dd>
            {formatStageNumber(cameraSnapshot.viewportWidth)} ×{' '}
            {formatStageNumber(cameraSnapshot.viewportHeight)}
          </dd>
        </div>
        <div>
          <dt>events</dt>
          <dd data-testid="mosaic-lab-camera-events">
            move {cameraSnapshot.moveCount} · zoom {cameraSnapshot.zoomCount}
          </dd>
        </div>
      </dl>
    </div>
  );
}
