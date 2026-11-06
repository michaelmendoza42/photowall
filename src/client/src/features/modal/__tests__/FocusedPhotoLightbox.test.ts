import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildFocusedPhotoLightboxSlide,
  createWheelSwipeStepper,
  swipeStepDirection,
} from '../FocusedPhotoLightbox.js';
import { recordedTrackpadSwipes } from './fixtures/trackpadSwipes20261106.js';

describe('buildFocusedPhotoLightboxSlide', () => {
  it('targets the modal derivative for the focused viewer', () => {
    expect(
      buildFocusedPhotoLightboxSlide({
        id: 'albums/2024/example.jpg',
        width: 1600,
        height: 1200,
      }),
    ).toEqual({
      src: '/api/media/albums%2F2024%2Fexample.jpg?variant=modal&format=webp',
      alt: '',
      width: 1600,
      height: 1200,
    });
  });

  it('uses a custom media source resolver when provided', () => {
    expect(
      buildFocusedPhotoLightboxSlide(
        {
          id: 'custom:focused-1',
          width: 1200,
          height: 800,
        },
        ({ photo, variant }) => `mock://${photo.id}/${variant}/${photo.width}x${photo.height}`,
      ),
    ).toEqual({
      src: 'mock://custom:focused-1/modal/1200x800',
      alt: '',
      width: 1200,
      height: 800,
    });
  });

  it('omits invalid dimensions instead of passing zeroes through to the lightbox', () => {
    expect(
      buildFocusedPhotoLightboxSlide({
        id: 'broken-size.jpg',
        width: 0,
        height: -1,
      }),
    ).toEqual({
      src: '/api/media/broken-size.jpg?variant=modal&format=webp',
      alt: '',
    });
  });
});

describe('swipeStepDirection', () => {
  it('swiping left goes to the next photo, swiping right to the previous', () => {
    expect(swipeStepDirection(-120, 10)).toBe('next');
    expect(swipeStepDirection(120, -10)).toBe('previous');
  });

  it('ignores short or mostly-vertical moves', () => {
    expect(swipeStepDirection(-20, 0)).toBeNull();
    expect(swipeStepDirection(-80, 90)).toBeNull();
  });
});

describe('createWheelSwipeStepper', () => {
  const FRAME_MS = 16;
  /** Fingers pushing, then a momentum tail fading for about 1.5 s. */
  const push = [20, 40, 60, 60];
  const tail = (frames: number) =>
    Array.from({ length: frames }, (_, i) => Math.max(1, Math.round(60 * 0.95 ** i)));

  let now = 0;
  beforeEach(() => {
    vi.useFakeTimers();
    now = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Feeds sideways deltas one frame apart; `gaps` adds extra ms before an index. */
  function swipe(
    feed: ReturnType<typeof createWheelSwipeStepper>,
    deltas: number[],
    gaps: Record<number, number> = {},
  ): void {
    deltas.forEach((deltaX, i) => {
      const wait = FRAME_MS + (gaps[i] ?? 0);
      vi.advanceTimersByTime(wait);
      now += wait;
      feed({ deltaX, deltaY: 0, deltaMode: 0, timeStamp: now });
    });
  }

  function recorder() {
    const steps: string[] = [];
    const feed = createWheelSwipeStepper((step) => {
      if (step) steps.push(step);
      return step !== null;
    });
    return { steps, feed };
  }

  it('steps once for a swipe and its whole momentum tail', () => {
    const { steps, feed } = recorder();
    swipe(feed, [...push, ...tail(90)]);
    vi.advanceTimersByTime(1000);
    expect(steps).toEqual(['next']);
  });

  it('steps once even when the tail is jittery, drops frames or merges events', () => {
    for (let seed = 1; seed <= 500; seed += 1) {
      let state = seed * 7919;
      const random = () => (state = (state * 16807) % 2147483647) / 2147483647;
      const smooth = [...push, ...tail(90)];
      const deltas: number[] = [];
      const gaps: Record<number, number> = {};
      for (let i = 0; i < smooth.length; i += 1) {
        if (random() < 0.15 && i + 1 < smooth.length) {
          // Two frames delivered as one event, a frame late.
          gaps[deltas.length] = FRAME_MS;
          deltas.push(Math.round((smooth[i]! + smooth[i + 1]!) * (0.8 + random() * 0.4)));
          i += 1;
        } else {
          // Far rougher than recorded tails, which vary a percent or two.
          deltas.push(Math.max(1, Math.round(smooth[i]! * (0.8 + random() * 0.4))));
        }
      }
      const { steps, feed } = recorder();
      swipe(feed, deltas, gaps);
      vi.advanceTimersByTime(1000);
      expect(steps, `seed ${seed}`).toEqual(['next']);
    }
  });

  it('steps again for a new swipe started while the last tail still runs', () => {
    const { steps, feed } = recorder();
    swipe(feed, [...push, ...tail(20)]);
    // Fingers back on the trackpad stop the tail; the new swipe follows.
    swipe(feed, [...push, ...tail(90)], { 0: 80 });
    vi.advanceTimersByTime(1000);
    expect(steps).toEqual(['next', 'next']);
  });

  it('steps back for a swipe the other way during the tail', () => {
    const { steps, feed } = recorder();
    swipe(feed, [...push, ...tail(20)]);
    swipe(
      feed,
      [...push, ...tail(90)].map((delta) => -delta),
      { 0: 80 },
    );
    vi.advanceTimersByTime(1000);
    expect(steps).toEqual(['next', 'previous']);
  });

  it('steps once for each of 11 quick swipes recorded on a real trackpad', () => {
    // Swipe starts in the recording: each new swipe begins with a small
    // event after a short pause (7358 is a light touch, then the push).
    const swipeStarts = [2375, 3059, 3661, 4375, 4959, 5542, 6192, 6825, 7358, 8009, 8659];
    const stepTimes: number[] = [];
    let at = 0;
    const feed = createWheelSwipeStepper((step) => {
      expect(step).toBe('next');
      stepTimes.push(at);
      return true;
    });
    let last = recordedTrackpadSwipes[0]![0];
    for (const [timeStamp, deltaX, deltaY] of recordedTrackpadSwipes) {
      vi.advanceTimersByTime(timeStamp - last);
      last = timeStamp;
      at = timeStamp;
      feed({ deltaX, deltaY, deltaMode: 0, timeStamp });
    }
    vi.advanceTimersByTime(1000);
    expect(stepTimes).toHaveLength(swipeStarts.length);
    stepTimes.forEach((stepAt, i) => {
      expect(stepAt - swipeStarts[i]!, `swipe ${i + 1}`).toBeGreaterThanOrEqual(0);
      expect(stepAt - swipeStarts[i]!, `swipe ${i + 1}`).toBeLessThan(120);
    });
  });

  it('never steps on vertical scrolling', () => {
    const { steps, feed } = recorder();
    for (let i = 0; i < 40; i += 1) {
      vi.advanceTimersByTime(FRAME_MS);
      now += FRAME_MS;
      feed({ deltaX: 3, deltaY: 30, deltaMode: 0, timeStamp: now });
    }
    vi.advanceTimersByTime(1000);
    expect(steps).toEqual([]);
  });
});
