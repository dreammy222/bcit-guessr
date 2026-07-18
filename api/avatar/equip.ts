import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireClerkUser } from '../_lib/clerk.js';
import { equipUserCosmetic } from '../_lib/account.js';
import {
  RATE_LIMITS,
  applyRateLimitHeaders,
  checkRateLimit,
  sendRateLimitExceeded,
} from '../_lib/security.js';
import { getCosmeticById, isCosmeticSlot } from '../../src/data/cosmetics.js';

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

    const rawSlot = req.body?.slot;
    const rawCosmeticId = req.body?.cosmeticId;

    if (!isCosmeticSlot(rawSlot)) {
      return res.status(400).json({ error: 'Invalid cosmetic slot' });
    }

    const cosmeticId =
      rawCosmeticId === null || rawCosmeticId === undefined
        ? null
        : typeof rawCosmeticId === 'string' && rawCosmeticId.trim()
          ? rawCosmeticId.trim()
          : null;

    if (cosmeticId) {
      const cosmetic = getCosmeticById(cosmeticId);
      if (!cosmetic || cosmetic.slot !== rawSlot) {
        return res.status(400).json({ error: 'Cosmetic does not match the selected slot' });
      }
    }

    const account = await equipUserCosmetic(userId, rawSlot, cosmeticId);

    if (!account) {
      return res.status(400).json({ error: 'Cosmetic is not owned' });
    }

    return res.status(200).json({
      success: true,
      account,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return res.status(401).json({ error: 'Missing or invalid auth token' });
    }

    console.error('Avatar Equip POST Error:', error);
    return res.status(500).json({ error: 'Failed to equip cosmetic' });
  }
}
