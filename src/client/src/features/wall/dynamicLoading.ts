// Dynamic loading trigger.
//
// Pure decision function for "should the wall fetch the next photo
// page right now?" Splitting this out of the React component keeps
// the predicate testable without a DOM and keeps the wall reactive
// component small.
//
// The trigger fires when the loaded vertical frontier is within
// `thresholdPx` of the bottom of the viewport. It also fires when the
// loaded content does not yet exceed the viewport at all — the
// initial mount case — because there is no point waiting for a pan
// before priming the second page.

export interface FrontierLoadInput {
  /** Current camera/scroll Y offset, in CSS px. */
  scrollTop: number;
  viewportHeight: number;
  /** Total laid-out world height. */
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
    scrollTop,
    viewportHeight,
    thresholdPx,
  } = input;
  if (isFetchingNext || !hasNextPage) return false;
  if (viewportHeight <= 0) return false;
  const remainingBelowViewport =
    contentHeight - (scrollTop + viewportHeight);
  return remainingBelowViewport <= thresholdPx;
}
