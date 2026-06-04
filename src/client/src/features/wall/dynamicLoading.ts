// Dynamic loading trigger.
//
// Pure decision function for "should the wall fetch the next photo
// page right now?" The camera now stores continuous travel offsets, so
// the loader keys off absolute downward travel rather than the wrapped
// render position currently on screen.

export interface FrontierLoadInput {
  /** Continuous vertical camera travel, in CSS px. */
  travelY: number;
  viewportHeight: number;
  /** Total laid-out world height for the currently loaded prefix. */
  contentHeight: number;
  /**
   * Pixels of headroom below the viewport bottom that should still be
   * loaded. Set this large enough that a fast pan does not outrun the
   * load.
   */
  thresholdPx: number;
  /** True while a previous fetchNextPage is still in flight. */
  isFetchingNext: boolean;
  /** False once the server reports no more pages exist. */
  hasNextPage: boolean;
}

export function shouldLoadNextPage(input: FrontierLoadInput): boolean {
  const {
    isFetchingNext,
    hasNextPage,
    contentHeight,
    travelY,
    viewportHeight,
    thresholdPx,
  } = input;
  if (isFetchingNext || !hasNextPage) return false;
  if (viewportHeight <= 0) return false;
  const remainingBelowViewport = contentHeight - (travelY + viewportHeight);
  return remainingBelowViewport <= thresholdPx;
}
