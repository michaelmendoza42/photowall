import { useRef, type PointerEvent, type WheelEvent } from 'react';
import type { EditCrop } from '../../../../shared/api/edits.js';
import {
  cropForFrame,
  panCrop,
  photoBounds,
  resizeFrame,
  zoomCrop,
  type CropHandle,
  type ScreenRect,
} from './cropMath.js';

const HANDLES: CropHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const CORNERS: CropHandle[] = ['nw', 'ne', 'se', 'sw'];

export interface CropOverlayProps {
  /** Where the crop sits on screen, relative to the stage. */
  frame: ScreenRect;
  crop: EditCrop;
  /** Locked frame shape (width / height in px), or null for free. */
  ratio: number | null;
  /** Receives an updater for the crop. */
  onCropChange: (update: (crop: EditCrop) => EditCrop) => void;
  /** The user moved the frame itself. */
  onFrameChange: (frame: ScreenRect) => void;
}

/**
 * Crop frame over the editor stage. The frame stays where it is put and
 * the photo moves under it: drag pans, the wheel and a pinch zoom about
 * the pointer. The handles resize the frame with the photo held still.
 */
export function CropOverlay(props: CropOverlayProps): JSX.Element {
  const { frame, crop, ratio, onCropChange, onFrameChange } = props;
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const resizing = useRef<{
    handle: CropHandle;
    x: number;
    y: number;
    frame: ScreenRect;
    crop: EditCrop;
  } | null>(null);
  // Pointer handlers read the latest frame, not the one they closed over.
  const frameRef = useRef(frame);
  frameRef.current = frame;

  const local = (event: { clientX: number; clientY: number; currentTarget: Element }) => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };

  const pan = (dx: number, dy: number) =>
    onCropChange((c) => panCrop(c, frameRef.current, dx, dy));
  const zoom = (factor: number, x: number, y: number) =>
    onCropChange((c) => zoomCrop(c, frameRef.current, factor, x, y));

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, local(event));
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const map = pointers.current;
    const previous = map.get(event.pointerId);
    if (!previous) return;
    const current = local(event);
    const others = [...map.entries()].filter(([id]) => id !== event.pointerId);
    if (others.length === 0) {
      pan(current.x - previous.x, current.y - previous.y);
    } else if (others.length === 1) {
      const other = others[0]![1];
      const before = Math.hypot(previous.x - other.x, previous.y - other.y);
      const after = Math.hypot(current.x - other.x, current.y - other.y);
      const midX = (current.x + other.x) / 2;
      const midY = (current.y + other.y) / 2;
      if (before > 0) zoom(after / before, midX, midY);
      pan((current.x - previous.x) / 2, (current.y - previous.y) / 2);
    }
    map.set(event.pointerId, current);
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
  };

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    const point = local(event);
    zoom(Math.exp(-event.deltaY * 0.0015), point.x, point.y);
  };

  const startResize = (handle: CropHandle) => (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizing.current = { handle, x: event.clientX, y: event.clientY, frame: frameRef.current, crop };
  };

  const moveResize = (event: PointerEvent<HTMLDivElement>) => {
    const start = resizing.current;
    if (!start) return;
    event.stopPropagation();
    const next = resizeFrame(
      start.handle,
      start.frame,
      event.clientX - start.x,
      event.clientY - start.y,
      ratio,
      photoBounds(start.crop, start.frame),
    );
    onFrameChange(next);
    onCropChange(() => cropForFrame(start.crop, start.frame, next));
  };

  const endResize = (event: PointerEvent<HTMLDivElement>) => {
    if (!resizing.current) return;
    event.stopPropagation();
    resizing.current = null;
  };

  const { left, top, width, height } = frame;
  const right = left + width;
  const bottom = top + height;
  // Dim everything outside the frame: a full-stage layer with a hole.
  const hole = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${left}px ${top}px, ${right}px ${top}px, ${right}px ${bottom}px, ${left}px ${bottom}px, ${left}px ${top}px)`;

  return (
    <div
      className="crop-overlay"
      data-testid="crop-overlay"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    >
      <div className="crop-overlay__dim" style={{ clipPath: hole }} />
      <div className="crop-overlay__frame" data-testid="crop-frame" style={{ left, top, width, height }}>
        <div className="crop-overlay__grid" />
        {(ratio === null ? HANDLES : CORNERS).map((handle) => (
          <div
            key={handle}
            className={`crop-overlay__handle crop-overlay__handle--${handle}`}
            data-testid={`crop-handle-${handle}`}
            onPointerDown={startResize(handle)}
            onPointerMove={moveResize}
            onPointerUp={endResize}
            onPointerCancel={endResize}
          />
        ))}
      </div>
    </div>
  );
}
