export interface WallZoomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
}

/** Touch fallback for wall zoom; trackpad and ctrl-wheel remain supported. */
export function WallZoomControls(props: WallZoomControlsProps): JSX.Element {
  const { onZoomIn, onZoomOut } = props;
  return (
    <div className="wall-zoom-controls" aria-label="Wall zoom">
      <button type="button" aria-label="Zoom out" onClick={onZoomOut}>−</button>
      <button type="button" aria-label="Zoom in" onClick={onZoomIn}>+</button>
    </div>
  );
}
