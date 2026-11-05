import type { Application } from 'pixi.js';

/**
 * Tear down one Pixi app and remove its canvas, leaving Pixi's
 * page-wide pools alone. `app.destroy(true)` also releases those pools,
 * which nulls batches another live app (the wall, under the editor) is
 * still drawing with; its next frame throws and its ticker stops.
 */
export function destroyPixiApp(app: Application): void {
  app.destroy({ removeView: true, releaseGlobalResources: false }, { children: true });
}
