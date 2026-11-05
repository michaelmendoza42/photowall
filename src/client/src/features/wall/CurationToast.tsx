import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface CurationToastState {
  message: string;
  tone?: 'info' | 'error';
  actionLabel?: string;
  onAction?: () => void;
}

/** How long a toast stays up; long enough to reach for Undo. */
const TOAST_MS = 8000;

export function CurationToast(props: {
  toast: CurationToastState;
  onDismiss: () => void;
}): JSX.Element {
  const { toast, onDismiss } = props;

  useEffect(() => {
    const timer = window.setTimeout(onDismiss, TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss]);

  // The lightbox marks everything already on the page inert when it
  // opens. A toast raised just before it reopens (after an edit) must
  // stay usable, so it takes those marks back off itself.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const release = () => {
      if (node.hasAttribute('inert')) node.removeAttribute('inert');
      if (node.hasAttribute('aria-hidden')) node.removeAttribute('aria-hidden');
    };
    release();
    const observer = new MutationObserver(release);
    observer.observe(node, { attributes: true, attributeFilter: ['inert', 'aria-hidden'] });
    return () => observer.disconnect();
  }, []);

  // Portaled so it stacks above the focused-photo lightbox.
  return createPortal(
    <div
      ref={ref}
      className="curation-toast"
      data-testid="curation-toast"
      data-tone={toast.tone ?? 'info'}
      role={toast.tone === 'error' ? 'alert' : 'status'}
    >
      <span>{toast.message}</span>
      {toast.actionLabel && toast.onAction && (
        <button
          type="button"
          className="controls__link"
          data-testid="curation-toast-action"
          onClick={() => {
            toast.onAction?.();
            onDismiss();
          }}
        >
          {toast.actionLabel}
        </button>
      )}
    </div>,
    document.body,
  );
}
