import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  EDIT_LIMITS,
  EDIT_LOOKS,
  FULL_CROP,
  NEUTRAL_EDIT,
  isNeutralEdit,
  turnedSize,
  type EditCrop,
  type EditLook,
  type EditRotation,
  type PhotoEdit,
} from '../../../../shared/api/edits.js';
import { mediaOriginalPath } from '../../../../shared/api/media.js';
import type { PhotoQueryRecord } from '../../../../shared/api/photos.js';
import { CropOverlay } from './CropOverlay.js';
import { centeredCrop, type ScreenRect } from './cropMath.js';
import { EditorScene } from './editorScene.js';

type Tab = 'crop' | 'adjust' | 'looks';
const TABS = ['crop', 'adjust', 'looks'] as const;
const EDITOR_TAB_STORAGE_KEY = 'photo-wall.editor-tab';

/** The tab the curator last used, or Crop the first time. */
function readStoredTab(): Tab {
  try {
    const stored = window.localStorage.getItem(EDITOR_TAB_STORAGE_KEY);
    return TABS.find((name) => name === stored) ?? 'crop';
  } catch {
    return 'crop';
  }
}

function storeTab(tab: Tab): void {
  try {
    window.localStorage.setItem(EDITOR_TAB_STORAGE_KEY, tab);
  } catch {
    // Storage blocked; the editor just opens on Crop next time.
  }
}

const ASPECTS = ['free', 'original', '1:1', '4:3', '3:4', '16:9'] as const;
type Aspect = (typeof ASPECTS)[number];
const ASPECT_RATIOS: Record<Exclude<Aspect, 'free' | 'original'>, number> = {
  '1:1': 1,
  '4:3': 4 / 3,
  '3:4': 3 / 4,
  '16:9': 16 / 9,
};

const LOOK_LABELS: Record<EditLook, string> = {
  none: 'Original',
  greyscale: 'Greyscale',
  blackAndWhite: 'Black & white',
  sepia: 'Sepia',
  vintage: 'Vintage',
  polaroid: 'Polaroid',
  kodachrome: 'Kodachrome',
  technicolor: 'Technicolor',
  browni: 'Browni',
  lsd: 'LSD',
  night: 'Night',
  predator: 'Predator',
  negative: 'Negative',
  toBGR: 'Swap red & blue',
};

type Slider =
  | 'temperature'
  | 'exposure'
  | 'brightness'
  | 'contrast'
  | 'saturation'
  | 'hue'
  | 'blur'
  | 'grain';

const percent = (v: number) => `${Math.round(v * 100)}`;
const whole = (v: number) => `${v}`;
const stops = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(2)}`;

// Temperature comes first: it is the adjustment used most (Michael, 2026-11-04).
const SLIDERS: {
  key: Slider;
  label: string;
  min: number;
  max: number;
  step: number;
  group: string;
  format: (value: number) => string;
  className?: string;
}[] = [
  { key: 'temperature', label: 'Temperature', min: -EDIT_LIMITS.temperature, max: EDIT_LIMITS.temperature, step: 0.01, group: 'Light', format: percent, className: 'photo-editor__slider--temperature' },
  { key: 'exposure', label: 'Exposure', min: -EDIT_LIMITS.exposure, max: EDIT_LIMITS.exposure, step: 0.05, group: 'Light', format: stops },
  { key: 'brightness', label: 'Brightness', min: -EDIT_LIMITS.brightness, max: EDIT_LIMITS.brightness, step: 0.01, group: 'Light', format: percent },
  { key: 'contrast', label: 'Contrast', min: -EDIT_LIMITS.contrast, max: EDIT_LIMITS.contrast, step: 0.01, group: 'Light', format: percent },
  { key: 'saturation', label: 'Saturation', min: -EDIT_LIMITS.saturation, max: EDIT_LIMITS.saturation, step: 0.01, group: 'Color', format: percent },
  { key: 'hue', label: 'Hue', min: -EDIT_LIMITS.hue, max: EDIT_LIMITS.hue, step: 1, group: 'Color', format: whole },
  { key: 'blur', label: 'Blur', min: 0, max: EDIT_LIMITS.blur, step: 1, group: 'Effects', format: whole },
  { key: 'grain', label: 'Grain', min: 0, max: EDIT_LIMITS.grain, step: 1, group: 'Effects', format: whole },
];

export interface PhotoEditorProps {
  photo: PhotoQueryRecord;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  /** Save the edit; a neutral edit means "back to the original". */
  onSave: (edit: PhotoEdit) => void;
  onRevert: () => void;
}

/**
 * The curator's light editor: crop and straighten with a frame that
 * stays put while the photo moves under it, light and color sliders,
 * and one-click looks. It edits a recipe; the original file is never
 * changed.
 */
export function PhotoEditor(props: PhotoEditorProps): JSX.Element {
  const { photo, saving, error, onCancel, onSave, onRevert } = props;
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<EditorScene | null>(null);
  const [edit, setEdit] = useState<PhotoEdit>(() => photo.edit ?? NEUTRAL_EDIT);
  const [tab, setTab] = useState<Tab>(readStoredTab);
  const [aspect, setAspect] = useState<Aspect>('free');
  const [frame, setFrame] = useState<ScreenRect | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [layoutTick, setLayoutTick] = useState(0);
  const cropping = tab === 'crop';

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const scene = new EditorScene();
    sceneRef.current = scene;
    scene
      .init(stage, () => setLayoutTick((n) => n + 1))
      .then(() => scene.load(mediaOriginalPath(photo.id, 'detail', photo.mtimeMs)))
      .then(setSize)
      .catch((err: unknown) => {
        if (sceneRef.current === scene) {
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      sceneRef.current = null;
      scene.destroy();
    };
  }, [photo.id, photo.mtimeMs]);

  useLayoutEffect(() => {
    if (!size) return;
    const next = sceneRef.current?.render(edit, cropping) ?? null;
    setFrame((current) => (cropping ? sameRect(current, next) : null));
  }, [edit, cropping, size, layoutTick]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onCancel]);

  const refit = () => sceneRef.current?.refitFrame();
  const update = (patch: Partial<PhotoEdit>) => setEdit((current) => ({ ...current, ...patch }));

  const turned = size ? turnedSize(size.width, size.height, edit.rotation) : null;
  const ratioOf = (choice: Aspect): number | null => {
    if (choice === 'free') return null;
    if (choice === 'original') return turned ? turned.width / turned.height : null;
    return ASPECT_RATIOS[choice];
  };

  const chooseAspect = (choice: Aspect) => {
    setAspect(choice);
    const ratio = ratioOf(choice);
    if (ratio === null || !turned) return;
    refit();
    update({ crop: centeredCrop(ratio, turned.width, turned.height) });
  };

  const rotate = (degrees: 90 | -90) => {
    refit();
    setAspect('free');
    setEdit((current) => ({
      ...current,
      rotation: (((current.rotation + degrees) % 360) + 360) % 360 as EditRotation,
      crop: FULL_CROP,
    }));
  };

  const mirror = (axis: 'x' | 'y') => {
    refit();
    setEdit((current) => {
      const c = current.crop;
      return axis === 'x'
        ? { ...current, flipX: !current.flipX, crop: { ...c, x: 1 - c.x - c.w } }
        : { ...current, flipY: !current.flipY, crop: { ...c, y: 1 - c.y - c.h } };
    });
  };

  const resetCrop = () => {
    refit();
    setAspect('free');
    update({ rotation: 0, straighten: 0, flipX: false, flipY: false, crop: FULL_CROP });
  };

  const onCropChange = useCallback(
    (next: (crop: EditCrop) => EditCrop) => setEdit((current) => ({ ...current, crop: next(current.crop) })),
    [],
  );
  const onFrameChange = useCallback((next: ScreenRect) => sceneRef.current?.setFrame(next), []);

  const unchanged = isNeutralEdit(edit) && !photo.edit;

  return (
    <div className="photo-editor" data-testid="photo-editor" data-photo-id={photo.id} role="dialog" aria-label="Edit photo">
      <header className="photo-editor__bar">
        <button type="button" className="photo-editor__button" onClick={onCancel} data-testid="photo-editor-cancel">
          Cancel
        </button>
        <span className="photo-editor__title">{photo.filename}</span>
        {photo.edit && (
          <button
            type="button"
            className="photo-editor__button"
            onClick={onRevert}
            disabled={saving}
            data-testid="photo-editor-revert"
            title="Forget this photo's edits and show the original"
          >
            Revert to original
          </button>
        )}
        <button
          type="button"
          className="photo-editor__button photo-editor__button--primary"
          onClick={() => onSave(edit)}
          disabled={saving || unchanged || !size}
          data-testid="photo-editor-save"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </header>

      <div className="photo-editor__body">
        <div className="photo-editor__stage" ref={stageRef} data-testid="photo-editor-stage">
          {!size && !loadError && <p className="photo-editor__status">Loading photo…</p>}
          {loadError && <p className="photo-editor__status photo-editor__status--error">Could not load the photo: {loadError}</p>}
          {cropping && frame && (
            <CropOverlay
              frame={frame}
              crop={edit.crop}
              ratio={ratioOf(aspect)}
              onCropChange={onCropChange}
              onFrameChange={onFrameChange}
            />
          )}
        </div>

        <aside className="photo-editor__panel">
          <nav className="photo-editor__tabs" role="tablist">
            {TABS.map((name) => (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={tab === name}
                className={`photo-editor__tab${tab === name ? ' is-active' : ''}`}
                onClick={() => {
                  if (name === 'crop') refit();
                  setTab(name);
                  storeTab(name);
                }}
                data-testid={`photo-editor-tab-${name}`}
              >
                {name === 'crop' ? 'Crop' : name === 'adjust' ? 'Adjust' : 'Looks'}
              </button>
            ))}
          </nav>

          {error && <p className="photo-editor__status photo-editor__status--error">{error}</p>}

          {tab === 'crop' && (
            <div className="photo-editor__section">
              <p className="photo-editor__hint">Drag the photo to move it. Scroll or pinch to zoom. Drag the corners to resize the frame.</p>
              <div className="photo-editor__chips">
                {ASPECTS.map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    className={`photo-editor__chip${aspect === choice ? ' is-active' : ''}`}
                    onClick={() => chooseAspect(choice)}
                    data-testid={`photo-editor-aspect-${choice}`}
                  >
                    {choice === 'free' ? 'Free' : choice === 'original' ? 'Original' : choice}
                  </button>
                ))}
              </div>
              <SliderRow
                label="Straighten"
                value={edit.straighten}
                min={-EDIT_LIMITS.straighten}
                max={EDIT_LIMITS.straighten}
                step={0.5}
                format={(v) => `${v}°`}
                onChange={(straighten) => update({ straighten })}
                testId="photo-editor-straighten"
              />
              <div className="photo-editor__chips">
                <button type="button" className="photo-editor__chip" onClick={() => rotate(-90)} data-testid="photo-editor-rotate-left">⟲ Rotate left</button>
                <button type="button" className="photo-editor__chip" onClick={() => rotate(90)} data-testid="photo-editor-rotate-right">⟳ Rotate right</button>
                <button type="button" className={`photo-editor__chip${edit.flipX ? ' is-active' : ''}`} onClick={() => mirror('x')}>Flip ↔</button>
                <button type="button" className={`photo-editor__chip${edit.flipY ? ' is-active' : ''}`} onClick={() => mirror('y')}>Flip ↕</button>
                <button type="button" className="photo-editor__chip" onClick={resetCrop}>Reset crop</button>
              </div>
            </div>
          )}

          {tab === 'adjust' && (
            <div className="photo-editor__section">
              {['Light', 'Color', 'Effects'].map((group) => (
                <div key={group} className="photo-editor__group">
                  <h3 className="photo-editor__heading">{group}</h3>
                  {SLIDERS.filter((s) => s.group === group).map((s) => (
                    <SliderRow
                      key={s.key}
                      label={s.label}
                      value={edit[s.key]}
                      min={s.min}
                      max={s.max}
                      step={s.step}
                      format={s.format}
                      className={s.className}
                      onChange={(value) => update({ [s.key]: value })}
                      testId={`photo-editor-${s.key}`}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}

          {tab === 'looks' && (
            <div className="photo-editor__section photo-editor__chips">
              {EDIT_LOOKS.map((look) => (
                <button
                  key={look}
                  type="button"
                  className={`photo-editor__chip${edit.look === look ? ' is-active' : ''}`}
                  onClick={() => update({ look })}
                  data-testid={`photo-editor-look-${look}`}
                >
                  {LOOK_LABELS[look]}
                </button>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function SliderRow(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
  testId: string;
  className?: string;
}): JSX.Element {
  const { label, value, min, max, step, format, onChange, testId, className } = props;
  // Double-click a slider to put it back to neutral.
  const neutral = Math.min(max, Math.max(min, 0));
  return (
    <label className={`photo-editor__slider${className ? ` ${className}` : ''}`} onDoubleClick={() => onChange(neutral)}>
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        data-testid={testId}
      />
      <output>{format(value)}</output>
    </label>
  );
}

function sameRect(current: ScreenRect | null, next: ScreenRect | null): ScreenRect | null {
  if (!current || !next) return next;
  const close = (a: number, b: number) => Math.abs(a - b) < 0.25;
  return close(current.left, next.left) &&
    close(current.top, next.top) &&
    close(current.width, next.width) &&
    close(current.height, next.height)
    ? current
    : next;
}
