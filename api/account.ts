import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getUserAccount, type AccountPayload } from './_lib/account.js';
import { requireClerkUser } from './_lib/clerk.js';
import {
  RATE_LIMITS,
  applyRateLimitHeaders,
  checkRateLimit,
  sendRateLimitExceeded,
} from './_lib/security.js';

export const config = {
  runtime: 'nodejs',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const { userId } = await requireClerkUser(req);

    const rateLimit = await checkRateLimit(req, RATE_LIMITS.accountRead, {
      keyParts: [userId],
    });
    if (!rateLimit.allowed) {
      return sendRateLimitExceeded(res, rateLimit);
    }

    applyRateLimitHeaders(res, rateLimit);
    res.setHeader('Cache-Control', 'no-store, max-age=0');

    const payload: AccountPayload = await getUserAccount(userId);

    return res.status(200).json(payload);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return res.status(401).json({ error: 'Missing or invalid auth token' });
    }

    console.error('Account GET Error:', error);
    return res.status(500).json({ error: 'Failed to fetch account' });
  }
}
