import {
  Application,
  BlurFilter,
  ColorMatrixFilter,
  Container,
  Graphics,
  ImageSource,
  NoiseFilter,
  Sprite,
  Texture,
  type Filter,
} from 'pixi.js';
import {
  blurSigma,
  editColorMatrix,
  grainNoise,
  straightenCover,
  turnedSize,
  type PhotoEdit,
} from '../../../../shared/api/edits.js';
import type { ScreenRect } from './cropMath.js';

/** Share of the stage the crop fills when the editor fits it. */
const FIT_VIEW = 0.94;
const FIT_CROPPING = 0.82;
const PIXI_BLUR_SIGMA_PER_STRENGTH = 1.37;

/**
 * Pixi preview of a light edit. The scene graph mirrors how the server
 * renders: view (fit + crop mask) > flip (mirror in turned axes) >
 * photo (quarter turn + straighten, zoomed to cover) > sprite (colors).
 */
export class EditorScene {
  private readonly app = new Application();
  private readonly view = new Container();
  private readonly flip = new Container();
  private readonly photo = new Container();
  private readonly mask = new Graphics();
  private readonly color = new ColorMatrixFilter();
  private readonly blur = new BlurFilter({ strength: 0, quality: 4 });
  private readonly noise = new NoiseFilter({ noise: 0, seed: 0.5 });
  private sprite: Sprite | null = null;
  private texture: Texture | null = null;
  /** While cropping, the crop frame stays where it is on screen. */
  private cropFrame: ScreenRect | null = null;
  private destroyed = false;
  private ready = false;

  async init(host: HTMLElement, onResize: () => void): Promise<void> {
    await this.app.init({
      background: '#0c0a09',
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
      resizeTo: host,
    });
    if (this.destroyed) {
      this.app.destroy(true, { children: true });
      return;
    }
    this.app.canvas.classList.add('photo-editor__canvas');
    host.prepend(this.app.canvas);
    for (const filter of [this.color, this.blur, this.noise] as Filter[]) {
      filter.resolution = this.app.renderer.resolution;
    }
    this.photo.label = 'photo';
    this.flip.addChild(this.photo);
    this.view.addChild(this.flip, this.mask);
    this.app.stage.addChild(this.view);
    this.app.renderer.on('resize', () => {
      this.cropFrame = null;
      onResize();
    });
    this.ready = true;
  }

  /** Load the unedited photo; resolves with its pixel size. */
  async load(src: string): Promise<{ width: number; height: number }> {
    const image = new Image();
    image.decoding = 'async';
    image.src = src;
    await image.decode();
    if (this.destroyed || !this.ready) throw new Error('editor closed');
    this.texture = new Texture({
      source: new ImageSource({ resource: image, autoGenerateMipmaps: true }),
    });
    this.sprite = new Sprite(this.texture);
    this.sprite.anchor.set(0.5);
    this.photo.addChild(this.sprite);
    return { width: image.naturalWidth, height: image.naturalHeight };
  }

  /** Forget where the crop frame was, so the next render fits it again. */
  refitFrame(): void {
    this.cropFrame = null;
  }

  /** Pin the crop frame at `frame` (the user resized it). */
  setFrame(frame: ScreenRect): void {
    this.cropFrame = frame;
  }

  /** Draw the edit; returns where the crop sits on screen. */
  render(edit: PhotoEdit, cropping: boolean): ScreenRect | null {
    const { sprite } = this;
    if (!sprite || this.destroyed) return null;
    const { width: W, height: H } = turnedSize(sprite.texture.width, sprite.texture.height, edit.rotation);
    this.photo.angle = edit.rotation + edit.straighten;
    this.photo.scale.set(straightenCover(W, H, edit.straighten));
    this.flip.scale.set(edit.flipX ? -1 : 1, edit.flipY ? -1 : 1);

    const { crop } = edit;
    const cx = -W / 2 + crop.x * W;
    const cy = -H / 2 + crop.y * H;
    const cw = crop.w * W;
    const ch = crop.h * H;
    const screen = this.app.screen;
    let scale: number;
    if (cropping && this.cropFrame) {
      scale = this.cropFrame.width / cw;
    } else {
      scale = Math.min(screen.width / cw, screen.height / ch) * (cropping ? FIT_CROPPING : FIT_VIEW);
    }
    const frame: ScreenRect =
      cropping && this.cropFrame
        ? { ...this.cropFrame, height: ch * scale }
        : {
            left: screen.width / 2 - (cw * scale) / 2,
            top: screen.height / 2 - (ch * scale) / 2,
            width: cw * scale,
            height: ch * scale,
          };
    if (cropping) this.cropFrame = frame;
    this.view.scale.set(scale);
    this.view.position.set(frame.left - cx * scale, frame.top - cy * scale);

    this.mask.clear().rect(cx, cy, cw, ch).fill(0xffffff);
    this.mask.visible = !cropping;
    this.view.mask = cropping ? null : this.mask;

    const filters: Filter[] = [];
    const matrix = editColorMatrix(edit);
    if (matrix) {
      this.color.matrix = matrix as ColorMatrixFilter['matrix'];
      this.color.resources.colorMatrixUniforms.update();
      filters.push(this.color);
    }
    if (edit.blur > 0) {
      // Blur is a share of the crop's long edge, measured on screen here.
      // Pixi's blur (quality 4) spreads about 1.37 px of Gaussian sigma per
      // unit of strength (measured), and the server blurs by sigma.
      this.blur.strength =
        blurSigma(edit.blur, Math.max(frame.width, frame.height)) / PIXI_BLUR_SIGMA_PER_STRENGTH;
      filters.push(this.blur);
    }
    if (edit.grain > 0) {
      this.noise.noise = grainNoise(edit.grain);
      filters.push(this.noise);
    }
    sprite.filters = filters.length > 0 ? filters : null;
    return frame;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (!this.ready) return;
    this.app.destroy(true, { children: true });
    this.texture?.destroy(true);
    this.color.destroy();
    this.blur.destroy();
    this.noise.destroy();
  }
}
