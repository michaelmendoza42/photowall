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
      const stepTo = step === 'next' ? onNext : step === 'previous' ? onPrevious : undefined;
      if (!step || !stepTo) {
        setAnimating(true);
        setOffset(0);
        return;
      }
      swiped.current = true;
      if (prefersReducedMotion()) {
        setOffset(0);
        stepTo();
        return;
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
    },
    onPointerCancel() {
      start.current = null;
      setAnimating(true);
      setOffset(0);
    },
  };

  /** True once for the click a swipe gesture may still deliver. */
  const consumeClick = (): boolean => {
    const was = swiped.current;
    swiped.current = false;
    return was;
  };

  return { offset, animating, handlers, consumeClick };
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
            onClick={(event) => {
              if (swipe.consumeClick()) return;
              if (event.target === event.currentTarget) onClose();
            }}
            {...swipe.handlers}
          >
            <div
              className="focused-photo__frame"
              data-testid="focused-photo-frame"
              style={{
                width: renderSize.width,
                height: renderSize.height,
                transform: swipe.offset ? `translateX(${swipe.offset}px)` : undefined,
                transition: swipe.animating
                  ? `transform ${SWIPE_ANIMATION_MS}ms ease-out`
                  : undefined,
              }}
            >
              <img
                className="focused-photo__img"
                data-testid="focused-photo-image"
                data-media-variant="modal"
                src={slide.src}
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
