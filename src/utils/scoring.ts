/**
 * Scoring utilities for UBC Guessr.
 *
 * Distance scoring:
 *   - Max: 2000 points for an exact location
 *   - Uses a Gaussian falloff tuned to heavily reward close guesses
 *
 * Time bonus:
 *   - Timer: 30 seconds per round
 *   - No penalty for the first 10 seconds
 *   - Drops linearly from 1.0x at 20s remaining to 0.5x at 0s
 */

/** Maximum points per round */
export const MAX_POINTS_PER_ROUND = 2000;

/** Timer duration in seconds */
export const ROUND_TIMER_SECONDS = 30;

/** Number of rounds per game */
export const ROUNDS_PER_GAME = 5;

/**
 * Calculates the great-circle distance between two coordinates using the Haversine formula.
 * @returns Distance in kilometers
 */
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

/**
 * Calculates the final score for a round.
 *
 * Distance scaling:
 *   - Uses a Gaussian curve
 *   - Tuned so 150m (0.15km) retains roughly 95% of the score
 *
 * Time penalty:
 *   - No penalty above 20 seconds remaining
 *   - Drops linearly from 1.0x to 0.5x below that
 *
 * @param distanceKm Distance between guess and actual location
 * @param timeRemaining Seconds remaining on the timer
 * @returns Integer score from 0 to 2000
 */
export function calculateScore(distanceKm: number, timeRemaining: number): number {
  // Gaussian distance score => 2000 * e^(-(d^2) / (2 * c^2))
  // Choose c so a 150m guess stays close to full credit.
  const c = 0.46;
  const distanceScore = MAX_POINTS_PER_ROUND * Math.exp(-(distanceKm * distanceKm) / (2 * c * c));

  let timeMultiplier = 1.0;
  if (timeRemaining < 20) {
    timeMultiplier = 0.5 + (0.5 * (Math.max(0, timeRemaining) / 20));
  }

  return Math.round(distanceScore * timeMultiplier);
}

/**
 * Returns a grade title based on total score out of 10,000.
 */
export function getScoreTitle(totalScore: number): string {
  const pct = totalScore / (MAX_POINTS_PER_ROUND * ROUNDS_PER_GAME);
  if (pct >= 0.95) return 'UBC Legend';
  if (pct >= 0.85) return 'Campus Master';
  if (pct >= 0.70) return 'UBC Navigator';
  if (pct >= 0.55) return 'Thunderbird Scout';
  if (pct >= 0.40) return 'Campus Wanderer';
  if (pct >= 0.20) return 'First-Year Frosh';
  return 'Lost on Campus';
}

/** Format a distance for display */
export function formatDistance(km: number | null | undefined): string {
  if (km == null) return 'N/A';
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(2)}km`;
}
