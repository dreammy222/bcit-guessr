/**
 * Photo Service — Abstraction layer for loading panorama photo URLs.
 *
 * LOCAL (current):
 *   Photos are served from the `public/photos/` directory via Vite's static asset serving.
 *   Each photo is referenced as `/photos/GS__0210.JPG`.
 *
 * CLOUD MIGRATION (future):
 *   1. Add a `url` field to `PhotoLocation` in locations.ts
 *   2. Update `getPhotoUrl()` below to return `location.url`
 *   3. Optionally add auth headers or signed URL generation here for S3/CloudFront
 */

import type { PhotoLocation } from './locations';

const DEFAULT_PHOTO_BASE_URL = 'https://ubcguessr.s3.us-west-1.amazonaws.com';

function normalizePhotoBaseUrl(value: string | undefined) {
  const trimmedValue = value?.trim();
  return (trimmedValue || DEFAULT_PHOTO_BASE_URL).replace(/\/+$/, '');
}

const PHOTO_BASE_URL = normalizePhotoBaseUrl(import.meta.env.VITE_PHOTO_BASE_URL);

/**
 * Returns the displayable URL for a photo location.
 * Currently serves from local public directory.
 * Future: return a cloud CDN/S3 URL.
 */
export function getPhotoUrl(location: PhotoLocation): string {
  return `${PHOTO_BASE_URL}/${encodeURIComponent(location.filename)}`;
}

/**
 * Selects `count` random photos from the provided list (no repeats).
 * Used to pick 10 random locations per game.
 */
export function selectRandomPhotos<T extends PhotoLocation>(
  locations: T[],
  count: number
): T[] {
  const shuffled = [...locations].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}
