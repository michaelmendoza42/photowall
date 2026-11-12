import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type PointerEvent,
} from 'react';
import { WheelGestures, type WheelEventData } from 'wheel-gestures';
import Lightbox, { type SlideImage } from 'yet-another-react-lightbox';
import type { PhotoQueryRecord } from '../../../../shared/api/photos.js';
import { computeFocusedPhotoRenderSize } from '../wall/hoverPreview.js';
import { photoAlbumName } from '../wall/albumAreas.js';
import {
  FRAME_CHOICES,
  FRAME_MATS,
  type FrameChoice,
  type FrameMat,
  type FrameStyle,
  type PhotoFrame,
} from '../../../../shared/api/curation.js';
import {
  FRAME_LABELS,
  galleryFrameDataUrl,
  galleryMouldingRatio,
  MAT_LABELS,
} from '../wall/featuredFrames.js';
import { framedPhotoAspect, galleryFrameGeometry } from '../wall/wallSpacing.js';
import {
  MAX_WHEEL_ZOOM_STEP,
  WHEEL_ZOOM_SENSITIVITY,
  type ScreenPoint,
} from '../wall/zoomInput.js';
import {
  LIGHTBOX_ZOOM_FIT,
  clampLightboxPan,
  isLightboxZoomed,
  panLightbox,
  zoomLightboxAbout,
  type LightboxSize,
  type LightboxZoom,
} from './lightboxZoom.js';
import {
  resolveWallMediaSource,
  type WallMediaSourcePhoto,
  type WallMediaSourceResolver,
} from '../wall/mediaSourceResolver.js';

export interface FocusedPhotoLightboxProps {
  photo: PhotoQueryRecord;
  onClose: () => void;
  /** Step to the neighbouring photo on the wall. */
  onNext?: () => void;
  onPrevious?: () => void;
  mediaSourceResolver?: WallMediaSourceResolver;
  /** Curator-only: keep the photo from guests, or show it again. */
  curatorPrivate?: {
    private: boolean;
    onToggle: () => void;
    pending?: boolean;
  };
  /** Curator-only: make the photo its album's featured photo, or stop featuring it. */
  /** The frame to show the photo in, when the photo view shows frames. */
  frame?: { style: FrameStyle; mat: FrameMat };
  /** Curator-only: pick the photo's frame and mat. */
  curatorFrame?: {
    current: PhotoFrame;
    onSave: (frame: FrameChoice, mat: FrameMat) => void;
    pending?: boolean;
  };
  curatorFeatured?: {
    featured: boolean;
    /** Its frame and mat. */
    frame: PhotoFrame;
    /** Feature it in this frame, or change its frame. */
    onFeature: (frame: FrameChoice, mat: FrameMat) => void;
    onUnfeature: () => void;
    pending?: boolean;
    /**
     * The album's current featured photo while the curator confirms
     * replacing it; the dialog previews it.
     */
    replacing?: PhotoQueryRecord;
    onConfirmReplace?: () => void;
    onCancelReplace?: () => void;
  };
  /** Curator-only: star or unstar the photo (Favorites). */
  curatorStar?: {
    starred: boolean;
    onToggle: () => void;
    pending?: boolean;
  };
  /** Curator-only: hide the photo (moved to `_hidden`), or restore a hidden one. */
  curatorAction?: {
    kind: 'hide' | 'restore';
    onRun: () => void;
    pending?: boolean;
  };
  /** The album a Favorites photo came from, shown small at the bottom. */
  sourceAlbum?: string;
  /** Curator-only: open the light editor for this photo. */
  onEdit?: () => void;
  /** The photo's image would not load (it may no longer be visible to this viewer). */
  onImageError?: () => void;
}

export function buildFocusedPhotoLightboxSlide(
  photo: WallMediaSourcePhoto,
  mediaSourceResolver?: WallMediaSourceResolver,
): SlideImage {
  return {
    src: resolveWallMediaSource(photo, 'modal', mediaSourceResolver),
    alt: '',
    ...(photo.width > 0 ? { width: photo.width } : {}),
    ...(photo.height > 0 ? { height: photo.height } : {}),
  };
}

/** Shortest horizontal travel, in CSS px, that counts as a swipe. */
const SWIPE_MIN_PX = 40;

/**
 * Which way a touch swipe steps: swiping left brings in the next photo
 * (next moves right across the wall), swiping right the previous one.
 * Mostly-vertical or short moves are not swipes.
 */
export function swipeStepDirection(dx: number, dy: number): 'next' | 'previous' | null {
  if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  return dx < 0 ? 'next' : 'previous';
}

/** How long the photo takes to slide out, and the next one in. */
const SWIPE_ANIMATION_MS = 180;

/**
 * Touch swipe on the focused photo. The photo follows the finger; a swipe
 * slides it off that side, steps to the next/previous photo and slides
 * the new one in from the other side. A short drag springs back.
 */
function useSwipeStep(input: {
  photoId: string;
  viewportWidth: number;
  onNext: (() => void) | undefined;
  onPrevious: (() => void) | undefined;
}) {
  const { photoId, viewportWidth, onNext, onPrevious } = input;
  const [offset, setOffset] = useState(0);
  const [animating, setAnimating] = useState(false);
  const start = useRef<{ id: number; x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const timers = useRef<number[]>([]);
  // Side the next photo slides in from, set once the old one is off-screen.
  const incoming = useRef(0);

  useEffect(() => () => timers.current.forEach((id) => clearTimeout(id)), []);

  useLayoutEffect(() => {
    const from = incoming.current;
    if (!from) return undefined;
    incoming.current = 0;
    setAnimating(false);
    setOffset(from);
    // Two frames so the start position paints before the slide begins.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        setAnimating(true);
        setOffset(0);
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [photoId]);

  const later = (ms: number, run: () => void) => {
    timers.current.push(window.setTimeout(run, ms));
  };

  const handlers = {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      swiped.current = false;
      start.current =
        event.pointerType === 'mouse'
          ? null
          : { id: event.pointerId, x: event.clientX, y: event.clientY };
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const from = start.current;
      if (!from || from.id !== event.pointerId || prefersReducedMotion()) return;
      const dx = event.clientX - from.x;
      if (Math.abs(dx) < Math.abs(event.clientY - from.y)) return;
      setAnimating(false);
      setOffset(dx);
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      const from = start.current;
      start.current = null;
      if (!from || from.id !== event.pointerId) return;
      const step = swipeStepDirection(event.clientX - from.x, event.clientY - from.y);
      if (!slideTo(step)) {
        setAnimating(true);
        setOffset(0);
        return;
      }
      swiped.current = true;
    },
    onPointerCancel() {
      start.current = null;
      setAnimating(true);
      setOffset(0);
    },
  };

  /**
   * Slides the photo off toward `step` and steps to the neighbour, which
   * slides in from the other side. False when there is nothing to step to.
   */
  function slideTo(step: 'next' | 'previous' | null): boolean {
    const stepTo = step === 'next' ? onNext : step === 'previous' ? onPrevious : undefined;
    if (!step || !stepTo) return false;
    if (prefersReducedMotion()) {
      setOffset(0);
      stepTo();
      return true;
    }
    // Swiping left (next) sends the photo off the left; the new one
    // comes in from the right, and the reverse for previous.
    const away = step === 'next' ? -viewportWidth : viewportWidth;
    setAnimating(true);
    setOffset(away);
    later(SWIPE_ANIMATION_MS, () => {
      incoming.current = -away;
      stepTo();
    });
    return true;
  }

  /** Drops a swipe in progress without the spring-back (a pinch took over). */
  const reset = () => {
    start.current = null;
    setAnimating(false);
    setOffset(0);
  };

  /** True once for the click a swipe gesture may still deliver. */
  const consumeClick = (): boolean => {
    const was = swiped.current;
    swiped.current = false;
    return was;
  };

  return { offset, animating, handlers, reset, slideTo, consumeClick };
}

/**
 * Steps once per two-finger sideways trackpad swipe. wheel-gestures splits
 * the wheel stream into gestures and flags the momentum tail, so only
 * finger travel counts, and only until the swipe has stepped; the next
 * step needs a new gesture, which can start while the last tail runs.
 *
 * A new swipe ends the last one's gesture either way the library sees it:
 * after a pause, or by cutting into the tail when an event jumps to twice
 * the one before. A tail can jump like that too, when the browser merges
 * frames late in it, so a cut only counts after a touch: fingers landing
 * on the trackpad send an event a frame or more late and much slower than
 * the tail before it, while a merged frame comes late at the tail's own
 * speed. In the 2026-11-06 recording touches ran at 0.1-0.4x the speed
 * before them and merged frames at about 0.95x.
 */
export function createWheelSwipeStepper(
  slideTo: (step: 'next' | 'previous' | null) => boolean,
): (event: WheelEventData) => void {
  const gestures = WheelGestures({ preventWheelAction: false, reverseSign: false });
  let locked = false;
  let lastEventAt = Number.NEGATIVE_INFINITY;
  let lastSpeed = 0;
  let eventCount = 0;
  let touchedAt = Number.NEGATIVE_INFINITY;
  gestures.on('wheel', (state) => {
    if (state.isEnding) {
      const touched = eventCount - touchedAt <= WHEEL_TOUCH_LEAD_EVENTS;
      if (!state.isMomentumCancel || touched) locked = false;
      return;
    }
    if (state.isMomentum || locked) return;
    const [dx, dy] = state.axisMovement;
    const step = swipeStepDirection(-dx, -dy);
    if (step) locked = slideTo(step);
  });
  return (event) => {
    const gapMs = event.timeStamp - lastEventAt;
    // Pixels per ms, so a merged frame (twice the travel in twice the
    // time) matches the tail around it.
    const speed = Math.hypot(event.deltaX, event.deltaY) / Math.max(gapMs, 1);
    eventCount += 1;
    if (gapMs >= WHEEL_TOUCH_GAP_MS && speed < lastSpeed * WHEEL_TOUCH_SPEED_RATIO) {
      touchedAt = eventCount;
    }
    lastEventAt = event.timeStamp;
    lastSpeed = speed;
    gestures.feedWheel(event);
  };
}

/** A touch event arrives at least this late: a frame and a half. */
const WHEEL_TOUCH_GAP_MS = 25;
/** A touch is at most this fraction of the speed of the event before it. */
const WHEEL_TOUCH_SPEED_RATIO = 0.6;
/** How many events before the cut the touch may come (touch, maybe a crawl, then the jump). */
const WHEEL_TOUCH_LEAD_EVENTS = 2;

/**
 * A two-finger sideways trackpad swipe steps like a touch swipe: fingers
 * moving left (positive deltaX) bring in the next photo, one photo per
 * swipe whatever its momentum tail does. Off while the photo is zoomed
 * in (scrolling pans).
 */
function useWheelSwipeStep(input: {
  element: HTMLElement | null;
  isZoomed: () => boolean;
  slideTo: (step: 'next' | 'previous' | null) => boolean;
}) {
  const latest = useRef(input);
  latest.current = input;
  const { element } = input;
  // Lives outside the listener: the slide element is replaced when the
  // photo steps, and the swipe's tail must stay locked across that.
  const stepper = useRef<((event: WheelEventData) => void) | null>(null);
  stepper.current ??= createWheelSwipeStepper((step) => latest.current.slideTo(step));

  useEffect(() => {
    if (!element) return undefined;
    function onWheel(event: WheelEvent): void {
      if (event.ctrlKey || event.metaKey || latest.current.isZoomed()) return;
      // Keeps the browser's swipe-to-go-back from taking a sideways swipe.
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) event.preventDefault();
      stepper.current?.(event);
    }
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [element]);
}

/** Pointer travel, in CSS px, after which a press no longer counts as a tap. */
const TAP_SLOP_PX = 6;

/**
 * Pinch zoom on the focused photo. Two fingers zoom about their midpoint
 * and pan with it; once zoomed in, one finger (or a mouse drag, or a
 * trackpad scroll) pans, never past the photo's edges. A trackpad pinch
 * (ctrl/⌘ + wheel) zooms about the cursor. Each new photo opens fitted.
 */
function useLightboxPinchZoom(input: {
  photoId: string;
  frame: LightboxSize;
  viewport: LightboxSize;
  element: HTMLElement | null;
}) {
  const { photoId, frame, viewport, element } = input;
  const [zoom, setZoom] = useState<LightboxZoom>(LIGHTBOX_ZOOM_FIT);
  const zoomRef = useRef(zoom);
  const sizes = useRef({ frame, viewport });
  sizes.current = { frame, viewport };
  const pointers = useRef(new Map<number, ScreenPoint>());
  const downAt = useRef<ScreenPoint | null>(null);
  const moved = useRef(false);

  const apply = (next: LightboxZoom) => {
    zoomRef.current = next;
    setZoom(next);
  };
  const centered = (point: ScreenPoint): ScreenPoint => ({
    x: point.x - sizes.current.viewport.width / 2,
    y: point.y - sizes.current.viewport.height / 2,
  });

  useLayoutEffect(() => {
    pointers.current.clear();
    apply(LIGHTBOX_ZOOM_FIT);
  }, [photoId]);

  useEffect(() => {
    apply(clampLightboxPan(zoomRef.current, frame, viewport));
  }, [frame.width, frame.height, viewport.width, viewport.height]);

  useEffect(() => {
    if (!element) return undefined;
    function onWheel(event: WheelEvent): void {
      const { frame: f, viewport: v } = sizes.current;
      const current = zoomRef.current;
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const factor = Math.min(
          MAX_WHEEL_ZOOM_STEP,
          Math.max(1 / MAX_WHEEL_ZOOM_STEP, Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY)),
        );
        const at = centered({ x: event.clientX, y: event.clientY });
        apply(zoomLightboxAbout(current, current.scale * factor, at, at, f, v));
      } else if (isLightboxZoomed(current)) {
        event.preventDefault();
        apply(panLightbox(current, -event.deltaX, -event.deltaY, f, v));
      }
    }
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [element]);

  const handlers = {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      const point = { x: event.clientX, y: event.clientY };
      pointers.current.set(event.pointerId, point);
      if (pointers.current.size === 1) {
        downAt.current = point;
        moved.current = false;
      } else {
        moved.current = true;
      }
    },
    /** True when the move zoomed or panned, so it is not a swipe. */
    onPointerMove(event: PointerEvent<HTMLElement>): boolean {
      const map = pointers.current;
      const previous = map.get(event.pointerId);
      if (!previous) return false;
      const point = { x: event.clientX, y: event.clientY };
      const { frame: f, viewport: v } = sizes.current;
      const current = zoomRef.current;
      if (map.size >= 2) {
        const [a, b] = [...map.values()];
        const beforeMid = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
        const beforeDistance = Math.hypot(b!.x - a!.x, b!.y - a!.y);
        map.set(event.pointerId, point);
        const [c, d] = [...map.values()];
        const afterMid = { x: (c!.x + d!.x) / 2, y: (c!.y + d!.y) / 2 };
        const afterDistance = Math.hypot(d!.x - c!.x, d!.y - c!.y);
        if (beforeDistance > 0 && afterDistance > 0) {
          apply(
            zoomLightboxAbout(
              current,
              (current.scale * afterDistance) / beforeDistance,
              centered(beforeMid),
              centered(afterMid),
              f,
              v,
            ),
          );
        }
        return true;
      }
      map.set(event.pointerId, point);
      if (!isLightboxZoomed(current)) return false;
      const from = downAt.current;
      if (from && Math.hypot(point.x - from.x, point.y - from.y) > TAP_SLOP_PX) {
        moved.current = true;
      }
      apply(panLightbox(current, point.x - previous.x, point.y - previous.y, f, v));
      return true;
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      pointers.current.delete(event.pointerId);
    },
  };

  /** Pointers currently pressed on the photo. */
  const pointerCount = () => pointers.current.size;

  /** True once for the click a pinch or pan may still deliver. */
  const consumeClick = (): boolean => {
    const was = moved.current;
    moved.current = false;
    return was;
  };

  return { zoom, zoomRef, handlers, pointerCount, consumeClick };
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function FocusedPhotoLightbox(
  props: FocusedPhotoLightboxProps,
): JSX.Element {
  const {
    photo,
    onClose,
    onNext,
    onPrevious,
    mediaSourceResolver,
    curatorAction,
    curatorStar,
    curatorPrivate,
    curatorFeatured,
    curatorFrame,
    frame,
    sourceAlbum,
    onEdit,
    onImageError,
  } = props;

  const [pickerMode, setPickerMode] = useState<'feature' | 'frame' | null>(null);
  const framePickerOpen = pickerMode !== null;
  const setFramePickerOpen = (open: boolean) => {
    if (!open) setPickerMode(null);
  };
  // A different photo starts with the picker closed.
  useEffect(() => setPickerMode(null), [photo.id]);

  // The lightbox only ever holds the focused photo as its one slide, so
  // its own arrow-key navigation has nothing to move to (and it stops
  // those keys from propagating). Catch arrows in the capture phase and
  // route them to the wall's next/previous instead.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (curatorFeatured?.replacing || framePickerOpen) {
        // A featured-photo dialog is open: Escape closes it, not the
        // lightbox, and the photo shortcuts wait.
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          if (curatorFeatured?.replacing) curatorFeatured.onCancelReplace?.();
          else setFramePickerOpen(false);
        } else if (event.key !== 'Enter' && event.key !== 'Tab' && event.key !== ' ') {
          event.stopPropagation();
        }
        return;
      }
      if ((event.key === 'r' || event.key === 'R') && curatorAction && !curatorAction.pending) {
        event.preventDefault();
        curatorAction.onRun();
      } else if ((event.key === 's' || event.key === 'S') && curatorStar && !curatorStar.pending) {
        event.preventDefault();
        curatorStar.onToggle();
      } else if (
        (event.key === 'p' || event.key === 'P') &&
        curatorPrivate &&
        !curatorPrivate.pending
      ) {
        event.preventDefault();
        curatorPrivate.onToggle();
      } else if ((event.key === 'e' || event.key === 'E') && onEdit) {
        event.preventDefault();
        onEdit();
      } else if (event.key === 'ArrowRight' && onNext) {
        event.preventDefault();
        onNext();
      } else if (event.key === 'ArrowLeft' && onPrevious) {
        event.preventDefault();
        onPrevious();
      }
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [
    curatorAction,
    curatorFeatured,
    curatorPrivate,
    curatorStar,
    framePickerOpen,
    onEdit,
    onNext,
    onPrevious,
  ]);

  const slide = useMemo(
    () => buildFocusedPhotoLightboxSlide(photo, mediaSourceResolver),
    [photo, mediaSourceResolver],
  );
  const [viewportSize, setViewportSize] = useState(() => ({
    width: typeof window === 'undefined' ? 0 : window.innerWidth,
    height: typeof window === 'undefined' ? 0 : window.innerHeight,
  }));

  useLayoutEffect(() => {
    function syncViewport(): void {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    }
    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, []);

  const swipe = useSwipeStep({
    photoId: photo.id,
    viewportWidth: viewportSize.width,
    onNext,
    onPrevious,
  });

  // With frames on, the photo view fits the framed photo; the photo sits
  // inside its frame, uncropped.
  const framed = useMemo(() => {
    if (!frame) return null;
    const share = galleryMouldingRatio(frame.style);
    const aspect = framedPhotoAspect(photo, share, frame.mat);
    const size = computeFocusedPhotoRenderSize({
      viewport: viewportSize,
      photo: { width: aspect * 1000, height: 1000 },
    });
    const geometry = galleryFrameGeometry({ x: 0, y: 0, ...size }, photo, share, frame.mat);
    return { size, geometry };
  }, [frame, photo, viewportSize]);
  const renderSize = useMemo(
    () =>
      framed?.size ??
      computeFocusedPhotoRenderSize({
        viewport: viewportSize,
        photo: { width: photo.width, height: photo.height },
      }),
    [framed, photo.height, photo.width, viewportSize],
  );

  const [slideElement, setSlideElement] = useState<HTMLDivElement | null>(null);
  const pinch = useLightboxPinchZoom({
    photoId: photo.id,
    frame: renderSize,
    viewport: viewportSize,
    element: slideElement,
  });
  const zoomed = isLightboxZoomed(pinch.zoom);
  useWheelSwipeStep({
    element: slideElement,
    isZoomed: () => isLightboxZoomed(pinch.zoomRef.current),
    slideTo: swipe.slideTo,
  });

  // Zooming in swaps to the larger detail derivative for this photo.
  const [wantsDetail, setWantsDetail] = useState(false);
  useLayoutEffect(() => setWantsDetail(false), [photo.id]);
  useEffect(() => {
    if (zoomed) setWantsDetail(true);
  }, [zoomed]);
  const imageVariant = wantsDetail ? 'detail' : 'modal';
  const imageSrc = wantsDetail
    ? resolveWallMediaSource(photo, 'detail', mediaSourceResolver)
    : slide.src;

  const gestureHandlers = {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      pinch.handlers.onPointerDown(event);
      if (pinch.pointerCount() > 1) swipe.reset();
      else if (!isLightboxZoomed(pinch.zoomRef.current)) swipe.handlers.onPointerDown(event);
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      if (!pinch.handlers.onPointerMove(event)) swipe.handlers.onPointerMove(event);
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      pinch.handlers.onPointerUp(event);
      swipe.handlers.onPointerUp(event);
    },
    onPointerCancel(event: PointerEvent<HTMLElement>) {
      pinch.handlers.onPointerUp(event);
      swipe.handlers.onPointerCancel();
    },
    onPointerLeave(event: PointerEvent<HTMLElement>) {
      if (event.pointerType === 'mouse') pinch.handlers.onPointerUp(event);
    },
  };

  const frameX = swipe.offset + pinch.zoom.x;
  const frameTransform =
    frameX || pinch.zoom.y || zoomed
      ? `translate(${frameX}px, ${pinch.zoom.y}px) scale(${pinch.zoom.scale})`
      : undefined;

  const portalContainer = {
    className: 'focused-photo--lightbox',
    'data-testid': 'focused-photo-modal',
    'data-photo-id': photo.id,
    'data-focused-view-kind': 'lightbox',
  } as HTMLAttributes<HTMLDivElement>;

  return (
    <Lightbox
      open
      close={onClose}
      index={0}
      slides={[slide]}
      animation={{ fade: 180, swipe: 0 }}
      carousel={{ finite: true, preload: 0, padding: 0, spacing: 0 }}
      controller={{
        closeOnBackdropClick: true,
        closeOnEscape: true,
        disableSwipeNavigation: true,
      }}
      labels={{
        Lightbox: 'Focused photo',
        Close: 'Close focused photo',
        Previous: 'Previous photo',
        Next: 'Next photo',
      }}
      portal={{ container: portalContainer }}
      toolbar={{ buttons: [] }}
      render={{
        slide: () => (
          // This wrapper fills the slide, so the lightbox's own backdrop
          // click never sees a tap beside the photo; close on those here.
          <div
            className="focused-photo__slide"
            data-testid="focused-photo-backdrop"
            data-zoomed={zoomed ? 'true' : 'false'}
            ref={setSlideElement}
            onClick={(event) => {
              const swiped = swipe.consumeClick();
              const pinched = pinch.consumeClick();
              if (swiped || pinched) return;
              if (event.target === event.currentTarget) onClose();
            }}
            {...gestureHandlers}
          >
            <div
              className="focused-photo__frame"
              data-testid="focused-photo-frame"
              data-zoom={pinch.zoom.scale.toFixed(3)}
              data-frame={frame?.style}
              data-mat={frame?.mat}
              style={{
                width: renderSize.width,
                height: renderSize.height,
                ...(frame && framed
                  ? {
                      position: 'relative',
                      backgroundSize: '100% 100%',
                      backgroundImage: `url("${galleryFrameDataUrl(frame, renderSize.width, renderSize.height, framed.geometry, 2000)}")`,
                    }
                  : {}),
                transform: frameTransform,
                transition: swipe.animating && !zoomed
                  ? `transform ${SWIPE_ANIMATION_MS}ms ease-out`
                  : undefined,
              }}
            >
              <img
                className="focused-photo__img"
                data-testid="focused-photo-image"
                data-media-variant={imageVariant}
                src={imageSrc}
                alt=""
                draggable={false}
                onError={onImageError}
                style={
                  framed
                    ? {
                        position: 'absolute',
                        left: framed.geometry.photo.x,
                        top: framed.geometry.photo.y,
                        width: framed.geometry.photo.width,
                        height: framed.geometry.photo.height,
                      }
                    : undefined
                }
              />
            </div>
          </div>
        ),
        buttonPrev: () =>
          onPrevious ? (
            <button
              type="button"
              className="focused-photo__nav focused-photo__nav--previous"
              onClick={onPrevious}
              aria-label="Previous photo"
              data-testid="focused-photo-previous"
            >
              ‹
            </button>
          ) : null,
        buttonNext: () =>
          onNext ? (
            <button
              type="button"
              className="focused-photo__nav focused-photo__nav--next"
              onClick={onNext}
              aria-label="Next photo"
              data-testid="focused-photo-next"
            >
              ›
            </button>
          ) : null,
        controls: () => (
          <>
            {(curatorAction || curatorStar || curatorFeatured || curatorFrame || curatorPrivate || onEdit) && (
              <div className="focused-photo__curator">
                {curatorStar && (
                  <button
                    type="button"
                    className="focused-photo__curate"
                    onClick={curatorStar.onToggle}
                    disabled={curatorStar.pending}
                    aria-pressed={curatorStar.starred}
                    data-testid="focused-photo-star"
                    data-starred={curatorStar.starred ? 'true' : 'false'}
                    title={
                      curatorStar.starred
                        ? 'Take this photo out of Favorites (S)'
                        : 'Put this photo in Favorites (S)'
                    }
                  >
                    {curatorStar.starred ? '★ Unfavorite' : '☆ Favorite'}
                  </button>
                )}
                {curatorFeatured && (
                  <button
                    type="button"
                    className="focused-photo__curate"
                    onClick={() => setPickerMode('feature')}
                    disabled={curatorFeatured.pending}
                    aria-pressed={curatorFeatured.featured}
                    data-testid="focused-photo-featured"
                    data-featured={curatorFeatured.featured ? 'true' : 'false'}
                    title={
                      curatorFeatured.featured
                        ? 'This is the album’s centerpiece. Change its frame or unfeature it'
                        : 'Make this the album’s centerpiece: shown large and framed at the album’s center'
                    }
                  >
                    {curatorFeatured.featured ? '◆ Featured' : 'Make featured'}
                  </button>
                )}
                {curatorFrame && (
                  <button
                    type="button"
                    className="focused-photo__curate"
                    onClick={() => setPickerMode('frame')}
                    disabled={curatorFrame.pending}
                    data-testid="focused-photo-frame-pick"
                    title="Pick the frame and mat this photo hangs in on a framed wall and in the photo view"
                  >
                    Frame
                  </button>
                )}
                {curatorPrivate && (
                  <button
                    type="button"
                    className="focused-photo__curate"
                    onClick={curatorPrivate.onToggle}
                    disabled={curatorPrivate.pending}
                    aria-pressed={curatorPrivate.private}
                    data-testid="focused-photo-private"
                    data-private={curatorPrivate.private ? 'true' : 'false'}
                    title={
                      curatorPrivate.private
                        ? 'Guests can’t see this photo. Click to show it to them again (P)'
                        : 'Keep this photo from guests; it stays where it is (P)'
                    }
                  >
                    {curatorPrivate.private ? '🔒 Private' : 'Make private'}
                  </button>
                )}
                {onEdit && (
                  <button
                    type="button"
                    className="focused-photo__curate"
                    onClick={onEdit}
                    data-testid="focused-photo-edit"
                    title="Crop, straighten and adjust this photo; the original file is kept (E)"
                  >
                    Edit
                  </button>
                )}
                {curatorAction && (
                  <button
                    type="button"
                    className="focused-photo__curate"
                    onClick={curatorAction.onRun}
                    disabled={curatorAction.pending}
                    data-testid={`focused-photo-${curatorAction.kind === 'hide' ? 'hide' : 'restore'}`}
                    title={
                      curatorAction.kind === 'hide'
                        ? 'Hide: move this photo into the album’s _hidden folder; nothing is deleted (R)'
                        : 'Move this photo back into its album (R)'
                    }
                  >
                    {curatorAction.kind === 'hide' ? 'Hide' : 'Restore'}
                  </button>
                )}
              </div>
            )}
            <button
              autoFocus
              type="button"
              className="focused-photo__close"
              onClick={onClose}
              aria-label="Close focused photo"
              data-testid="focused-photo-close"
            >
              ×
            </button>
            {sourceAlbum && (
              <p className="focused-photo__album" data-testid="focused-photo-album">
                From {sourceAlbum}
              </p>
            )}
            {curatorFeatured && pickerMode === 'feature' && !curatorFeatured.replacing && (
              <FramePicker
                photo={photo}
                mode="feature"
                featured={curatorFeatured.featured}
                current={curatorFeatured.frame}
                pending={curatorFeatured.pending}
                onChoose={(chosen, mat) => {
                  setPickerMode(null);
                  curatorFeatured.onFeature(chosen, mat);
                }}
                onUnfeature={() => {
                  setPickerMode(null);
                  curatorFeatured.onUnfeature();
                }}
                onCancel={() => setPickerMode(null)}
                mediaSourceResolver={mediaSourceResolver}
              />
            )}
            {curatorFrame && pickerMode === 'frame' && (
              <FramePicker
                photo={photo}
                mode="frame"
                featured={false}
                current={curatorFrame.current}
                pending={curatorFrame.pending}
                onChoose={(chosen, mat) => {
                  setPickerMode(null);
                  curatorFrame.onSave(chosen, mat);
                }}
                onCancel={() => setPickerMode(null)}
                mediaSourceResolver={mediaSourceResolver}
              />
            )}
            {curatorFeatured?.replacing && (
              <ReplaceFeaturedDialog
                current={curatorFeatured.replacing}
                pending={curatorFeatured.pending}
                onConfirm={curatorFeatured.onConfirmReplace}
                onCancel={curatorFeatured.onCancelReplace}
                mediaSourceResolver={mediaSourceResolver}
              />
            )}
          </>
        ),
      }}
    />
  );
}

/**
 * Asks before replacing an album's featured photo, previewing the photo
 * that would stop being featured.
 */
function ReplaceFeaturedDialog(props: {
  current: PhotoQueryRecord;
  pending?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
  mediaSourceResolver?: WallMediaSourceResolver;
}): JSX.Element {
  const { current, pending, onConfirm, onCancel, mediaSourceResolver } = props;
  return (
    <div
      className="replace-featured"
      data-testid="replace-featured"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel?.();
      }}
    >
      <div
        className="replace-featured__card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="replace-featured-title"
      >
        <h2 id="replace-featured-title" className="replace-featured__title">
          Replace the featured photo?
        </h2>
        <p className="replace-featured__body">
          {photoAlbumName(current)} already features this photo. Only one photo per album can be
          featured.
        </p>
        <img
          className="replace-featured__preview"
          data-testid="replace-featured-preview"
          data-photo-id={current.id}
          src={resolveWallMediaSource(current, 'thumb', mediaSourceResolver)}
          alt={`Current featured photo: ${current.filename}`}
          draggable={false}
        />
        <div className="replace-featured__actions">
          <button
            type="button"
            className="focused-photo__curate"
            onClick={onCancel}
            data-testid="replace-featured-cancel"
          >
            Cancel
          </button>
          <button
            autoFocus
            type="button"
            className="focused-photo__curate replace-featured__confirm"
            onClick={onConfirm}
            disabled={pending}
            data-testid="replace-featured-confirm"
          >
            Replace
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Chooses the frame and mat a photo hangs in, previewing this photo in
 * each frame, or Random: a different frame each time the wall loads.
 * `feature` mode features the photo in that frame.
 */
function FramePicker(props: {
  photo: PhotoQueryRecord;
  mode: 'feature' | 'frame';
  featured: boolean;
  current: PhotoFrame;
  pending?: boolean;
  onChoose: (frame: FrameChoice, mat: FrameMat) => void;
  onUnfeature?: () => void;
  onCancel: () => void;
  mediaSourceResolver?: WallMediaSourceResolver;
}): JSX.Element {
  const { photo, mode, featured, current, pending, onChoose, onUnfeature, onCancel, mediaSourceResolver } =
    props;
  const [frame, setFrame] = useState<FrameChoice>(current.frame);
  const [mat, setMat] = useState<FrameMat>(current.mat);
  const thumb = resolveWallMediaSource(photo, 'thumb', mediaSourceResolver);
  const width = 132;
  const preview = (style: FrameChoice) => {
    const shown = style === 'random' ? 'gallery-black' : style;
    const share = galleryMouldingRatio(shown);
    const height = width / framedPhotoAspect(photo, share, mat);
    const geometry = galleryFrameGeometry({ x: 0, y: 0, width, height }, photo, share, mat);
    return (
      <span
        className="frame-picker__preview"
        style={{
          width,
          height,
          backgroundImage:
            style === 'random'
              ? undefined
              : `url("${galleryFrameDataUrl({ style: shown, mat }, width, height, geometry, 400)}")`,
        }}
      >
        <img
          src={thumb}
          alt=""
          draggable={false}
          style={{
            left: geometry.photo.x,
            top: geometry.photo.y,
            width: geometry.photo.width,
            height: geometry.photo.height,
          }}
        />
        {style === 'random' && <span className="frame-picker__dice">?</span>}
      </span>
    );
  };
  const unchanged = frame === current.frame && mat === current.mat;
  return (
    <div
      className="replace-featured"
      data-testid="frame-picker"
      data-mode={mode}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        className="replace-featured__card frame-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="frame-picker-title"
      >
        <h2 id="frame-picker-title" className="replace-featured__title">
          {mode === 'feature' ? (featured ? 'Featured photo' : 'Feature this photo') : 'Frame'}
        </h2>
        <p className="replace-featured__body">
          {mode === 'feature'
            ? 'It hangs large at the center of its album, in this frame.'
            : 'It hangs in this frame on a framed wall and in the photo view.'}{' '}
          Random picks a different frame each time the wall loads.
        </p>
        <div className="frame-picker__grid" role="radiogroup" aria-label="Frame">
          {FRAME_CHOICES.map((choice) => (
            <button
              key={choice}
              type="button"
              role="radio"
              aria-checked={frame === choice}
              className="frame-picker__option"
              data-testid={`frame-option-${choice}`}
              data-selected={frame === choice ? 'true' : 'false'}
              onClick={() => setFrame(choice)}
            >
              {preview(choice)}
              <span className="frame-picker__label">{FRAME_LABELS[choice]}</span>
            </button>
          ))}
        </div>
        <div className="frame-picker__mats" role="radiogroup" aria-label="Mat">
          {FRAME_MATS.map((choice) => (
            <button
              key={choice}
              type="button"
              role="radio"
              aria-checked={mat === choice}
              className="frame-picker__mat"
              data-testid={`mat-option-${choice}`}
              data-selected={mat === choice ? 'true' : 'false'}
              onClick={() => setMat(choice)}
            >
              {MAT_LABELS[choice]}
            </button>
          ))}
        </div>
        <div className="replace-featured__actions">
          {mode === 'feature' && featured && onUnfeature && (
            <button
              type="button"
              className="focused-photo__curate"
              onClick={onUnfeature}
              disabled={pending}
              data-testid="frame-unfeature"
            >
              Unfeature
            </button>
          )}
          <button
            type="button"
            className="focused-photo__curate"
            onClick={onCancel}
            data-testid="frame-cancel"
          >
            Cancel
          </button>
          <button
            autoFocus
            type="button"
            className="focused-photo__curate replace-featured__confirm"
            onClick={() => onChoose(frame, mat)}
            disabled={pending || ((mode === 'frame' || featured) && unchanged)}
            data-testid="frame-confirm"
          >
            {mode === 'feature' && !featured ? 'Make featured' : 'Save frame'}
          </button>
        </div>
      </div>
    </div>
  );
}
