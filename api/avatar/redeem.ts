import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireClerkUser } from '../_lib/clerk.js';
import { awardPromoCoinsOnce, getUserAccount, grantUserCosmetics } from '../_lib/account.js';
import {
  RATE_LIMITS,
  applyRateLimitHeaders,
  checkRateLimit,
  sendRateLimitExceeded,
} from '../_lib/security.js';
import { PROMO_REWARDS } from '../_lib/serverConfig.js';

export const config = {
  runtime: 'nodejs',
};


function normalizePromoCode(value: unknown) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const { userId } = await requireClerkUser(req);
    const userRateLimit = await checkRateLimit(req, RATE_LIMITS.avatarWriteUser, {
      includeIp: false,
      keyParts: [userId],
    });
    if (!userRateLimit.allowed) {
      return sendRateLimitExceeded(res, userRateLimit);
    }

    const ipRateLimit = await checkRateLimit(req, RATE_LIMITS.avatarWriteIp);
    if (!ipRateLimit.allowed) {
      return sendRateLimitExceeded(res, ipRateLimit);
    }

    applyRateLimitHeaders(res, userRateLimit);
    res.setHeader('Cache-Control', 'no-store, max-age=0');

    const promoCode = normalizePromoCode(req.body?.promoCode);
    const promoReward = PROMO_REWARDS[promoCode];

    if (!promoReward) {
      return res.status(400).json({ error: 'Invalid promo code' });
    }

    const grantedCosmeticIds = promoReward.cosmeticIds?.length
      ? (await grantUserCosmetics(userId, promoReward.cosmeticIds)).grantedCosmeticIds
      : [];
    const coinAward = promoReward.coins
      ? await awardPromoCoinsOnce(promoCode, userId, promoReward.coins)
      : null;
    const account = await getUserAccount(userId);

    return res.status(200).json({
      success: true,
      promoCode,
      grantedCosmeticIds,
      coinRewardAmount: promoReward.coins ?? 0,
      awardedCoins: coinAward?.awarded ? promoReward.coins ?? 0 : 0,
      account,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return res.status(401).json({ error: 'Missing or invalid auth token' });
    }

    console.error('Avatar Promo Redeem POST Error:', error);
    return res.status(500).json({ error: 'Failed to redeem promo code' });
  }
}
