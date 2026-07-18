import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getOptionalClerkUser, requireClerkUser } from './_lib/clerk.js';
import { beginDailyChallenge, getDailyChallengeStatus, startDailyChallenge, submitDailyChallenge } from './_lib/daily.js';
import {
  RATE_LIMITS,
  applyRateLimitHeaders,
  checkRateLimit,
  sendRateLimitExceeded,
} from './_lib/security.js';
import { parseGuessCoords } from './_lib/validation.js';

export const config = {
  runtime: 'nodejs',
};

function getQueryValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function getAction(req: VercelRequest) {
  return getQueryValue(req.query.action)?.trim().toLowerCase() ?? null;
}

async function handleStatus(req: VercelRequest, res: VercelResponse) {
  const user = await getOptionalClerkUser(req);
  const rateLimit = await checkRateLimit(req, RATE_LIMITS.dailyStatus, {
    keyParts: user?.userId ? [user.userId] : undefined,
  });
  if (!rateLimit.allowed) {
    return sendRateLimitExceeded(res, rateLimit);
  }

  applyRateLimitHeaders(res, rateLimit);

  try {
    const status = await getDailyChallengeStatus(user?.userId ?? null);
    return res.status(200).json(status);
  } catch (error) {
    console.error('Daily status GET error:', error);
    return res.status(500).json({ error: 'Failed to load daily challenge status.' });
  }
}

async function handleStart(req: VercelRequest, res: VercelResponse) {
  try {
    const { userId } = await requireClerkUser(req);
    const rateLimit = await checkRateLimit(req, RATE_LIMITS.dailyStart, {
      keyParts: [userId],
    });
    if (!rateLimit.allowed) {
      return sendRateLimitExceeded(res, rateLimit);
    }

    applyRateLimitHeaders(res, rateLimit);

    const payload = await startDailyChallenge(userId);
    return res.status(200).json(payload);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return res.status(401).json({ error: 'Missing or invalid token' });
    }

    console.error('Daily start POST error:', error);
    return res.status(500).json({ error: 'Failed to start daily challenge.' });
  }
}

async function handleBegin(req: VercelRequest, res: VercelResponse) {
  try {
    const { userId } = await requireClerkUser(req);
    const rateLimit = await checkRateLimit(req, RATE_LIMITS.dailyStart, {
      keyParts: [userId],
    });
    if (!rateLimit.allowed) {
      return sendRateLimitExceeded(res, rateLimit);
    }

    applyRateLimitHeaders(res, rateLimit);

    const payload = await beginDailyChallenge(userId);
    return res.status(200).json(payload);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return res.status(401).json({ error: 'Missing or invalid token' });
    }

    if (error instanceof Error && error.message === 'DAILY_CHALLENGE_NOT_STARTED') {
      return res.status(409).json({ error: 'Daily challenge has not been started.' });
    }

    console.error('Daily begin POST error:', error);
    return res.status(500).json({ error: 'Failed to begin daily challenge.' });
  }
}

async function handleSubmit(req: VercelRequest, res: VercelResponse) {
  try {
    const { userId } = await requireClerkUser(req);
    const rateLimit = await checkRateLimit(req, RATE_LIMITS.dailySubmit, {
      keyParts: [userId],
    });
    if (!rateLimit.allowed) {
      return sendRateLimitExceeded(res, rateLimit);
    }

    applyRateLimitHeaders(res, rateLimit);

    const guessCoords = req.body?.guessCoords === null
      ? null
      : parseGuessCoords(req.body?.guessCoords);

    if (req.body?.guessCoords !== null && guessCoords === null) {
      return res.status(400).json({ error: 'Invalid guess payload.' });
    }

    const result = await submitDailyChallenge(userId, guessCoords);
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return res.status(401).json({ error: 'Missing or invalid token' });
    }

    if (error instanceof Error && error.message === 'DAILY_CHALLENGE_NOT_STARTED') {
      return res.status(409).json({ error: 'Daily challenge has not been started.' });
    }

    if (error instanceof Error && error.message === 'DAILY_CHALLENGE_NOT_READY') {
      return res.status(409).json({ error: 'Daily challenge is still loading.' });
    }

    console.error('Daily submit POST error:', error);
    return res.status(500).json({ error: 'Failed to submit daily challenge.' });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = getAction(req);

  if (req.method === 'GET') {
    if (action && action !== 'status') {
      return res.status(400).json({ error: 'Unsupported daily action.' });
    }

    return handleStatus(req, res);
  }

  if (req.method === 'POST') {
    if (action === 'start') {
      return handleStart(req, res);
    }

    if (action === 'begin') {
      return handleBegin(req, res);
    }

    if (action === 'submit') {
      return handleSubmit(req, res);
    }

    return res.status(400).json({ error: 'Unsupported daily action.' });
  }

  return res.status(405).send('Method Not Allowed');
}
