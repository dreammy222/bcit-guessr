export const ROUND_TIMER_SECONDS = 30;
const DEFAULT_PHOTO_BASE_URL = 'https://ubcguessr.s3.us-west-1.amazonaws.com';

function normalizePhotoBaseUrl(value: string | undefined) {
  const trimmedValue = value?.trim();
  return (trimmedValue || DEFAULT_PHOTO_BASE_URL).replace(/\/+$/, '');
}

const PHOTO_BASE_URL = normalizePhotoBaseUrl(process.env.PHOTO_BASE_URL ?? process.env.PHOTO_CDN_BASE_URL);

export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const earthRadiusKm = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

export function calculateScore(distanceKm: number, timeRemaining: number): number {
  const maxPoints = 2000;
  const curve = 0.46;
  const distanceScore = maxPoints * Math.exp(-(distanceKm * distanceKm) / (2 * curve * curve));

  let timeMultiplier = 1.0;
  if (timeRemaining < 20) {
    timeMultiplier = 0.5 + (0.5 * (Math.max(0, timeRemaining) / 20));
  }

  return Math.round(distanceScore * timeMultiplier);
}

export function getPhotoUrl(photoId: string) {
  return `${PHOTO_BASE_URL}/${encodeURIComponent(`${photoId}.JPG`)}`;
}
