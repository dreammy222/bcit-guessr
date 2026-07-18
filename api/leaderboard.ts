import { Filter } from 'bad-words';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireClerkUser } from './_lib/clerk.js';
import {
  LEADERBOARD_DISPLAY_LIMIT,
  getLeaderboardEntries,
  getUserBestScore,
  submitLeaderboardScore,
} from './_lib/leaderboardStore.js';
import { getSinglePlayerSession, saveSinglePlayerSession } from './_lib/singlePlayer.js';
import {
  RATE_LIMITS,
  applyRateLimitHeaders,
  checkRateLimit,
  sendRateLimitExceeded,
} from './_lib/security.js';
import {
  isValidSinglePlayerClientToken,
  isValidSinglePlayerGameSessionId,
  normalizeLeaderboardUsername,
} from './_lib/validation.js';

export const config = {
  runtime: 'nodejs',
};

function getSinglePlayerClientToken(req: VercelRequest) {
  const rawValue = req.headers['x-single-player-client'];
  const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
  return isValidSinglePlayerClientToken(value) ? value : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  if (req.method === 'GET') {
    try {
      const rateLimit = await checkRateLimit(req, RATE_LIMITS.leaderboardRead);
      if (!rateLimit.allowed) {
        return sendRateLimitExceeded(res, rateLimit);
      }

      applyRateLimitHeaders(res, rateLimit);

      const entries = await getLeaderboardEntries(LEADERBOARD_DISPLAY_LIMIT);
      res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=60');
      return res.status(200).json(entries);
    } catch (error) {
      console.error('Leaderboard GET Error:', error);
      return res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { userId } = await requireClerkUser(req);
      const userRateLimit = await checkRateLimit(req, RATE_LIMITS.leaderboardWriteUser, {
        includeIp: false,
        keyParts: [userId],
      });
      if (!userRateLimit.allowed) {
        return sendRateLimitExceeded(res, userRateLimit);
      }

      const ipRateLimit = await checkRateLimit(req, RATE_LIMITS.leaderboardWriteIp);
      if (!ipRateLimit.allowed) {
        return sendRateLimitExceeded(res, ipRateLimit);
      }

      applyRateLimitHeaders(res, userRateLimit);

      const body = req.body;
      const gameSessionId = body?.gameSessionId;
      let username = normalizeLeaderboardUsername(body?.username);

      if (!isValidSinglePlayerGameSessionId(gameSessionId) || !username) {
        return res.status(400).json({ error: 'Invalid payload' });
      }

      const gameSession = await getSinglePlayerSession(gameSessionId);
      if (!gameSession) {
        return res.status(404).json({ error: 'Game session not found.' });
      }

      let ownedGameSession = gameSession;
      const clientToken = getSinglePlayerClientToken(req);
      if (!gameSession.ownerUserId) {
        if (!clientToken || gameSession.clientToken !== clientToken) {
          return res.status(403).json({ error: 'This guest game session could not be verified.' });
        }

        ownedGameSession = {
          ...gameSession,
          ownerUserId: userId,
        };
      }

      if (ownedGameSession.ownerUserId !== userId) {
        return res.status(403).json({ error: 'This game session belongs to another user.' });
      }

      if (ownedGameSession.status !== 'finished') {
        return res.status(409).json({ error: 'Finish the game before submitting to the leaderboard.' });
      }

      try {
        const filter = new Filter();
        if (filter.isProfane(username)) {
          username = filter.clean(username);
        }
      } catch (err) {
        console.error('Profanity filter error:', err);
      }

      const score = ownedGameSession.totalScore;
      if (ownedGameSession.leaderboardSubmittedAt !== null) {
        const personalBest = await getUserBestScore(userId);
        return res.status(200).json({
          success: true,
          alreadySubmitted: true,
          isNewBest: false,
          personalBest,
          score,
        });
      }

      const { isNewBest, personalBest } = await submitLeaderboardScore(userId, score, username);
      await saveSinglePlayerSession({
        ...ownedGameSession,
        leaderboardSubmittedAt: Date.now(),
      });

      return res.status(200).json({ success: true, isNewBest, personalBest, score });
    } catch (error) {
      if (error instanceof Error && error.message === 'UNAUTHORIZED') {
        return res.status(401).json({ error: 'Missing or invalid token' });
      }

      console.error('Leaderboard POST Error:', error);
      return res.status(500).json({ error: 'Failed to submit score' });
    }
  }

  return res.status(405).send('Method Not Allowed');
}
