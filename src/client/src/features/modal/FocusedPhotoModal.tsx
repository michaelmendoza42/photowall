import { useEffect, useRef } from 'react';
import { mediaResourcePath } from '../../../../shared/api/media.js';
import type { PhotoQueryRecord } from '../../../../shared/api/photos.js';

export interface FocusedPhotoModalProps {
  photo: PhotoQueryRecord;
  onClose: () => void;
}

/**
 * Quiet, full-viewport focused-photo view. The wall stays mounted
 * underneath so closing returns the user to the same camera / page /
 * filter context. The modal owns its own Escape listener and a visible
 * `X` affordance. Backdrop click closes only when the click landed on
 * the backdrop itself (target === currentTarget), which keeps a
 * mis-aimed click on the photo or close button from firing close.
 */
export function FocusedPhotoModal(props: FocusedPhotoModalProps): JSX.Element {
  const { photo, onClose } = props;
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  // Keep a stable handler reference inside the global keydown listener
  // so reopening the modal on a new photo does not detach/reattach.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Move keyboard focus to the close button so Enter/Space close
  // immediately and screen readers announce the dialog.
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, [photo.id]);

  const handleBackdropClick = (
    event: React.MouseEvent<HTMLDivElement>,
  ): void => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="focused-photo"
      role="dialog"
      aria-modal="true"
      aria-label="Focused photo"
      data-testid="focused-photo-modal"
      data-photo-id={photo.id}
      onClick={handleBackdropClick}
    >
      <button
        ref={closeButtonRef}
        type="button"
        className="focused-photo__close"
        onClick={onClose}
        aria-label="Close focused photo"
        data-testid="focused-photo-close"
      >
        ×
      </button>
      <img
        className="focused-photo__img"
        src={mediaResourcePath(photo.id, 'modal')}
        alt=""
        draggable={false}
      />
    </div>
  );
}
