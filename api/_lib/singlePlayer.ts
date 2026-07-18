import { kv } from '@vercel/kv';

export const SINGLE_PLAYER_SESSION_TTL_SECONDS = 60 * 30;
const SINGLE_PLAYER_SUBMIT_LOCK_TTL_SECONDS = 10;

export interface SinglePlayerPhotoRecord {
  id: string;
  filename: string;
  label?: string;
}

export interface SinglePlayerRoundResultRecord {
  photoId: string;
  photoLabel: string;
  guessCoords: [number, number] | null;
  actualCoords: [number, number];
  distanceKm: number | null;
  timeRemaining: number;
  points: number;
  submittedAt: number;
}

export type SinglePlayerSessionStatus = 'loading' | 'playing' | 'round-result' | 'finished';

export interface SinglePlayerSessionRecord {
  id: string;
  ownerUserId: string | null;
  clientToken: string | null;
  selectedPhotos: SinglePlayerPhotoRecord[];
  createdAt: number;
  status: SinglePlayerSessionStatus;
  currentRoundPreparedAt: number | null;
  currentRoundStartedAt: number | null;
  roundResults: SinglePlayerRoundResultRecord[];
  totalScore: number;
  leaderboardSubmittedAt: number | null;
}

const SINGLE_PLAYER_SESSION_FALLBACK_STORE = new Map<
  string,
  {
    expiresAt: number;
    value: SinglePlayerSessionRecord;
  }
>();
const SINGLE_PLAYER_SESSION_LOCK_FALLBACK_STORE = new Map<
  string,
  {
    expiresAt: number;
    token: string;
  }
>();

function isKvConfigured() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function canUseFallbackStore() {
  return process.env.NODE_ENV !== 'production';
}

function singlePlayerSessionKey(sessionId: string) {
  return `single-player:session:${sessionId}`;
}

function singlePlayerSubmitLockKey(sessionId: string, roundIndex: number) {
  return `single-player:submit-lock:${sessionId}:${roundIndex}`;
}

function cleanupFallbackSessions(now = Date.now()) {
  for (const [key, entry] of SINGLE_PLAYER_SESSION_FALLBACK_STORE.entries()) {
    if (entry.expiresAt <= now) {
      SINGLE_PLAYER_SESSION_FALLBACK_STORE.delete(key);
    }
  }

  for (const [key, entry] of SINGLE_PLAYER_SESSION_LOCK_FALLBACK_STORE.entries()) {
    if (entry.expiresAt <= now) {
      SINGLE_PLAYER_SESSION_LOCK_FALLBACK_STORE.delete(key);
    }
  }
}

function writeFallbackSession(record: SinglePlayerSessionRecord, ttlSeconds = SINGLE_PLAYER_SESSION_TTL_SECONDS) {
  SINGLE_PLAYER_SESSION_FALLBACK_STORE.set(record.id, {
    expiresAt: Date.now() + ttlSeconds * 1000,
    value: record,
  });
}

function fallbackKvUnavailableError() {
  return new Error('Single-player session storage is not configured.');
}

function handleKvFailure(message: string, error: unknown) {
  if (canUseFallbackStore()) {
    console.warn(`${message} Falling back to in-memory state.`, error);
    return;
  }

  console.error(message, error);
  throw error;
}

function acquireFallbackExpiringLock(key: string, token: string, ttlSeconds: number) {
  cleanupFallbackSessions();

  const existingLock = SINGLE_PLAYER_SESSION_LOCK_FALLBACK_STORE.get(key);
  if (existingLock && existingLock.expiresAt > Date.now()) {
    return false;
  }

  SINGLE_PLAYER_SESSION_LOCK_FALLBACK_STORE.set(key, {
    token,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
  return true;
}

export function getSinglePlayerCurrentRoundIndex(record: SinglePlayerSessionRecord) {
  return record.roundResults.length;
}

export function getSinglePlayerRoundDeadlineAt(record: SinglePlayerSessionRecord, roundTimerSeconds: number) {
  if (record.currentRoundStartedAt === null) {
    return null;
  }

  return record.currentRoundStartedAt + roundTimerSeconds * 1000;
}

export function getSinglePlayerActivePhoto(record: SinglePlayerSessionRecord) {
  return record.selectedPhotos[getSinglePlayerCurrentRoundIndex(record)] ?? null;
}

export async function createSinglePlayerSession(
  selectedPhotos: SinglePlayerPhotoRecord[],
  clientToken?: string | null,
  ownerUserId?: string | null,
) {
  const startedAt = Date.now();
  const record: SinglePlayerSessionRecord = {
    id: crypto.randomUUID(),
    ownerUserId: ownerUserId || null,
    clientToken: clientToken || null,
    selectedPhotos,
    createdAt: startedAt,
    status: 'loading',
    currentRoundPreparedAt: startedAt,
    currentRoundStartedAt: null,
    roundResults: [],
    totalScore: 0,
    leaderboardSubmittedAt: null,
  };

  if (canUseFallbackStore()) {
    writeFallbackSession(record);
  }

  if (!isKvConfigured()) {
    if (!canUseFallbackStore()) {
      throw fallbackKvUnavailableError();
    }

    return record;
  }

  try {
    await kv.set(singlePlayerSessionKey(record.id), record, {
      ex: SINGLE_PLAYER_SESSION_TTL_SECONDS,
    });
  } catch (error) {
    handleKvFailure('Failed to persist single-player session to KV.', error);
  }

  return record;
}

export async function getSinglePlayerSession(sessionId: string) {
  cleanupFallbackSessions();

  if (!isKvConfigured()) {
    if (!canUseFallbackStore()) {
      throw fallbackKvUnavailableError();
    }

    return SINGLE_PLAYER_SESSION_FALLBACK_STORE.get(sessionId)?.value ?? null;
  }

  try {
    return (
      ((await kv.get(singlePlayerSessionKey(sessionId))) as SinglePlayerSessionRecord | null) ??
      (canUseFallbackStore() ? SINGLE_PLAYER_SESSION_FALLBACK_STORE.get(sessionId)?.value : null) ??
      null
    );
  } catch (error) {
    handleKvFailure('Failed to look up single-player session in KV.', error);
    return SINGLE_PLAYER_SESSION_FALLBACK_STORE.get(sessionId)?.value ?? null;
  }
}

export async function saveSinglePlayerSession(record: SinglePlayerSessionRecord) {
  if (canUseFallbackStore()) {
    writeFallbackSession(record);
  }

  if (!isKvConfigured()) {
    if (!canUseFallbackStore()) {
      throw fallbackKvUnavailableError();
    }

    return;
  }

  try {
    await kv.set(singlePlayerSessionKey(record.id), record, {
      ex: SINGLE_PLAYER_SESSION_TTL_SECONDS,
    });
  } catch (error) {
    handleKvFailure('Failed to persist single-player session to KV.', error);
  }
}

export async function tryAcquireSinglePlayerSubmitLock(sessionId: string, roundIndex: number) {
  const key = singlePlayerSubmitLockKey(sessionId, roundIndex);
  const token = crypto.randomUUID();

  if (!isKvConfigured()) {
    if (!canUseFallbackStore()) {
      throw fallbackKvUnavailableError();
    }

    return acquireFallbackExpiringLock(key, token, SINGLE_PLAYER_SUBMIT_LOCK_TTL_SECONDS);
  }

  try {
    const result = await kv.set(key, token, {
      nx: true,
      ex: SINGLE_PLAYER_SUBMIT_LOCK_TTL_SECONDS,
    });
    return result === 'OK';
  } catch (error) {
    if (!canUseFallbackStore()) {
      console.error('Failed to acquire single-player submit lock in KV.', error);
      throw error;
    }

    console.warn('Single-player submit locking falling back to in-memory state.', error);
    return acquireFallbackExpiringLock(key, token, SINGLE_PLAYER_SUBMIT_LOCK_TTL_SECONDS);
  }
}
