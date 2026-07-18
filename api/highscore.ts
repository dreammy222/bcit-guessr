import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireClerkUser } from './_lib/clerk.js';
import { getUserBestScore } from './_lib/leaderboardStore.js';
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
    const userRateLimit = await checkRateLimit(req, RATE_LIMITS.highscoreUser, {
      includeIp: false,
      keyParts: [userId],
    });
    if (!userRateLimit.allowed) {
      return sendRateLimitExceeded(res, userRateLimit);
    }

    const ipRateLimit = await checkRateLimit(req, RATE_LIMITS.highscoreIp);
    if (!ipRateLimit.allowed) {
      return sendRateLimitExceeded(res, ipRateLimit);
    }

    applyRateLimitHeaders(res, userRateLimit);
    res.setHeader('Cache-Control', 'no-store, max-age=0');

    const personalBest = await getUserBestScore(userId);

    return res.status(200).json({ highscore: personalBest });

  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return res.status(401).json({ error: 'Missing or invalid auth token' });
    }

    console.error('Highscore GET Error:', error);
    return res.status(500).json({ error: 'Failed to fetch highscore' });
  }
}
