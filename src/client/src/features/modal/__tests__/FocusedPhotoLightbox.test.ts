import { describe, expect, it } from 'vitest';
import { buildFocusedPhotoLightboxSlide } from '../FocusedPhotoLightbox.js';

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
