import { SCHOOL } from '../../src/config/school.js';

/**
 * Server-side configuration: env vars first, school-config defaults second.
 * This module is the single place api/ code reads deployment-specific names,
 * so a new school only needs env vars (or backendDefaults in school.ts).
 * Server-only — never import from client code.
 */

function cleanEnv(value: string | undefined) {
  return value?.trim() ?? '';
}

export const DYNAMO_TABLE =
  cleanEnv(process.env.DYNAMO_TABLE_NAME) || SCHOOL.backendDefaults.dynamoTableName;

export const KV_PREFIX =
  cleanEnv(process.env.KV_KEY_PREFIX) || SCHOOL.backendDefaults.kvKeyPrefix;

/** Namespaced Vercel KV key: kvKey('leaderboard') → 'ubc_leaderboard' */
export function kvKey(suffix: string) {
  return `${KV_PREFIX}_${suffix}`;
}

export const PHOTO_BASE_URL = (
  cleanEnv(process.env.PHOTO_BASE_URL) ||
  cleanEnv(process.env.PHOTO_CDN_BASE_URL) ||
  SCHOOL.backendDefaults.photoBaseUrl
).replace(/\/+$/, '');

/**
 * Promo codes come from the PROMO_CODES env var so each school manages its own
 * without code changes. Format (comma-separated, entries joined by ':'):
 *   PROMO_CODES="WELCOME:coins=5000,CLUB2026:cosmetics=club_cap+club_shirt"
 */
export interface PromoReward {
  cosmeticIds?: string[];
  coins?: number;
}

export function parsePromoCodes(raw = process.env.PROMO_CODES): Record<string, PromoReward> {
  const rewards: Record<string, PromoReward> = {};
  for (const entry of cleanEnv(raw).split(',')) {
    const [code, spec] = entry.split(':').map((part) => part?.trim());
    if (!code || !spec) continue;
    const reward: PromoReward = {};
    for (const field of spec.split(';')) {
      const [key, value] = field.split('=').map((part) => part?.trim());
      if (key === 'coins' && value && Number.isFinite(Number(value))) {
        reward.coins = Number(value);
      } else if (key === 'cosmetics' && value) {
        reward.cosmeticIds = value.split('+').map((id) => id.trim()).filter(Boolean);
      }
    }
    if (reward.coins != null || reward.cosmeticIds?.length) {
      rewards[code.toUpperCase()] = reward;
    }
  }
  return rewards;
}

export const PROMO_REWARDS = parsePromoCodes();
