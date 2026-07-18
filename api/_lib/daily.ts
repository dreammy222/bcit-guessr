import { kv } from '@vercel/kv';
import { SCHOOL } from '../../src/config/school.js';
import { awardDailyCoinsOnce } from './account.js';
import { calculateScore, getPhotoUrl, haversineDistance } from './gameMath.js';
import { getStoredLocation, listStoredLocations } from './awsLocations.js';

const DAILY_TIME_ZONE = SCHOOL.timezone;
const DAILY_ATTEMPT_TTL_SECONDS = 60 * 60 * 72;
const DAILY_CHALLENGE_TTL_SECONDS = 60 * 60 * 48;
const DAILY_TIMER_SECONDS = 60;
const ENFORCE_DAILY_ATTEMPT_LIMIT = true;

export type DailyChallengeState = 'available' | 'in_progress' | 'played' | 'unavailable';

export interface DailyChallengeResultPayload {
  photoId: string;
  photoLabel: string;
  actualCoords: [number, number];
  guessCoords: [number, number] | null;
  distanceKm: number | null;
  points: number;
}

export interface DailyChallengeStatusPayload {
  dateKey: string;
  refreshAt: number;
  state: DailyChallengeState;
  canStart: boolean;
  deadlineAt: number | null;
  requiresAuth: boolean;
}

export type DailyChallengeStartPayload =
  | {
      dateKey: string;
      refreshAt: number;
      state: 'in_progress';
      startedAt: number | null;
      deadlineAt: number | null;
      awaitingPhotoReady: boolean;
      photoUrl: string;
    }
  | {
      dateKey: string;
      refreshAt: number;
      state: 'played';
      result: DailyChallengeResultPayload;
    }
  | {
      dateKey: string;
      refreshAt: number;
      state: 'unavailable';
      message: string;
    };

interface DailyAttemptRecord {
  dateKey: string;
  photoId: string;
  startedAt: number | null;
  deadlineAt: number | null;
  status: 'loading' | 'in_progress' | 'completed';
  submittedAt: number | null;
  guessCoords: [number, number] | null;
  result: DailyChallengeResultPayload | null;
}

interface DailyContext {
  dateKey: string;
  refreshAt: number;
}

const ATTEMPT_FALLBACK_STORE = new Map<string, DailyAttemptRecord>();
const CHALLENGE_FALLBACK_STORE = new Map<string, string>();

function isKvConfigured() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function getFormatter() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DAILY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
}

function getTimeZoneParts(date: Date) {
  const formatted = getFormatter().formatToParts(date);
  const getValue = (type: Intl.DateTimeFormatPart['type']) =>
    Number(formatted.find((part) => part.type === type)?.value ?? '0');

  return {
    year: getValue('year'),
    month: getValue('month'),
    day: getValue('day'),
    hour: getValue('hour'),
    minute: getValue('minute'),
    second: getValue('second'),
  };
}

function getTimeZoneOffsetMs(date: Date) {
  const parts = getTimeZoneParts(date);
  const utcTime = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return utcTime - date.getTime();
}

function zonedDateTimeToUtcMs(year: number, month: number, day: number, hour = 0, minute = 0, second = 0) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset = getTimeZoneOffsetMs(new Date(utcGuess));
  const adjusted = utcGuess - offset;
  const adjustedOffset = getTimeZoneOffsetMs(new Date(adjusted));
  return utcGuess - adjustedOffset;
}

export function getDailyContext(now = new Date()): DailyContext {
  const parts = getTimeZoneParts(now);
  const dateKey = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  const nextCalendarDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  const refreshAt = zonedDateTimeToUtcMs(
    nextCalendarDate.getUTCFullYear(),
    nextCalendarDate.getUTCMonth() + 1,
    nextCalendarDate.getUTCDate(),
  );

  return { dateKey, refreshAt };
}

function challengeKey(dateKey: string) {
  return `daily:challenge:${dateKey}`;
}

function attemptKey(dateKey: string, userId: string) {
  return `daily:attempt:${dateKey}:${userId}`;
}

function stableHash(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

async function readDailyPhotoId(dateKey: string) {
  const key = challengeKey(dateKey);

  if (!isKvConfigured()) {
    return CHALLENGE_FALLBACK_STORE.get(key) ?? null;
  }

  try {
    return ((await kv.get(key)) as string | null) ?? null;
  } catch (error) {
    console.warn('Daily challenge selection falling back to in-memory storage.', error);
    return CHALLENGE_FALLBACK_STORE.get(key) ?? null;
  }
}

async function writeDailyPhotoId(dateKey: string, photoId: string) {
  const key = challengeKey(dateKey);
  CHALLENGE_FALLBACK_STORE.set(key, photoId);

  if (!isKvConfigured()) {
    return;
  }

  try {
    await kv.set(key, photoId, { ex: DAILY_CHALLENGE_TTL_SECONDS });
  } catch (error) {
    console.warn('Failed to persist daily challenge selection to KV.', error);
  }
}

async function readAttempt(dateKey: string, userId: string) {
  const key = attemptKey(dateKey, userId);

  if (!isKvConfigured()) {
    return ATTEMPT_FALLBACK_STORE.get(key) ?? null;
  }

  try {
    return ((await kv.get(key)) as DailyAttemptRecord | null) ?? ATTEMPT_FALLBACK_STORE.get(key) ?? null;
  } catch (error) {
    console.warn('Daily attempt storage falling back to in-memory storage.', error);
    return ATTEMPT_FALLBACK_STORE.get(key) ?? null;
  }
}

async function writeAttempt(record: DailyAttemptRecord, userId: string) {
  const key = attemptKey(record.dateKey, userId);
  ATTEMPT_FALLBACK_STORE.set(key, record);

  if (!isKvConfigured()) {
    return;
  }

  try {
    await kv.set(key, record, { ex: DAILY_ATTEMPT_TTL_SECONDS });
  } catch (error) {
    console.warn('Failed to persist daily attempt to KV.', error);
  }
}

async function getDailyPhoto(dateKey: string) {
  const storedPhotoId = await readDailyPhotoId(dateKey);
  if (storedPhotoId) {
    const storedLocation = await getStoredLocation(storedPhotoId);
    if (storedLocation) {
      return storedLocation;
    }
  }

  const eligibleLocations = await listStoredLocations();
  if (eligibleLocations.length === 0) {
    return null;
  }

  const sortedLocations = [...eligibleLocations].sort((left, right) => left.id.localeCompare(right.id));
  const selectedLocation = sortedLocations[stableHash(dateKey) % sortedLocations.length];

  await writeDailyPhotoId(dateKey, selectedLocation.id);

  return selectedLocation;
}

function buildResultPayload(
  photoId: string,
  photoLabel: string,
  actualCoords: [number, number],
  guessCoords: [number, number] | null,
  timeRemaining: number,
) {
  let distanceKm: number | null = null;
  let points = 0;

  if (guessCoords) {
    distanceKm = haversineDistance(
      guessCoords[0],
      guessCoords[1],
      actualCoords[0],
      actualCoords[1],
    );
    points = calculateScore(distanceKm, timeRemaining);
  }

  return {
    photoId,
    photoLabel,
    actualCoords,
    guessCoords,
    distanceKm,
    points,
  } satisfies DailyChallengeResultPayload;
}

async function finalizeAttempt(record: DailyAttemptRecord, userId: string, guessCoords: [number, number] | null) {
  if (record.deadlineAt === null) {
    throw new Error('DAILY_CHALLENGE_NOT_READY');
  }

  const location = await getStoredLocation(record.photoId);
  if (!location) {
    throw new Error('DAILY_PHOTO_NOT_FOUND');
  }

  const submittedAt = Date.now();
  const timeRemaining = Math.max(0, Math.ceil((record.deadlineAt - submittedAt) / 1000));
  const result = buildResultPayload(
    location.id,
    location.label ?? location.id,
    location.coordinates,
    guessCoords,
    timeRemaining,
  );

  const completedRecord: DailyAttemptRecord = {
    ...record,
    status: 'completed',
    submittedAt,
    guessCoords,
    result,
  };

  await writeAttempt(completedRecord, userId);
  await awardDailyCoinsOnce(record.dateKey, userId, result.points);
  return completedRecord;
}

async function normalizeAttemptState(record: DailyAttemptRecord | null, userId: string) {
  if (!record) {
    return null;
  }

  if (record.status === 'completed') {
    return record;
  }

  if (record.status === 'loading' || record.deadlineAt === null) {
    return record;
  }

  if (record.deadlineAt > Date.now()) {
    return record;
  }

  return finalizeAttempt(record, userId, record.guessCoords);
}

export async function getDailyChallengeStatus(userId?: string | null): Promise<DailyChallengeStatusPayload> {
  const { dateKey, refreshAt } = getDailyContext();
  const selectedPhoto = await getDailyPhoto(dateKey);

  if (!selectedPhoto) {
    return {
      dateKey,
      refreshAt,
      state: 'unavailable',
      canStart: false,
      deadlineAt: null,
      requiresAuth: false,
    };
  }

  if (!userId) {
    return {
      dateKey,
      refreshAt,
      state: 'available',
      canStart: false,
      deadlineAt: null,
      requiresAuth: true,
    };
  }

  const attempt = await normalizeAttemptState(await readAttempt(dateKey, userId), userId);

  if (!attempt) {
    return {
      dateKey,
      refreshAt,
      state: 'available',
      canStart: true,
      deadlineAt: null,
      requiresAuth: false,
    };
  }

  if (attempt.status === 'completed') {
    return {
      dateKey,
      refreshAt,
      state: ENFORCE_DAILY_ATTEMPT_LIMIT ? 'played' : 'available',
      canStart: !ENFORCE_DAILY_ATTEMPT_LIMIT,
      deadlineAt: null,
      requiresAuth: false,
    };
  }

  return {
    dateKey,
    refreshAt,
    state: 'in_progress',
    canStart: true,
    deadlineAt: attempt.deadlineAt,
    requiresAuth: false,
  };
}

function buildDailyChallengeStartPayload(
  dateKey: string,
  refreshAt: number,
  attempt: DailyAttemptRecord,
): DailyChallengeStartPayload {
  return {
    dateKey,
    refreshAt,
    state: 'in_progress',
    startedAt: attempt.startedAt,
    deadlineAt: attempt.deadlineAt,
    awaitingPhotoReady: attempt.status === 'loading' || attempt.deadlineAt === null,
    photoUrl: getPhotoUrl(attempt.photoId),
  };
}

export async function startDailyChallenge(userId: string): Promise<DailyChallengeStartPayload> {
  const { dateKey, refreshAt } = getDailyContext();
  const selectedPhoto = await getDailyPhoto(dateKey);

  if (!selectedPhoto) {
    return {
      dateKey,
      refreshAt,
      state: 'unavailable',
      message: 'Daily challenge is not configured yet.',
    };
  }

  const existingAttempt = await normalizeAttemptState(await readAttempt(dateKey, userId), userId);

  if (ENFORCE_DAILY_ATTEMPT_LIMIT && existingAttempt?.status === 'completed' && existingAttempt.result) {
    return {
      dateKey,
      refreshAt,
      state: 'played',
      result: existingAttempt.result,
    };
  }

  if (existingAttempt?.status === 'in_progress') {
    return buildDailyChallengeStartPayload(dateKey, refreshAt, existingAttempt);
  }

  if (existingAttempt?.status === 'loading') {
    return buildDailyChallengeStartPayload(dateKey, refreshAt, existingAttempt);
  }

  const nextAttempt: DailyAttemptRecord = {
    dateKey,
    photoId: selectedPhoto.id,
    startedAt: null,
    deadlineAt: null,
    status: 'loading',
    submittedAt: null,
    guessCoords: null,
    result: null,
  };

  await writeAttempt(nextAttempt, userId);

  return buildDailyChallengeStartPayload(dateKey, refreshAt, nextAttempt);
}

export async function beginDailyChallenge(userId: string): Promise<DailyChallengeStartPayload> {
  const { dateKey, refreshAt } = getDailyContext();
  const existingAttempt = await normalizeAttemptState(await readAttempt(dateKey, userId), userId);

  if (!existingAttempt) {
    throw new Error('DAILY_CHALLENGE_NOT_STARTED');
  }

  if (existingAttempt.status === 'completed') {
    if (!existingAttempt.result) {
      throw new Error('DAILY_RESULT_MISSING');
    }

    return {
      dateKey,
      refreshAt,
      state: 'played',
      result: existingAttempt.result,
    };
  }

  if (
    existingAttempt.status === 'in_progress' &&
    existingAttempt.startedAt !== null &&
    existingAttempt.deadlineAt !== null
  ) {
    return buildDailyChallengeStartPayload(dateKey, refreshAt, existingAttempt);
  }

  const startedAt = Date.now();
  const deadlineAt = startedAt + DAILY_TIMER_SECONDS * 1000;
  const updatedAttempt: DailyAttemptRecord = {
    ...existingAttempt,
    startedAt,
    deadlineAt,
    status: 'in_progress',
  };

  await writeAttempt(updatedAttempt, userId);

  return buildDailyChallengeStartPayload(dateKey, refreshAt, updatedAttempt);
}

export async function submitDailyChallenge(userId: string, guessCoords: [number, number] | null) {
  const { dateKey } = getDailyContext();
  const existingAttempt = await normalizeAttemptState(await readAttempt(dateKey, userId), userId);

  if (!existingAttempt) {
    throw new Error('DAILY_CHALLENGE_NOT_STARTED');
  }

  if (existingAttempt.status === 'completed') {
    if (!existingAttempt.result) {
      throw new Error('DAILY_RESULT_MISSING');
    }

    return existingAttempt.result;
  }

  if (existingAttempt.status === 'loading' || existingAttempt.deadlineAt === null) {
    throw new Error('DAILY_CHALLENGE_NOT_READY');
  }

  const finalizedAttempt = await finalizeAttempt(existingAttempt, userId, guessCoords);
  if (!finalizedAttempt.result) {
    throw new Error('DAILY_RESULT_MISSING');
  }

  return finalizedAttempt.result;
}
