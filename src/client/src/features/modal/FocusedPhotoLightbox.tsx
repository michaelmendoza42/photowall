import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type PointerEvent,
} from 'react';
import Lightbox, { type SlideImage } from 'yet-another-react-lightbox';
import type { PhotoQueryRecord } from '../../../../shared/api/photos.js';
import { computeFocusedPhotoRenderSize } from '../wall/hoverPreview.js';
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

/** Quiet time that ends a trackpad swipe, including its momentum tail. */
const WHEEL_SWIPE_IDLE_MS = 250;

/**
 * A two-finger sideways trackpad swipe steps like a touch swipe: fingers
 * moving left (positive deltaX) bring in the next photo. One swipe steps
 * once; the rest of it, and its momentum tail, is ignored until the
 * wheel goes quiet. Off while the photo is zoomed in (scrolling pans).
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
  const gesture = useRef({ dx: 0, dy: 0, stepped: false, idleTimer: 0 });

  useEffect(() => () => window.clearTimeout(gesture.current.idleTimer), []);

  useEffect(() => {
    if (!element) return undefined;
    function onWheel(event: WheelEvent): void {
      if (event.ctrlKey || event.metaKey || latest.current.isZoomed()) return;
      // Keeps the browser's swipe-to-go-back from taking a sideways swipe.
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) event.preventDefault();
      const state = gesture.current;
      window.clearTimeout(state.idleTimer);
      state.idleTimer = window.setTimeout(() => {
        state.dx = 0;
        state.dy = 0;
        state.stepped = false;
      }, WHEEL_SWIPE_IDLE_MS);
      if (state.stepped) return;
      state.dx += event.deltaX;
      state.dy += event.deltaY;
      state.stepped = latest.current.slideTo(swipeStepDirection(-state.dx, -state.dy));
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
  const { photo, onClose, onNext, onPrevious, mediaSourceResolver } = props;

  // The lightbox only ever holds the focused photo as its one slide, so
  // its own arrow-key navigation has nothing to move to (and it stops
  // those keys from propagating). Catch arrows in the capture phase and
  // route them to the wall's next/previous instead.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'ArrowRight' && onNext) {
        event.preventDefault();
        onNext();
      } else if (event.key === 'ArrowLeft' && onPrevious) {
        event.preventDefault();
        onPrevious();
      }
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onNext, onPrevious]);

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

  const renderSize = useMemo(
    () =>
      computeFocusedPhotoRenderSize({
        viewport: viewportSize,
        photo: { width: photo.width, height: photo.height },
      }),
    [photo.height, photo.width, viewportSize],
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
              style={{
                width: renderSize.width,
                height: renderSize.height,
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
        ),
      }}
    />
  );
}
