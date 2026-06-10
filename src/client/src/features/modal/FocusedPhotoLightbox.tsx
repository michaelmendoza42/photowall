import { useLayoutEffect, useMemo, useState, type HTMLAttributes } from 'react';
import Lightbox, { type SlideImage } from 'yet-another-react-lightbox';
import { mediaResourcePath } from '../../../../shared/api/media.js';
import type { PhotoQueryRecord } from '../../../../shared/api/photos.js';
import { computeFocusedPhotoRenderSize } from '../wall/hoverPreview.js';

export interface FocusedPhotoLightboxProps {
  photo: PhotoQueryRecord;
  onClose: () => void;
}

export function buildFocusedPhotoLightboxSlide(
  photo: Pick<PhotoQueryRecord, 'id' | 'width' | 'height'>,
): SlideImage {
  return {
    src: mediaResourcePath(photo.id, 'modal'),
    alt: '',
    ...(photo.width > 0 ? { width: photo.width } : {}),
    ...(photo.height > 0 ? { height: photo.height } : {}),
  };
}

export function FocusedPhotoLightbox(
  props: FocusedPhotoLightboxProps,
): JSX.Element {
  const { photo, onClose } = props;

  const slide = useMemo(() => buildFocusedPhotoLightboxSlide(photo), [photo]);
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
      }}
      portal={{ container: portalContainer }}
      toolbar={{ buttons: [] }}
      render={{
        slide: () => (
          <div className="focused-photo__slide">
            <div
              className="focused-photo__frame"
              style={{ width: renderSize.width, height: renderSize.height }}
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
