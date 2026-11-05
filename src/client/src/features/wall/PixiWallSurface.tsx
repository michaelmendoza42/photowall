import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Application, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import type { MediaVariant } from '../../../../shared/api/media.js';
import {
  buildPixiSceneSprites,
  coverCropFrame,
  largestOnScreenVariant,
  variantRank,
  wallPixelRatio,
  type PixiSceneSprite,
  type PixiSceneTileInput,
} from './pixiScene.js';
import type { WallMediaSourceResolver } from './mediaSourceResolver.js';
import { destroyPixiApp } from './destroyPixiApp.js';
import {
  browserMediaDiagnostics,
  mediaVariantFromSource,
  waitForMediaImage,
} from './mediaLoadDiagnostics.js';
import {
  collectDisplayedTextureSources,
  evictInactiveTextures,
  TextureLoadScheduler,
  touchTexture,
} from './textureScheduler.js';

const MAX_TEXTURE_CACHE_ENTRIES = 128;
/** Zoomed-in tiers are large; cap decoded texture memory, not just count. */
const MAX_TEXTURE_CACHE_BYTES = 384 * 1024 * 1024;
const MAX_CONCURRENT_TEXTURE_LOADS = 4;

export interface PixiWallSurfaceProps {
  tiles: readonly PixiSceneTileInput[];
  viewportWidth: number;
  viewportHeight: number;
  worldWidth: number;
  worldHeight: number;
  zoom: number;
  mediaSourceResolver?: WallMediaSourceResolver;
}

interface SpriteEntry {
  sprite: Sprite;
  src: string;
  displayedSrc: string | null;
  displayedVariant: MediaVariant | null;
  /** The loaded (cached, shared) texture for the displayed image. */
  base: Texture | null;
  /** This sprite's cover crop of `base`; owned by the entry. */
  view: Texture | null;
  /** Tile size the sprite is laid out at. */
  width: number;
  height: number;
}

export const PixiWallSurface = memo(function PixiWallSurface(
  props: PixiWallSurfaceProps,
): JSX.Element {
  const {
    tiles,
    viewportWidth,
    viewportHeight,
    worldWidth,
    worldHeight,
    zoom,
    mediaSourceResolver,
  } = props;

  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const viewportRef = useRef<Viewport | null>(null);
  const sceneRef = useRef<Container | null>(null);
  const spriteEntriesRef = useRef<Map<string, SpriteEntry>>(new Map());
  const textureCacheRef = useRef<Map<string, Texture>>(new Map());
  const textureSchedulerRef = useRef<TextureLoadScheduler<Texture> | null>(null);
  const surfaceDisposedRef = useRef(false);
  if (!textureSchedulerRef.current) {
    textureSchedulerRef.current = new TextureLoadScheduler(MAX_CONCURRENT_TEXTURE_LOADS);
  }
  const textureScheduler = textureSchedulerRef.current;
  const [sceneReady, setSceneReady] = useState(false);
  const [appInitCount, setAppInitCount] = useState(0);

  useEffect(
    () => browserMediaDiagnostics.registerScheduler(textureScheduler),
    [textureScheduler],
  );

  // Draw at the device pixel ratio so high-DPI screens aren't upscaled 2×.
  const pixelRatio = wallPixelRatio();
  const sprites = useMemo(
    () =>
      buildPixiSceneSprites(
        tiles,
        zoom,
        { width: viewportWidth, height: viewportHeight, pixelRatio },
        mediaSourceResolver,
      ),
    [tiles, zoom, viewportWidth, viewportHeight, pixelRatio, mediaSourceResolver],
  );
  const activeVariant = useMemo(() => largestOnScreenVariant(sprites), [sprites]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    let disposed = false;
    surfaceDisposedRef.current = false;
    const app = new Application();

    const setup = async (): Promise<void> => {
      await app.init({
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: pixelRatio,
        resizeTo: host,
      });
      if (disposed) {
        destroyPixiApp(app);
        return;
      }

      host.appendChild(app.canvas);

      const viewport = new Viewport({
        events: app.renderer.events,
        screenWidth: host.clientWidth,
        screenHeight: host.clientHeight,
        worldWidth: Math.max(1, worldWidth),
        worldHeight: Math.max(1, worldHeight),
      });
      const scene = new Container();
      scene.sortableChildren = true;
      viewport.addChild(scene);
      app.stage.addChild(viewport);

      appRef.current = app;
      viewportRef.current = viewport;
      sceneRef.current = scene;
      setAppInitCount((count) => count + 1);
      setSceneReady(true);
    };

    void setup();

    return () => {
      disposed = true;
      surfaceDisposedRef.current = true;
      const currentApp = appRef.current;
      appRef.current = null;
      currentApp?.stop();
      if (currentApp) destroyPixiApp(currentApp);
      spriteEntriesRef.current.clear();
      for (const texture of textureCacheRef.current.values()) {
        texture.destroy(true);
      }
      textureCacheRef.current.clear();
      textureSchedulerRef.current = null;
      sceneRef.current = null;
      viewportRef.current = null;
      setSceneReady(false);
    };
  }, []);

  useEffect(() => {
    const app = appRef.current;
    const viewport = viewportRef.current;
    if (!app || !viewport) return;

    app.renderer.resize(
      Math.max(1, Math.round(viewportWidth || 1)),
      Math.max(1, Math.round(viewportHeight || 1)),
      pixelRatio,
    );
    viewport.resize(
      Math.max(1, Math.round(viewportWidth || 1)),
      Math.max(1, Math.round(viewportHeight || 1)),
      Math.max(1, Math.round(worldWidth || 1)),
      Math.max(1, Math.round(worldHeight || 1)),
    );
    viewport.scale.set(zoom, zoom);
    viewport.position.set(0, 0);
  }, [viewportWidth, viewportHeight, worldWidth, worldHeight, zoom, pixelRatio]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!sceneReady || !scene) return undefined;

    const spriteEntries = spriteEntriesRef.current;
    const nextKeys = new Set(sprites.map((sprite) => sprite.key));
    const getActiveSources = () =>
      collectDisplayedTextureSources(spriteEntries.values());

    for (const [key, entry] of spriteEntries) {
      if (nextKeys.has(key)) continue;
      const removedSprite = entry.sprite;
      const removedView = entry.view;
      scene.removeChild(removedSprite);
      spriteEntries.delete(key);
      requestAnimationFrame(() => {
        removedSprite.destroy();
        removedView?.destroy(false);
      });
    }

    for (let index = 0; index < sprites.length; index += 1) {
      const spriteData = sprites[index]!;
      syncSprite({
        scene,
        spriteEntries,
        textureCache: textureCacheRef.current,
        textureScheduler,
        getActiveSources,
        isDisposed: () => surfaceDisposedRef.current,
        spriteData,
        zIndex: spriteData.zOrder ?? index,
      });
    }

    const wantedSources = new Set<string>();
    for (const entry of spriteEntries.values()) wantedSources.add(entry.src);
    textureScheduler.dropQueuedExcept(wantedSources);
    evictTextures(textureCacheRef.current, getActiveSources());
    return undefined;
  }, [sceneReady, sprites, textureScheduler]);

  return (
    <div
      className="wall-canvas__pixi"
      data-testid="wall-pixi-surface"
      data-media-variant={activeVariant}
      data-sprite-count={sprites.length}
      data-app-init-count={appInitCount}
      ref={hostRef}
    />
  );
});

function syncSprite(args: {
  scene: Container;
  spriteEntries: Map<string, SpriteEntry>;
  textureCache: Map<string, Texture>;
  textureScheduler: TextureLoadScheduler<Texture>;
  getActiveSources: () => Set<string>;
  isDisposed: () => boolean;
  spriteData: PixiSceneSprite;
  zIndex: number;
}): void {
  const {
    scene,
    spriteEntries,
    textureCache,
    textureScheduler,
    getActiveSources,
    isDisposed,
    spriteData,
    zIndex,
  } = args;
  const { priority } = spriteData;

  const current = spriteEntries.get(spriteData.key);
  if (current) {
    const resized =
      current.width !== spriteData.width || current.height !== spriteData.height;
    current.width = spriteData.width;
    current.height = spriteData.height;
    applySpriteLayout(current.sprite, spriteData, zIndex);
    if (resized && current.base) showTexture(current, current.base);
    if (current.src === spriteData.src) {
      return;
    }
    // Zooming out a little shouldn't swap a sharp on-screen photo for a
    // softer one; off-screen tiles drop back to thumbnails to free memory.
    if (
      spriteData.onScreen &&
      current.displayedSrc &&
      current.displayedVariant &&
      variantRank(current.displayedVariant) >= variantRank(spriteData.variant)
    ) {
      current.src = current.displayedSrc;
      return;
    }

    const cachedTexture = textureCache.get(spriteData.src);
    current.src = spriteData.src;
    if (cachedTexture) {
      touchTexture(textureCache, spriteData.src, cachedTexture);
      showTexture(current, cachedTexture);
      current.displayedSrc = spriteData.src;
      current.displayedVariant = spriteData.variant;
      current.sprite.visible = true;
      browserMediaDiagnostics.record('sprite_applied', spriteData.variant);
      return;
    }

    // Keep the previously visible texture in place until the next zoom-tier
    // derivative is ready so zoom-crossing does not black out the wall.
    void loadTexture(
      spriteData.src,
      textureCache,
      textureScheduler,
      priority,
      isDisposed,
    ).then((texture) => {
      const latest = spriteEntries.get(spriteData.key);
      if (!latest || latest.sprite !== current.sprite || latest.src !== spriteData.src) {
        browserMediaDiagnostics.record('superseded', spriteData.variant);
        return;
      }
      showTexture(latest, texture);
      latest.displayedSrc = spriteData.src;
      latest.displayedVariant = spriteData.variant;
      latest.sprite.visible = true;
      browserMediaDiagnostics.record('sprite_applied', spriteData.variant);
      evictTextures(textureCache, getActiveSources());
    }).catch(() => undefined);
    return;
  }

  const sprite = new Sprite();
  sprite.visible = false;
  applySpriteLayout(sprite, spriteData, zIndex);
  scene.addChild(sprite);
  const entry: SpriteEntry = {
    sprite,
    src: spriteData.src,
    displayedSrc: null,
    displayedVariant: null,
    base: null,
    view: null,
    width: spriteData.width,
    height: spriteData.height,
  };
  spriteEntries.set(spriteData.key, entry);

  const cachedTexture = textureCache.get(spriteData.src);
  if (cachedTexture) {
    touchTexture(textureCache, spriteData.src, cachedTexture);
    showTexture(entry, cachedTexture);
    entry.displayedSrc = spriteData.src;
    entry.displayedVariant = spriteData.variant;
    sprite.visible = true;
    browserMediaDiagnostics.record('sprite_applied', spriteData.variant);
    return;
  }

  void loadTexture(
    spriteData.src,
    textureCache,
    textureScheduler,
    priority,
    isDisposed,
  ).then((texture) => {
    const latest = spriteEntries.get(spriteData.key);
    if (!latest || latest.sprite !== sprite || latest.src !== spriteData.src) {
      browserMediaDiagnostics.record('superseded', spriteData.variant);
      return;
    }
    showTexture(latest, texture);
    latest.displayedSrc = spriteData.src;
    latest.displayedVariant = spriteData.variant;
    latest.sprite.visible = true;
    browserMediaDiagnostics.record('sprite_applied', spriteData.variant);
    evictTextures(textureCache, getActiveSources());
  }).catch(() => undefined);
}

/**
 * Show `base` on the sprite cropped to the tile's shape (like CSS
 * `object-fit: cover`), so a tile sized differently from its photo crops
 * the photo instead of stretching it.
 */
function showTexture(entry: SpriteEntry, base: Texture): void {
  const { sprite, width, height } = entry;
  const frame = coverCropFrame(
    { width: base.source.width, height: base.source.height },
    { width, height },
  );
  const previousView = entry.view;
  const view = new Texture({
    source: base.source,
    frame: new Rectangle(frame.x, frame.y, frame.width, frame.height),
  });
  entry.base = base;
  entry.view = view;
  sprite.texture = view;
  // Swapping the texture resets the sprite to the frame's size.
  sprite.width = width;
  sprite.height = height;
  if (previousView) destroyTextureAfterRender(previousView);
}

function applySpriteLayout(
  sprite: Sprite,
  spriteData: PixiSceneSprite,
  zIndex: number,
): void {
  sprite.x = spriteData.x;
  sprite.y = spriteData.y;
  sprite.width = spriteData.width;
  sprite.height = spriteData.height;
  sprite.zIndex = zIndex;
  sprite.label = `${spriteData.photoId}:${spriteData.variant}`;
}

function evictTextures(textureCache: Map<string, Texture>, activeSources: Set<string>): void {
  evictInactiveTextures(
    textureCache,
    activeSources,
    MAX_TEXTURE_CACHE_ENTRIES,
    destroyTextureAfterRender,
    { maxBytes: MAX_TEXTURE_CACHE_BYTES, sizeOf: textureBytes },
  );
}

function textureBytes(texture: Texture): number {
  return texture.source.pixelWidth * texture.source.pixelHeight * 4;
}

function destroyTextureAfterRender(texture: Texture): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!texture.destroyed) texture.destroy(false);
    });
  });
}

async function loadTexture(
  src: string,
  textureCache: Map<string, Texture>,
  textureScheduler: TextureLoadScheduler<Texture>,
  priority: number,
  isDisposed: () => boolean,
): Promise<Texture> {
  const cachedTexture = textureCache.get(src);
  if (cachedTexture) return cachedTexture;

  return textureScheduler.load(src, async () => {
    const variant = mediaVariantFromSource(src);
    if (isDisposed()) {
      browserMediaDiagnostics.record('superseded', variant);
      throw new Error('Media texture load superseded');
    }
    browserMediaDiagnostics.record('requested', variant);

    const image = new Image();
    image.decoding = 'async';
    try {
      await waitForMediaImage(image, src, {
        onDecodeFallback: () => browserMediaDiagnostics.record('decode_fallback', variant),
      });
    } catch (error) {
      browserMediaDiagnostics.record(isDisposed() ? 'superseded' : 'load_failed', variant);
      throw error;
    }
    if (isDisposed()) {
      browserMediaDiagnostics.record('superseded', variant);
      throw new Error('Media texture load superseded');
    }
    browserMediaDiagnostics.record('image_ready', variant);

    let texture: Texture;
    try {
      texture = Texture.from(image, true);
    } catch (error) {
      browserMediaDiagnostics.record('texture_create_failed', variant);
      throw error;
    }
    if (isDisposed()) {
      texture.destroy(true);
      browserMediaDiagnostics.record('superseded', variant);
      throw new Error('Media texture load superseded');
    }
    browserMediaDiagnostics.record('texture_created', variant);
    touchTexture(textureCache, src, texture);
    return texture;
  }, priority);
}
