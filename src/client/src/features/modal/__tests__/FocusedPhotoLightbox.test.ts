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
