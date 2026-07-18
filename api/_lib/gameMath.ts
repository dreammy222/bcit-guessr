export const ROUND_TIMER_SECONDS = SCHOOL.scoring.roundTimerSeconds;
import { SCHOOL } from '../../src/config/school.js';
import { PHOTO_BASE_URL } from './serverConfig.js';

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
  const maxPoints = SCHOOL.scoring.maxPointsPerRound;
  const curve = SCHOOL.scoring.falloffC;
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
