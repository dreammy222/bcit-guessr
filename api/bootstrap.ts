import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getUserAccount } from './_lib/account.js';
import { getOptionalClerkUser } from './_lib/clerk.js';
import { getDailyChallengeStatus } from './_lib/daily.js';
import { LEADERBOARD_DISPLAY_LIMIT, getLeaderboardEntries, getUserBestScore } from './_lib/leaderboardStore.js';
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
    const user = await getOptionalClerkUser(req);
    const primaryRateLimit = user
      ? await checkRateLimit(req, RATE_LIMITS.bootstrapUser, {
          includeIp: false,
          keyParts: [user.userId],
        })
      : await checkRateLimit(req, RATE_LIMITS.bootstrapIp);

    if (!primaryRateLimit.allowed) {
      return sendRateLimitExceeded(res, primaryRateLimit);
    }

    const ipRateLimit = user ? await checkRateLimit(req, RATE_LIMITS.bootstrapIp) : primaryRateLimit;
    if (!ipRateLimit.allowed) {
      return sendRateLimitExceeded(res, ipRateLimit);
    }

    applyRateLimitHeaders(res, primaryRateLimit);
    res.setHeader('Cache-Control', 'no-store, max-age=0');

    const [dailyStatus, leaderboard, highscore, account] = await Promise.all([
      getDailyChallengeStatus(user?.userId ?? null),
      getLeaderboardEntries(LEADERBOARD_DISPLAY_LIMIT),
      user ? getUserBestScore(user.userId) : Promise.resolve(null),
      user ? getUserAccount(user.userId) : Promise.resolve(null),
    ]);

    return res.status(200).json({
      avatar: account?.avatar ?? null,
      coinBalance: account?.coinBalance ?? null,
      dailyStatus,
      highscore,
      leaderboard,
      ownedCosmeticIds: account?.ownedCosmeticIds ?? null,
    });
  } catch (error) {
    console.error('Bootstrap GET Error:', error);
    return res.status(500).json({ error: 'Failed to load bootstrap data' });
  }
}
