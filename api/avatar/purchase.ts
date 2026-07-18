import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireClerkUser } from '../_lib/clerk.js';
import { purchaseUserCosmetic } from '../_lib/account.js';
import {
  RATE_LIMITS,
  applyRateLimitHeaders,
  checkRateLimit,
  sendRateLimitExceeded,
} from '../_lib/security.js';
import { getCosmeticById } from '../../src/data/cosmetics.js';

export const config = {
  runtime: 'nodejs',
};

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

    const cosmeticId = typeof req.body?.cosmeticId === 'string' ? req.body.cosmeticId.trim() : '';
    const cosmetic = getCosmeticById(cosmeticId);

    if (!cosmetic) {
      return res.status(400).json({ error: 'Unknown cosmetic id' });
    }

    const result = await purchaseUserCosmetic(userId, cosmetic);

    if (result.status === 'ALREADY_OWNED') {
      return res.status(409).json({
        error: 'Cosmetic already owned',
        account: result.account,
      });
    }

    if (result.status === 'INSUFFICIENT_COINS') {
      return res.status(400).json({
        error: 'Not enough coins',
        account: result.account,
      });
    }

    return res.status(200).json({
      success: true,
      purchasedCosmeticId: result.purchasedCosmeticId,
      account: result.account,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return res.status(401).json({ error: 'Missing or invalid auth token' });
    }

    console.error('Avatar Purchase POST Error:', error);
    return res.status(500).json({ error: 'Failed to purchase cosmetic' });
  }
}
