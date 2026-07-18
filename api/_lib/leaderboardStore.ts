import { kv } from '@vercel/kv';
import { kvKey } from './serverConfig.js';

export const LEADERBOARD_KEY = kvKey('leaderboard');
const LEADERBOARD_SNAPSHOT_KEY = kvKey('leaderboard:top50:snapshot');
const BEST_SCORE_FIELD = 'bestScore';
const USERNAME_FIELD = 'username';
const LEADERBOARD_CACHE_TTL_MS = 10_000;
export const LEADERBOARD_DISPLAY_LIMIT = 50;

export interface LeaderboardEntryRecord {
  username: string;
  score: number;
}

interface LeaderboardSnapshotEntryRecord extends LeaderboardEntryRecord {
  id: string;
}

const USER_PROFILE_FALLBACK_STORE = new Map<
  string,
  {
    bestScore: number;
    username: string;
  }
>();
const LEADERBOARD_FALLBACK_STORE = new Map<string, number>();
const leaderboardCache = new Map<
  number,
  {
    expiresAt: number;
    value?: LeaderboardEntryRecord[];
    pending?: Promise<LeaderboardEntryRecord[]>;
  }
>();

function isKvConfigured() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function userKey(userId: string) {
  return `user:${userId}`;
}

function normalizeInteger(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function readFallbackHighscore(userId: string) {
  const value = USER_PROFILE_FALLBACK_STORE.get(userKey(userId));
  return value ? value.bestScore : null;
}

function writeFallbackProfile(userId: string, bestScore: number, username: string) {
  USER_PROFILE_FALLBACK_STORE.set(userKey(userId), {
    bestScore,
    username,
  });
  LEADERBOARD_FALLBACK_STORE.set(userId, bestScore);
}

function invalidateLeaderboardCache() {
  leaderboardCache.clear();
}

function getFallbackLeaderboardEntries(limit: number) {
  return [...LEADERBOARD_FALLBACK_STORE.entries()]
    .map(([userId, score]) => {
      const profile = USER_PROFILE_FALLBACK_STORE.get(userKey(userId));
      return {
        username: profile?.username || 'Anonymous',
        score,
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

function isLeaderboardEntryRecord(value: unknown): value is LeaderboardEntryRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const entry = value as Partial<LeaderboardEntryRecord>;
  return (
    typeof entry.username === 'string' &&
    typeof entry.score === 'number' &&
    Number.isFinite(entry.score)
  );
}

function isLeaderboardSnapshotEntryRecord(value: unknown): value is LeaderboardSnapshotEntryRecord {
  return (
    isLeaderboardEntryRecord(value) &&
    typeof (value as Partial<LeaderboardSnapshotEntryRecord>).id === 'string'
  );
}

function toPublicLeaderboardEntries(value: LeaderboardSnapshotEntryRecord[], limit: number) {
  return value.slice(0, limit).map(({ username, score }) => ({ username, score }));
}

function parseLeaderboardSnapshot(value: unknown, limit: number) {
  if (!Array.isArray(value)) {
    return null;
  }

  const entries = value.filter(isLeaderboardSnapshotEntryRecord);
  return entries.length === value.length ? toPublicLeaderboardEntries(entries, limit) : null;
}

function setLocalLeaderboardCache(limit: number, value: LeaderboardEntryRecord[]) {
  leaderboardCache.set(limit, {
    expiresAt: Date.now() + LEADERBOARD_CACHE_TTL_MS,
    value,
  });
}

async function writeLeaderboardSnapshot(value: LeaderboardSnapshotEntryRecord[]) {
  setLocalLeaderboardCache(
    LEADERBOARD_DISPLAY_LIMIT,
    toPublicLeaderboardEntries(value, LEADERBOARD_DISPLAY_LIMIT),
  );

  if (!isKvConfigured()) {
    return;
  }

  try {
    await kv.set(LEADERBOARD_SNAPSHOT_KEY, value.slice(0, LEADERBOARD_DISPLAY_LIMIT));
  } catch (error) {
    console.warn('Failed to persist leaderboard snapshot.', error);
  }
}

async function readLeaderboardSnapshot(limit: number) {
  if (!isKvConfigured()) {
    return null;
  }

  try {
    return parseLeaderboardSnapshot(await kv.get(LEADERBOARD_SNAPSHOT_KEY), limit);
  } catch (error) {
    console.warn('Failed to read leaderboard snapshot.', error);
    return null;
  }
}

async function rebuildLeaderboardSnapshot(limit: number) {
  if (!isKvConfigured()) {
    return getFallbackLeaderboardEntries(limit);
  }

  const rawLeaderboard = await kv.zrange(LEADERBOARD_KEY, 0, LEADERBOARD_DISPLAY_LIMIT - 1, {
    rev: true,
    withScores: true,
  });

  if (rawLeaderboard.length === 0) {
    await writeLeaderboardSnapshot([]);
    return [];
  }

  const entries: Array<{ id: string; score: number }> = [];
  for (let index = 0; index < rawLeaderboard.length; index += 2) {
    entries.push({
      id: rawLeaderboard[index] as string,
      score: rawLeaderboard[index + 1] as number,
    });
  }

  const snapshot = await Promise.all(
    entries.map(async (entry) => {
      const username = await kv.hget(userKey(entry.id), USERNAME_FIELD);
      const resolvedUsername = typeof username === 'string' && username.trim() ? username : 'Anonymous';
      writeFallbackProfile(entry.id, entry.score, resolvedUsername);
      return {
        id: entry.id,
        username: resolvedUsername,
        score: entry.score,
      };
    })
  );

  await writeLeaderboardSnapshot(snapshot);
  return toPublicLeaderboardEntries(snapshot, limit);
}

async function readRawLeaderboardSnapshot() {
  if (!isKvConfigured()) {
    return null;
  }

  try {
    const value = await kv.get(LEADERBOARD_SNAPSHOT_KEY);
    if (!Array.isArray(value) || !value.every(isLeaderboardSnapshotEntryRecord)) {
      return null;
    }

    return value.slice(0, LEADERBOARD_DISPLAY_LIMIT);
  } catch (error) {
    console.warn('Failed to read raw leaderboard snapshot.', error);
    return null;
  }
}

async function updateLeaderboardSnapshotAfterSubmit(userId: string, username: string, score: number) {
  const snapshot = await readRawLeaderboardSnapshot();
  if (!snapshot) {
    return;
  }

  const withoutUser = snapshot.filter((entry) => entry.id !== userId);
  const nextSnapshot = [...withoutUser, { id: userId, username, score }]
    .sort((left, right) => right.score - left.score)
    .slice(0, LEADERBOARD_DISPLAY_LIMIT);

  await writeLeaderboardSnapshot(nextSnapshot);
}

export async function getUserBestScore(userId: string) {
  if (!isKvConfigured()) {
    return readFallbackHighscore(userId);
  }

  try {
    const rawScore = await kv.hget(userKey(userId), BEST_SCORE_FIELD);
    const bestScore = rawScore === null ? null : normalizeInteger(rawScore, 0);

    if (bestScore !== null) {
      const rawUsername = await kv.hget(userKey(userId), USERNAME_FIELD);
      writeFallbackProfile(userId, bestScore, typeof rawUsername === 'string' ? rawUsername : 'Anonymous');
    }

    return bestScore;
  } catch (error) {
    console.warn('Highscore storage falling back to in-memory state.', error);
    return readFallbackHighscore(userId);
  }
}

export async function submitLeaderboardScore(userId: string, score: number, username: string) {
  const personalBest = await getUserBestScore(userId);

  if (personalBest !== null && score <= personalBest) {
    return {
      isNewBest: false,
      personalBest,
    };
  }

  writeFallbackProfile(userId, score, username);
  invalidateLeaderboardCache();

  if (!isKvConfigured()) {
    return {
      isNewBest: true,
      personalBest: personalBest ?? 0,
    };
  }

  try {
    await kv.hset(userKey(userId), {
      [BEST_SCORE_FIELD]: score,
      [USERNAME_FIELD]: username,
    });
    await kv.zadd(LEADERBOARD_KEY, { score, member: userId });
    await kv.zremrangebyrank(LEADERBOARD_KEY, 0, -1001);
    await updateLeaderboardSnapshotAfterSubmit(userId, username, score);
  } catch (error) {
    console.warn('Leaderboard storage falling back to in-memory state.', error);
  }

  return {
    isNewBest: true,
    personalBest: personalBest ?? 0,
  };
}

export async function getLeaderboardEntries(limit = LEADERBOARD_DISPLAY_LIMIT): Promise<LeaderboardEntryRecord[]> {
  const now = Date.now();
  const cached = leaderboardCache.get(limit);

  if (cached?.value && cached.expiresAt > now) {
    return cached.value;
  }

  if (cached?.pending) {
    return cached.pending;
  }

  const pending = (async () => {
    if (!isKvConfigured()) {
      return getFallbackLeaderboardEntries(limit);
    }

    try {
      return (await readLeaderboardSnapshot(limit)) ?? (await rebuildLeaderboardSnapshot(limit));
    } catch (error) {
      console.warn('Leaderboard reads falling back to in-memory state.', error);
      return getFallbackLeaderboardEntries(limit);
    }
  })()
    .then((value) => {
      setLocalLeaderboardCache(limit, value);
      return value;
    })
    .finally(() => {
      const current = leaderboardCache.get(limit);
      if (current?.pending === pending && current.value === undefined) {
        leaderboardCache.delete(limit);
      }
    });

  leaderboardCache.set(limit, {
    expiresAt: now + LEADERBOARD_CACHE_TTL_MS,
    pending,
  });

  return pending;
}
