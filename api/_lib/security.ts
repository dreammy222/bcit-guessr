import { kv } from '@vercel/kv';
import type { VercelRequest, VercelResponse } from '@vercel/node';

type RequestLike = Request | Pick<VercelRequest, 'headers' | 'method' | 'url'>;

export interface RateLimitPolicy {
  name: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

const FALLBACK_WINDOW_STORE = new Map<string, { count: number; resetAt: number }>();
const KV_TTL_PADDING_SECONDS = 5;
const RATE_LIMIT_BACKEND = process.env.RATE_LIMIT_BACKEND?.trim().toLowerCase() ?? 'memory';

export const RATE_LIMITS = {
  singlePlayerStart: { name: 'single-player-start', limit: 6, windowMs: 60_000 },
  // Shared-IP backstops are intentionally high so campus NATs can support
  // launch traffic; per-client/per-session limits carry the security load.
  singlePlayerStartIp: { name: 'single-player-start-ip', limit: 3_000, windowMs: 60_000 },
  scoreSession: { name: 'score-session', limit: 24, windowMs: 60_000 },
  scoreIp: { name: 'score-ip', limit: 10_000, windowMs: 60_000 },
  leaderboardRead: { name: 'leaderboard-read', limit: 3_000, windowMs: 60_000 },
  leaderboardWriteUser: { name: 'leaderboard-write-user', limit: 10, windowMs: 60_000 },
  leaderboardWriteIp: { name: 'leaderboard-write-ip', limit: 600, windowMs: 60_000 },
  highscoreUser: { name: 'highscore-user', limit: 60, windowMs: 60_000 },
  highscoreIp: { name: 'highscore-ip', limit: 3_000, windowMs: 60_000 },
  accountRead: { name: 'account-read', limit: 60, windowMs: 60_000 },
  avatarWriteUser: { name: 'avatar-write-user', limit: 30, windowMs: 60_000 },
  avatarWriteIp: { name: 'avatar-write-ip', limit: 600, windowMs: 60_000 },
  bootstrapUser: { name: 'bootstrap-user', limit: 30, windowMs: 60_000 },
  bootstrapIp: { name: 'bootstrap-ip', limit: 3_000, windowMs: 60_000 },
  dailyStatus: { name: 'daily-status', limit: 120, windowMs: 60_000 },
  dailyStart: { name: 'daily-start', limit: 30, windowMs: 60_000 },
  dailySubmit: { name: 'daily-submit', limit: 30, windowMs: 60_000 },
  partyCreate: { name: 'party-create', limit: 10, windowMs: 60_000 },
  partyJoin: { name: 'party-join', limit: 20, windowMs: 60_000 },
  partyControl: { name: 'party-control', limit: 30, windowMs: 60_000 },
  partySubmit: { name: 'party-submit', limit: 60, windowMs: 60_000 },
  partyReady: { name: 'party-ready', limit: 120, windowMs: 60_000 },
  partyStatus: { name: 'party-status', limit: 120, windowMs: 60_000 },
  partyProgress: { name: 'party-progress', limit: 600, windowMs: 60_000 },
  webhook: { name: 'webhook', limit: 120, windowMs: 60_000 },
  cron: { name: 'cron', limit: 20, windowMs: 60_000 },
} satisfies Record<string, RateLimitPolicy>;

function getHeaderValue(
  headers: Headers | VercelRequest['headers'],
  name: string
): string | null {
  if (headers instanceof Headers) {
    return headers.get(name);
  }

  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function isStandardRequest(req: RequestLike): req is Request {
  return typeof Request !== 'undefined' && req instanceof Request;
}

function sanitizeKeyPart(value: string) {
  return value.replace(/[^a-zA-Z0-9:_-]/g, '_').slice(0, 120) || 'unknown';
}

export function getClientIp(req: RequestLike) {
  const headers = isStandardRequest(req) ? req.headers : req.headers;
  const candidates = [
    getHeaderValue(headers, 'x-forwarded-for'),
    getHeaderValue(headers, 'x-real-ip'),
    getHeaderValue(headers, 'x-vercel-forwarded-for'),
    getHeaderValue(headers, 'cf-connecting-ip'),
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const ip = candidate.split(',')[0]?.trim();
    if (ip) {
      return ip;
    }
  }

  return 'unknown';
}

function getFixedWindowKey(policy: RateLimitPolicy, identifier: string, now = Date.now()) {
  const bucket = Math.floor(now / policy.windowMs);
  return {
    bucket,
    key: `rate:${policy.name}:${bucket}:${sanitizeKeyPart(identifier)}`,
  };
}

function isKvConfigured() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function shouldUseKvRateLimiter() {
  return RATE_LIMIT_BACKEND === 'kv' && isKvConfigured();
}

async function incrementFallbackWindow(key: string, resetAt: number) {
  const now = Date.now();

  for (const [entryKey, entry] of FALLBACK_WINDOW_STORE.entries()) {
    if (entry.resetAt <= now) {
      FALLBACK_WINDOW_STORE.delete(entryKey);
    }
  }

  const existing = FALLBACK_WINDOW_STORE.get(key);
  if (!existing || existing.resetAt <= now) {
    FALLBACK_WINDOW_STORE.set(key, { count: 1, resetAt });
    return 1;
  }

  const nextCount = existing.count + 1;
  FALLBACK_WINDOW_STORE.set(key, {
    count: nextCount,
    resetAt: existing.resetAt,
  });
  return nextCount;
}

async function incrementWindow(
  policy: RateLimitPolicy,
  identifier: string
) {
  const now = Date.now();
  const { bucket, key } = getFixedWindowKey(policy, identifier, now);
  const resetAt = (bucket + 1) * policy.windowMs;

  if (!shouldUseKvRateLimiter()) {
    const count = await incrementFallbackWindow(key, resetAt);
    return { count, resetAt };
  }

  try {
    const count = await kv.incr(key);
    if (count === 1) {
      const ttlSeconds = Math.ceil(policy.windowMs / 1000) + KV_TTL_PADDING_SECONDS;
      await kv.expire(key, ttlSeconds);
    }

    return { count, resetAt };
  } catch (error) {
    console.warn(`Rate limiter falling back to in-memory storage for "${policy.name}".`, error);
    const count = await incrementFallbackWindow(key, resetAt);
    return { count, resetAt };
  }
}

export async function checkRateLimit(
  req: RequestLike,
  policy: RateLimitPolicy,
  options?: {
    includeIp?: boolean;
    keyParts?: Array<string | undefined | null>;
  }
): Promise<RateLimitResult> {
  const identifier = [
    ...(options?.includeIp === false ? [] : [getClientIp(req)]),
    ...(options?.keyParts ?? []).filter(Boolean).map((value) => String(value)),
  ]
    .map(sanitizeKeyPart)
    .filter(Boolean)
    .join(':');

  const { count, resetAt } = await incrementWindow(policy, identifier || 'anonymous');
  const remaining = Math.max(0, policy.limit - count);
  const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));

  return {
    allowed: count <= policy.limit,
    limit: policy.limit,
    remaining,
    resetAt,
    retryAfterSeconds,
  };
}

export function buildRateLimitHeaders(result: RateLimitResult) {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': new Date(result.resetAt).toISOString(),
  };

  if (!result.allowed) {
    headers['Retry-After'] = String(result.retryAfterSeconds);
  }

  return headers;
}

export function applyRateLimitHeaders(res: VercelResponse, result: RateLimitResult) {
  const headers = buildRateLimitHeaders(result);
  Object.entries(headers).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
}

export function buildRateLimitExceededResponse(
  result: RateLimitResult,
  message = 'Too many requests. Please try again shortly.'
) {
  return new Response(JSON.stringify({ error: message }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      ...buildRateLimitHeaders(result),
    },
  });
}

export function sendRateLimitExceeded(
  res: VercelResponse,
  result: RateLimitResult,
  message = 'Too many requests. Please try again shortly.'
) {
  applyRateLimitHeaders(res, result);
  return res.status(429).json({ error: message });
}
