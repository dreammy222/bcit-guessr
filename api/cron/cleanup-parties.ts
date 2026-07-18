import type { VercelRequest, VercelResponse } from '@vercel/node';
import { deleteRows } from '../_lib/supabase.js';
import {
  RATE_LIMITS,
  applyRateLimitHeaders,
  checkRateLimit,
  sendRateLimitExceeded,
} from '../_lib/security.js';

export const config = {
  runtime: 'nodejs',
};

interface DeletedPartyRow {
  id: string;
}

function getBearerToken(req: VercelRequest) {
  const authHeader = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization;
  return authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';
}

function getCutoff(hoursAgo: number) {
  return new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
}

function getCutoffDays(daysAgo: number) {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const rateLimit = await checkRateLimit(req, RATE_LIMITS.cron);
  if (!rateLimit.allowed) {
    return sendRateLimitExceeded(res, rateLimit);
  }

  applyRateLimitHeaders(res, rateLimit);

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && getBearerToken(req) !== cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!cronSecret && process.env.VERCEL_ENV === 'production') {
    return res.status(500).json({ error: 'CRON_SECRET is not configured.' });
  }

  try {
    const [ended, lobby, active, finished] = await Promise.all([
      deleteRows<DeletedPartyRow>('party_sessions', {
        status: 'eq.ended',
        last_activity_at: `lt.${getCutoff(1)}`,
      }),
      deleteRows<DeletedPartyRow>('party_sessions', {
        status: 'eq.lobby',
        last_activity_at: `lt.${getCutoff(2)}`,
      }),
      deleteRows<DeletedPartyRow>('party_sessions', {
        status: ['round_loading', 'round_countdown', 'round_active', 'round_result', 'finalizing'],
        last_activity_at: `lt.${getCutoff(3)}`,
      }),
      deleteRows<DeletedPartyRow>('party_sessions', {
        status: 'eq.finished',
        last_activity_at: `lt.${getCutoffDays(1)}`,
      }),
    ]);

    const deleted = {
      ended: ended.length,
      lobby: lobby.length,
      active: active.length,
      finished: finished.length,
    };

    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(200).json({
      deleted,
      totalDeleted: deleted.ended + deleted.lobby + deleted.active + deleted.finished,
    });
  } catch (error) {
    console.error('Party cleanup error:', error);
    return res.status(500).json({ error: 'Failed to clean up parties.' });
  }
}
