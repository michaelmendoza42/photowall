import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Application, Container, Sprite, Texture } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import {
  buildPixiSceneSprites,
  selectPixiSceneVariant,
  type PixiSceneSprite,
  type PixiSceneTileInput,
} from './pixiScene.js';

export interface PixiWallSurfaceProps {
  tiles: readonly PixiSceneTileInput[];
  viewportWidth: number;
  viewportHeight: number;
  worldWidth: number;
  worldHeight: number;
  zoom: number;
}

interface SpriteEntry {
  sprite: Sprite;
  src: string;
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
  } = props;

  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const viewportRef = useRef<Viewport | null>(null);
  const sceneRef = useRef<Container | null>(null);
  const spriteEntriesRef = useRef<Map<string, SpriteEntry>>(new Map());
  const textureCacheRef = useRef<Map<string, Texture>>(new Map());
  const texturePromiseCacheRef = useRef<Map<string, Promise<Texture>>>(new Map());
  const [sceneReady, setSceneReady] = useState(false);
  const [appInitCount, setAppInitCount] = useState(0);

  const sprites = useMemo(() => buildPixiSceneSprites(tiles, zoom), [tiles, zoom]);
  const activeVariant = useMemo(() => selectPixiSceneVariant(zoom), [zoom]);

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
      for (const entry of spriteEntriesRef.current.values()) {
        entry.sprite.destroy();
      }
      spriteEntriesRef.current.clear();
      for (const texture of textureCacheRef.current.values()) {
        texture.destroy(true);
      }
      textureCacheRef.current.clear();
      texturePromiseCacheRef.current.clear();
      sceneRef.current = null;
      viewportRef.current = null;
      setSceneReady(false);
      appRef.current?.destroy(true, { children: true });
      appRef.current = null;
    };
  }, []);

  useEffect(() => {
    const app = appRef.current;
    const viewport = viewportRef.current;
    if (!app || !viewport) return;

    app.renderer.resize(
      Math.max(1, Math.round(viewportWidth || 1)),
      Math.max(1, Math.round(viewportHeight || 1)),
    );
    viewport.resize(
      Math.max(1, Math.round(viewportWidth || 1)),
      Math.max(1, Math.round(viewportHeight || 1)),
      Math.max(1, Math.round(worldWidth || 1)),
      Math.max(1, Math.round(worldHeight || 1)),
    );
    viewport.scale.set(zoom, zoom);
    viewport.position.set(0, 0);
  }, [viewportWidth, viewportHeight, worldWidth, worldHeight, zoom]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!sceneReady || !scene) return undefined;

    let cancelled = false;
    const spriteEntries = spriteEntriesRef.current;
    const nextKeys = new Set(sprites.map((sprite) => sprite.key));

    for (const [key, entry] of spriteEntries) {
      if (nextKeys.has(key)) continue;
      scene.removeChild(entry.sprite);
      entry.sprite.destroy();
      spriteEntries.delete(key);
    }

    for (let index = 0; index < sprites.length; index += 1) {
      const spriteData = sprites[index]!;
      syncSprite({
        scene,
        spriteEntries,
        textureCache: textureCacheRef.current,
        texturePromises: texturePromiseCacheRef.current,
        spriteData,
        zIndex: index,
        cancelledRef: () => cancelled,
      });
    }

    return () => {
      cancelled = true;
    };
  }, [sceneReady, sprites]);

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
  texturePromises: Map<string, Promise<Texture>>;
  spriteData: PixiSceneSprite;
  zIndex: number;
  cancelledRef: () => boolean;
}): void {
  const {
    scene,
    spriteEntries,
    textureCache,
    texturePromises,
    spriteData,
    zIndex,
    cancelledRef,
  } = args;

  const current = spriteEntries.get(spriteData.key);
  if (current) {
    applySpriteLayout(current.sprite, spriteData, zIndex);
    if (current.src === spriteData.src) {
      return;
    }

    const cachedTexture = textureCache.get(spriteData.src);
    current.src = spriteData.src;
    if (cachedTexture) {
      current.sprite.texture = cachedTexture;
      current.sprite.visible = true;
      return;
    }

    // Keep the previously visible texture in place until the next zoom-tier
    // derivative is ready so zoom-crossing does not black out the wall.
    void loadTexture(spriteData.src, textureCache, texturePromises).then((texture) => {
      if (cancelledRef()) return;
      const latest = spriteEntries.get(spriteData.key);
      if (!latest || latest.sprite !== current.sprite || latest.src !== spriteData.src) return;
      latest.sprite.texture = texture;
      latest.sprite.visible = true;
    });
    return;
  }

  const sprite = new Sprite();
  sprite.visible = false;
  applySpriteLayout(sprite, spriteData, zIndex);
  scene.addChild(sprite);
  spriteEntries.set(spriteData.key, { sprite, src: spriteData.src });

  const cachedTexture = textureCache.get(spriteData.src);
  if (cachedTexture) {
    sprite.texture = cachedTexture;
    sprite.visible = true;
    return;
  }

  void loadTexture(spriteData.src, textureCache, texturePromises).then((texture) => {
    if (cancelledRef()) return;
    const latest = spriteEntries.get(spriteData.key);
    if (!latest || latest.sprite !== sprite || latest.src !== spriteData.src) return;
    latest.sprite.texture = texture;
    latest.sprite.visible = true;
  });
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

async function loadTexture(
  src: string,
  textureCache: Map<string, Texture>,
  texturePromises: Map<string, Promise<Texture>>,
): Promise<Texture> {
  const cachedTexture = textureCache.get(src);
  if (cachedTexture) return cachedTexture;

  const pending = texturePromises.get(src);
  if (pending) return pending;

  const promise = (async () => {
    const image = new Image();
    image.decoding = 'async';
    image.src = src;
    await image.decode().catch(
      () =>
        new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error(`Could not load texture: ${src}`));
        }),
    );
    const texture = Texture.from(image);
    textureCache.set(src, texture);
    texturePromises.delete(src);
    return texture;
  })().catch((error) => {
    texturePromises.delete(src);
    throw error;
  });

  texturePromises.set(src, promise);
  return promise;
}
