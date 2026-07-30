import { randomInt, randomUUID } from 'node:crypto';
import { getUserAccount } from './account.js';
import { calculateScore, getPhotoUrl, haversineDistance, ROUND_TIMER_SECONDS } from './gameMath.js';
import type {
  PartyProgressPlayer,
  PartyProgressResponse,
  PartyPlayerSummary,
  PartySessionPayload,
  PartyStatusResponse,
  PartyStatusValue,
  PartyTopEntry,
  PartyViewerRole,
} from '../../src/party/types';
import { getStoredLocation, listStoredLocations } from './locationStore.js';
import { insertRows, selectRows, selectSingle, updateRows } from './supabase.js';

const PARTY_MAX_PLAYERS = 30;
const PARTY_MIN_ROUND_TIME_SECONDS = 10;
const PARTY_ROUND_LOADING_TIMEOUT_SECONDS = 12;
const PARTY_ROUND_COUNTDOWN_SECONDS = 3;
const PRESENCE_REFRESH_INTERVAL_MS = 20 * 1000;
const PRESENCE_STALE_TIMEOUT_MS = 45 * 1000;

type PartyPhotoConfig = string[] | {
  photoIds?: unknown;
  roundTimeSeconds?: unknown;
};

interface PartySessionRow {
  id: string;
  join_code: string;
  host_user_id: string;
  host_display_name: string;
  status: PartyStatusValue;
  rounds_count: number;
  round_time_seconds?: number | null;
  current_round_index: number;
  round_loading_deadline_at: string | null;
  current_round_started_at: string | null;
  result_started_at: string | null;
  selected_photo_ids: PartyPhotoConfig;
  last_activity_at: string;
  created_at: string;
}

interface PartyPlayerRow {
  id: string;
  party_id: string;
  player_key: string;
  display_name: string;
  username_key: string;
  joined_at: string;
  last_seen_at: string;
  is_connected: boolean;
  round_ready_index: number;
  round_ready_at: string | null;
  total_points: number;
  current_rank: number | null;
}

interface PartyGuessRow {
  party_id: string;
  round_index: number;
  player_id: string;
  guess_lat: number | null;
  guess_lng: number | null;
  submitted_at: string;
  distance_km: number | null;
  points: number;
  round_rank: number | null;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeName(displayName: string) {
  return displayName.trim().toLowerCase();
}

function canHostEndParty(status: PartyStatusValue) {
  return (
    status === 'lobby' ||
    status === 'round_loading' ||
    status === 'round_countdown' ||
    status === 'round_active' ||
    status === 'round_result' ||
    status === 'finalizing'
  );
}

function shouldRefreshPresence(lastSeenAt: string) {
  return Date.now() - new Date(lastSeenAt).getTime() >= PRESENCE_REFRESH_INTERVAL_MS;
}

function isPlayerConnected(row: PartyPlayerRow) {
  return row.is_connected && Date.now() - new Date(row.last_seen_at).getTime() < PRESENCE_STALE_TIMEOUT_MS;
}

function isGuestPlayerKey(playerKey: string) {
  return playerKey.startsWith('guest_');
}

function normalizePartyRoundTimeSeconds(value: number) {
  const seconds = Number.isFinite(value) ? Math.floor(value) : ROUND_TIMER_SECONDS;

  if (seconds < PARTY_MIN_ROUND_TIME_SECONDS) {
    throw new Error('ROUND_TIME_TOO_SHORT');
  }

  return seconds;
}

function isValidRoundTimeSeconds(value: number) {
  return Number.isFinite(value) && value >= PARTY_MIN_ROUND_TIME_SECONDS;
}

function getPartyPhotoIds(session: PartySessionRow) {
  const photoConfig = session.selected_photo_ids;

  if (Array.isArray(photoConfig)) {
    return photoConfig.filter((photoId): photoId is string => typeof photoId === 'string');
  }

  if (photoConfig && typeof photoConfig === 'object' && Array.isArray(photoConfig.photoIds)) {
    return photoConfig.photoIds.filter((photoId): photoId is string => typeof photoId === 'string');
  }

  return [];
}

function getPartyPhotoId(session: PartySessionRow, roundIndex: number) {
  return getPartyPhotoIds(session)[roundIndex] ?? null;
}

function getConfiguredRoundTimeSeconds(session: PartySessionRow) {
  const photoConfig = session.selected_photo_ids;
  if (photoConfig && !Array.isArray(photoConfig) && typeof photoConfig === 'object') {
    const seconds = Number(photoConfig.roundTimeSeconds);
    if (isValidRoundTimeSeconds(seconds)) {
      return Math.floor(seconds);
    }
  }

  return null;
}

function getSessionRoundTimeSeconds(session: PartySessionRow) {
  const configuredSeconds = getConfiguredRoundTimeSeconds(session);
  if (configuredSeconds !== null) {
    return configuredSeconds;
  }

  const seconds = Number(session.round_time_seconds);

  if (!isValidRoundTimeSeconds(seconds)) {
    return ROUND_TIMER_SECONDS;
  }

  return Math.floor(seconds);
}

function getNextRoundStartTimeIso() {
  return new Date(Date.now() + PARTY_ROUND_COUNTDOWN_SECONDS * 1000).toISOString();
}

function getRoundLoadingDeadlineIso() {
  return new Date(Date.now() + PARTY_ROUND_LOADING_TIMEOUT_SECONDS * 1000).toISOString();
}

function getRoundLoadingSecondsRemaining(session: PartySessionRow) {
  if (!session.round_loading_deadline_at) {
    return PARTY_ROUND_LOADING_TIMEOUT_SECONDS;
  }

  const remainingMs = new Date(session.round_loading_deadline_at).getTime() - Date.now();
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

function getRoundCountdownSecondsRemaining(session: PartySessionRow) {
  if (!session.current_round_started_at) {
    return PARTY_ROUND_COUNTDOWN_SECONDS;
  }

  const remainingMs = new Date(session.current_round_started_at).getTime() - Date.now();
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

function getTimeRemainingForSubmission(session: PartySessionRow, submittedAt: string) {
  if (!session.current_round_started_at) {
    return 0;
  }

  const elapsedSeconds = Math.floor(
    (new Date(submittedAt).getTime() - new Date(session.current_round_started_at).getTime()) / 1000
  );
  return Math.max(0, getSessionRoundTimeSeconds(session) - elapsedSeconds);
}

function getSecondsRemaining(session: PartySessionRow) {
  const roundTimeSeconds = getSessionRoundTimeSeconds(session);

  if (!session.current_round_started_at) {
    return roundTimeSeconds;
  }

  const elapsedSeconds = Math.floor((Date.now() - new Date(session.current_round_started_at).getTime()) / 1000);
  return Math.max(0, roundTimeSeconds - elapsedSeconds);
}

function sortEntries<T extends { points: number; submittedAt: string; joinedAt: string }>(entries: T[]) {
  return [...entries].sort((a, b) => {
    if (b.points !== a.points) {
      return b.points - a.points;
    }

    const submitDelta = new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
    if (submitDelta !== 0) {
      return submitDelta;
    }

    return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
  });
}

function rankEntries<T extends { points: number; submittedAt: string; joinedAt: string }>(entries: T[]) {
  return sortEntries(entries).map((entry, index) => ({ ...entry, rank: index + 1 }));
}

function createJoinCode() {
  return `${randomInt(100000, 1000000)}`;
}

async function generateUniqueJoinCode() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = createJoinCode();
    const existing = await selectSingle<PartySessionRow>('party_sessions', {
      filters: { join_code: `eq.${code}` },
    });

    if (!existing) {
      return code;
    }
  }

  throw new Error('JOIN_CODE_GENERATION_FAILED');
}

async function selectPartyPhotoIds(roundsCount: number) {
  const locations = await listStoredLocations();
  const shuffled = [...locations].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(roundsCount, shuffled.length)).map((location) => location.id);
}

function normalizePartyRoundsCount(value: number) {
  const roundsCount = Number.isFinite(value) ? Math.floor(value) : 5;
  return Math.max(1, Math.min(roundsCount, 20));
}

function buildPartyPhotoConfig(photoIds: string[], roundTimeSeconds: number): PartyPhotoConfig {
  return {
    photoIds,
    roundTimeSeconds,
  };
}

export async function createPartySession(
  hostUserId: string,
  hostDisplayName: string,
  roundsCount: number,
  roundTimeSeconds = ROUND_TIMER_SECONDS
) {
  const normalizedRoundsCount = normalizePartyRoundsCount(roundsCount);
  const normalizedRoundTimeSeconds = normalizePartyRoundTimeSeconds(roundTimeSeconds);
  const joinCode = await generateUniqueJoinCode();
  const selectedPhotoIds = await selectPartyPhotoIds(normalizedRoundsCount);
  const createdAt = nowIso();
  const [session] = await insertRows<PartySessionRow>('party_sessions', [
    {
      id: randomUUID(),
      join_code: joinCode,
      host_user_id: hostUserId,
      host_display_name: hostDisplayName,
      status: 'lobby',
      rounds_count: normalizedRoundsCount,
      current_round_index: 0,
      round_loading_deadline_at: null,
      current_round_started_at: null,
      result_started_at: null,
      selected_photo_ids: buildPartyPhotoConfig(selectedPhotoIds, normalizedRoundTimeSeconds),
      last_activity_at: createdAt,
      created_at: createdAt,
    },
  ]);

  return session;
}

export async function getPartySessionByCode(joinCode: string) {
  return selectSingle<PartySessionRow>('party_sessions', {
    filters: { join_code: `eq.${joinCode}` },
  });
}

async function getPartyPlayers(partyId: string) {
  return selectRows<PartyPlayerRow>('party_players', {
    filters: { party_id: `eq.${partyId}` },
    order: 'joined_at.asc',
  });
}

async function getPartyGuesses(partyId: string, roundIndex?: number) {
  return selectRows<PartyGuessRow>('party_round_guesses', {
    filters: {
      party_id: `eq.${partyId}`,
      ...(typeof roundIndex === 'number' ? { round_index: `eq.${roundIndex}` } : {}),
    },
  });
}

async function touchPartyActivity(partyId: string, timestamp = nowIso()) {
  await updateRows<PartySessionRow>(
    'party_sessions',
    {
      last_activity_at: timestamp,
    },
    {
      id: `eq.${partyId}`,
    }
  );
}

async function haveAllPlayersSubmitted(session: PartySessionRow) {
  const [players, guesses] = await Promise.all([
    getPartyPlayers(session.id),
    getPartyGuesses(session.id, session.current_round_index),
  ]);

  if (players.length === 0) {
    return false;
  }

  const submittedPlayerIds = new Set(guesses.map((guess) => guess.player_id));
  return players.every((player) => submittedPlayerIds.has(player.id));
}

async function refreshPlayerPresence(player: PartyPlayerRow, force = false) {
  if (!force && player.is_connected && !shouldRefreshPresence(player.last_seen_at)) {
    return player;
  }

  const refreshedAt = nowIso();
  await updateRows<PartyPlayerRow>(
    'party_players',
    {
      is_connected: true,
      last_seen_at: refreshedAt,
    },
    {
      id: `eq.${player.id}`,
    }
  );

  return {
    ...player,
    is_connected: true,
    last_seen_at: refreshedAt,
  };
}

export async function joinPartySession(session: PartySessionRow, playerKey: string, displayName: string) {
  const normalizedName = normalizeName(displayName);
  const players = await getPartyPlayers(session.id);
  const existingPlayer = players.find((player) => player.player_key === playerKey);

  if (existingPlayer) {
    if (normalizeName(existingPlayer.display_name) !== normalizedName) {
      throw new Error('PLAYER_NAME_MISMATCH');
    }

    await refreshPlayerPresence(existingPlayer, true);
    await touchPartyActivity(session.id);
    return existingPlayer;
  }

  if (session.status !== 'lobby') {
    throw new Error('PARTY_ALREADY_STARTED');
  }

  if (players.length >= PARTY_MAX_PLAYERS) {
    throw new Error('PARTY_FULL');
  }

  const duplicateName = players.find((player) => player.username_key === normalizedName);
  if (duplicateName) {
    throw new Error('USERNAME_TAKEN');
  }

  const [player] = await insertRows<PartyPlayerRow>('party_players', [
    {
      id: randomUUID(),
      party_id: session.id,
      player_key: playerKey,
      display_name: displayName.trim(),
      username_key: normalizedName,
      joined_at: nowIso(),
      last_seen_at: nowIso(),
      is_connected: true,
      round_ready_index: -1,
      round_ready_at: null,
      total_points: 0,
      current_rank: null,
    },
  ]);

  await touchPartyActivity(session.id);

  return player;
}

export async function startPartySession(session: PartySessionRow, hostUserId: string) {
  if (session.host_user_id !== hostUserId) {
    throw new Error('FORBIDDEN');
  }

  if (session.status !== 'lobby') {
    throw new Error('INVALID_PARTY_STATE');
  }

  const players = await getPartyPlayers(session.id);
  if (players.length === 0) {
    throw new Error('NO_PLAYERS');
  }

  const [updated] = await updateRows<PartySessionRow>(
    'party_sessions',
    {
      status: 'round_loading',
      current_round_index: 0,
      round_loading_deadline_at: getRoundLoadingDeadlineIso(),
      current_round_started_at: null,
      result_started_at: null,
      last_activity_at: nowIso(),
    },
    {
      id: `eq.${session.id}`,
      status: 'eq.lobby',
    }
  );

  if (updated) {
    await clearRoundReadiness(updated.id);
  }

  return updated;
}

export async function endPartySession(session: PartySessionRow, hostUserId: string) {
  if (session.host_user_id !== hostUserId) {
    throw new Error('FORBIDDEN');
  }

  if (!canHostEndParty(session.status)) {
    throw new Error('INVALID_PARTY_STATE');
  }

  const timestamp = nowIso();
  const [updated] = await updateRows<PartySessionRow>(
    'party_sessions',
    {
      status: 'ended',
      round_loading_deadline_at: null,
      current_round_started_at: null,
      result_started_at: null,
      last_activity_at: timestamp,
    },
    {
      id: `eq.${session.id}`,
      status: ['lobby', 'round_loading', 'round_countdown', 'round_active', 'round_result', 'finalizing'],
    }
  );

  if (!updated) {
    throw new Error('INVALID_PARTY_STATE');
  }

  await updateRows<PartyPlayerRow>(
    'party_players',
    {
      is_connected: false,
      last_seen_at: timestamp,
    },
    {
      party_id: `eq.${session.id}`,
    }
  );

  return updated;
}

export async function advancePartySession(session: PartySessionRow, hostUserId: string) {
  const freshSession = await syncPartySession(session);

  if (freshSession.host_user_id !== hostUserId) {
    throw new Error('FORBIDDEN');
  }

  if (freshSession.status !== 'round_result') {
    throw new Error('INVALID_PARTY_STATE');
  }

  const nextRoundIndex = freshSession.current_round_index + 1;
  const isFinished = nextRoundIndex >= freshSession.rounds_count;

  const [updated] = await updateRows<PartySessionRow>(
    'party_sessions',
    isFinished
      ? {
          status: 'finished',
          round_loading_deadline_at: null,
          current_round_started_at: null,
          result_started_at: null,
          last_activity_at: nowIso(),
        }
      : {
          status: 'round_loading',
          current_round_index: nextRoundIndex,
          round_loading_deadline_at: getRoundLoadingDeadlineIso(),
          current_round_started_at: null,
          result_started_at: null,
          last_activity_at: nowIso(),
        },
    {
      id: `eq.${freshSession.id}`,
      status: 'eq.round_result',
    }
  );

  if (updated && !isFinished) {
    await clearRoundReadiness(updated.id);
  }

  return updated || getPartySessionByCode(freshSession.join_code);
}

async function recomputePlayerStandings(partyId: string) {
  const players = await getPartyPlayers(partyId);
  const guesses = await getPartyGuesses(partyId);
  const totals = new Map<string, number>();

  players.forEach((player) => {
    totals.set(player.id, 0);
  });

  guesses.forEach((guess) => {
    totals.set(guess.player_id, (totals.get(guess.player_id) || 0) + (guess.points || 0));
  });

  const ranked = rankEntries(
    players.map((player) => ({
      ...player,
      points: totals.get(player.id) || 0,
      submittedAt: player.joined_at,
      joinedAt: player.joined_at,
    }))
  );

  await Promise.all(
    ranked.map((player) =>
      updateRows<PartyPlayerRow>(
        'party_players',
        {
          total_points: player.points,
          current_rank: player.rank,
        },
        { id: `eq.${player.id}` }
      )
    )
  );
}

async function finalizeRoundInternal(session: PartySessionRow) {
  const [locked] = await updateRows<PartySessionRow>(
    'party_sessions',
    { status: 'finalizing' },
    {
      id: `eq.${session.id}`,
      status: 'eq.round_active',
    }
  );

  if (!locked) {
    return;
  }

  const roundIndex = session.current_round_index;
  const photoId = getPartyPhotoId(session, roundIndex);
  const location = photoId ? await getStoredLocation(photoId) : null;
  if (!photoId || !location) {
    throw new Error('ROUND_LOCATION_NOT_FOUND');
  }

  const players = await getPartyPlayers(session.id);
  const existingGuesses = await getPartyGuesses(session.id, roundIndex);
  const guessMap = new Map(existingGuesses.map((guess) => [guess.player_id, guess]));
  const submittedAt = nowIso();

  const finalizedRows = rankEntries(
    players.map((player) => {
      const existing = guessMap.get(player.id);
      const guessCoords =
        existing && existing.guess_lat !== null && existing.guess_lng !== null
          ? ([existing.guess_lat, existing.guess_lng] as [number, number])
          : null;
      const submittedAtForGuess = existing?.submitted_at || submittedAt;
      const distanceKm = guessCoords
        ? haversineDistance(guessCoords[0], guessCoords[1], location.coordinates[0], location.coordinates[1])
        : null;
      const points = guessCoords
        ? calculateScore(distanceKm!, getTimeRemainingForSubmission(session, submittedAtForGuess))
        : 0;

      return {
        party_id: session.id,
        round_index: roundIndex,
        player_id: player.id,
        guess_lat: guessCoords?.[0] ?? null,
        guess_lng: guessCoords?.[1] ?? null,
        submitted_at: submittedAtForGuess,
        distance_km: distanceKm,
        points,
        round_rank: null,
        joinedAt: player.joined_at,
        submittedAt: submittedAtForGuess,
      };
    })
  ).map((entry) => ({
    party_id: entry.party_id,
    round_index: entry.round_index,
    player_id: entry.player_id,
    guess_lat: entry.guess_lat,
    guess_lng: entry.guess_lng,
    submitted_at: entry.submitted_at,
    distance_km: entry.distance_km,
    points: entry.points,
    round_rank: entry.rank,
  }));

  await insertRows<PartyGuessRow>('party_round_guesses', finalizedRows, 'party_id,round_index,player_id');
  await recomputePlayerStandings(session.id);

  await updateRows<PartySessionRow>(
    'party_sessions',
    {
      status: 'round_result',
      round_loading_deadline_at: null,
      result_started_at: nowIso(),
      current_round_started_at: null,
      last_activity_at: nowIso(),
    },
    { id: `eq.${session.id}` }
  );
}

function getReadyPlayerCount(players: PartyPlayerRow[], roundIndex: number) {
  return players.filter((player) => player.round_ready_index === roundIndex).length;
}

async function clearRoundReadiness(partyId: string) {
  await updateRows<PartyPlayerRow>(
    'party_players',
    {
      round_ready_index: -1,
      round_ready_at: null,
    },
    {
      party_id: `eq.${partyId}`,
    }
  );
}

async function activateRoundIfNeeded(session: PartySessionRow) {
  if (session.status !== 'round_countdown') {
    return session;
  }

  if (getRoundCountdownSecondsRemaining(session) > 0) {
    return session;
  }

  const [activated] = await updateRows<PartySessionRow>(
    'party_sessions',
    {
      status: 'round_active',
      result_started_at: null,
      last_activity_at: nowIso(),
    },
    {
      id: `eq.${session.id}`,
      status: 'eq.round_countdown',
    }
  );

  if (activated) {
    return activated;
  }

  return (await getPartySessionByCode(session.join_code)) ?? session;
}

async function startRoundCountdownIfNeeded(session: PartySessionRow) {
  if (session.status !== 'round_loading') {
    return session;
  }

  const players = await getPartyPlayers(session.id);
  if (players.length === 0) {
    return session;
  }

  const allPlayersReady = getReadyPlayerCount(players, session.current_round_index) >= players.length;
  const loadingExpired = getRoundLoadingSecondsRemaining(session) <= 0;

  if (!allPlayersReady && !loadingExpired) {
    return session;
  }

  const [countdown] = await updateRows<PartySessionRow>(
    'party_sessions',
    {
      status: 'round_countdown',
      round_loading_deadline_at: null,
      current_round_started_at: getNextRoundStartTimeIso(),
      result_started_at: null,
      last_activity_at: nowIso(),
    },
    {
      id: `eq.${session.id}`,
      status: 'eq.round_loading',
    }
  );

  if (countdown) {
    return countdown;
  }

  return (await getPartySessionByCode(session.join_code)) ?? session;
}

async function advanceSessionIfNeeded(session: PartySessionRow) {
  const loadingPreparedSession = await startRoundCountdownIfNeeded(session);
  const readySession = await activateRoundIfNeeded(loadingPreparedSession);

  if (readySession.status === 'round_active') {
    const isExpired = getSecondsRemaining(readySession) <= 0;
    const everyoneSubmitted = isExpired ? false : await haveAllPlayersSubmitted(readySession);

    if (isExpired || everyoneSubmitted) {
      await finalizeRoundInternal(readySession);
      return getPartySessionByCode(readySession.join_code);
    }
  }

  return readySession;
}

export async function syncPartySession(session: PartySessionRow) {
  const updated = await advanceSessionIfNeeded(session);
  if (!updated) {
    return session;
  }
  return updated;
}

export async function submitPartyGuess(
  session: PartySessionRow,
  playerKey: string,
  guessCoords: [number, number]
) {
  const freshSession = await syncPartySession(session);
  if (freshSession.status !== 'round_active') {
    throw new Error('ROUND_NOT_ACTIVE');
  }

  if (getSecondsRemaining(freshSession) <= 0) {
    throw new Error('ROUND_EXPIRED');
  }

  const player = await selectSingle<PartyPlayerRow>('party_players', {
    filters: {
      party_id: `eq.${freshSession.id}`,
      player_key: `eq.${playerKey}`,
    },
  });

  if (!player) {
    throw new Error('PLAYER_NOT_FOUND');
  }

  await refreshPlayerPresence(player, true);

  const [guess] = await insertRows<PartyGuessRow>(
    'party_round_guesses',
    [
      {
        party_id: freshSession.id,
        round_index: freshSession.current_round_index,
        player_id: player.id,
        guess_lat: guessCoords[0],
        guess_lng: guessCoords[1],
        submitted_at: nowIso(),
        distance_km: null,
        points: 0,
        round_rank: null,
      },
    ],
    'party_id,round_index,player_id'
  );

  await touchPartyActivity(freshSession.id);

  if (await haveAllPlayersSubmitted(freshSession)) {
    await finalizeRoundInternal(freshSession);
  }

  return guess;
}

export async function markPartyPlayerReadyForRound(
  session: PartySessionRow,
  playerKey: string
) {
  const freshSession = await syncPartySession(session);

  const player = await selectSingle<PartyPlayerRow>('party_players', {
    filters: {
      party_id: `eq.${freshSession.id}`,
      player_key: `eq.${playerKey}`,
    },
  });

  if (!player) {
    throw new Error('PLAYER_NOT_FOUND');
  }

  const refreshedPlayer = await refreshPlayerPresence(player, true);

  if (freshSession.status !== 'round_loading') {
    return freshSession;
  }

  if (refreshedPlayer.round_ready_index !== freshSession.current_round_index) {
    await updateRows<PartyPlayerRow>(
      'party_players',
      {
        round_ready_index: freshSession.current_round_index,
        round_ready_at: nowIso(),
      },
      {
        id: `eq.${refreshedPlayer.id}`,
      }
    );
  }

  await touchPartyActivity(freshSession.id);
  const latestSession = await getPartySessionByCode(freshSession.join_code);
  return latestSession ? syncPartySession(latestSession) : freshSession;
}

async function getPlayerAvatar(row: PartyPlayerRow): Promise<PartyPlayerSummary['avatar']> {
  if (isGuestPlayerKey(row.player_key)) {
    return null;
  }

  try {
    const account = await getUserAccount(row.player_key);
    return account.avatar;
  } catch (error) {
    console.warn('Failed to load party player avatar.', error);
    return null;
  }
}

function mapPlayerSummary(row: PartyPlayerRow, avatar: PartyPlayerSummary['avatar'] = null): PartyPlayerSummary {
  return {
    displayName: row.display_name,
    totalPoints: row.total_points || 0,
    currentRank: row.current_rank || null,
    isConnected: isPlayerConnected(row),
    avatar,
  };
}

async function mapPlayerSummaries(players: PartyPlayerRow[]): Promise<PartyPlayerSummary[]> {
  return Promise.all(
    players.map(async (player) => mapPlayerSummary(player, await getPlayerAvatar(player)))
  );
}

function mapProgressPlayer(
  row: PartyPlayerRow,
  submittedPlayerIds: Set<string>,
  roundIndex: number
): PartyProgressPlayer {
  return {
    displayName: row.display_name,
    isConnected: isPlayerConnected(row),
    isReadyForCurrentRound: row.round_ready_index === roundIndex,
    hasSubmittedCurrentRound: submittedPlayerIds.has(row.id),
  };
}

function buildTopEntries(guesses: PartyGuessRow[], players: PartyPlayerRow[], limit = 5): PartyTopEntry[] {
  const playerById = new Map(players.map((player) => [player.id, player]));
  return guesses
    .sort((a, b) => {
      if ((a.round_rank || 999) !== (b.round_rank || 999)) {
        return (a.round_rank || 999) - (b.round_rank || 999);
      }
      return b.points - a.points;
    })
    .slice(0, limit)
    .map((guess) => ({
      displayName: playerById.get(guess.player_id)?.display_name || 'Player',
      points: guess.points,
      rank: guess.round_rank || null,
    }));
}

function getPlayerResult(guesses: PartyGuessRow[], players: PartyPlayerRow[], playerKey: string) {
  const player = players.find((entry) => entry.player_key === playerKey);
  if (!player) {
    return null;
  }

  const guess = guesses.find((entry) => entry.player_id === player.id);
  if (!guess) {
    return null;
  }

  return {
    roundPoints: guess.points,
    roundRank: guess.round_rank || null,
    totalPoints: player.total_points || 0,
    totalRank: player.current_rank || null,
    guessCoords:
      guess.guess_lat !== null && guess.guess_lng !== null ? ([guess.guess_lat, guess.guess_lng] as [number, number]) : null,
    distanceKm: guess.distance_km,
  };
}

export async function buildPartyStatusResponse(options: {
  joinCode: string;
  role: PartyViewerRole;
  hostUserId?: string;
  playerKey?: string;
}) {
  const session = await getPartySessionByCode(options.joinCode);
  if (!session) {
    throw new Error('PARTY_NOT_FOUND');
  }

  const syncedSession = await syncPartySession(session);
  const players = await getPartyPlayers(syncedSession.id);
  let viewingPlayer =
    options.role === 'player' ? players.find((entry) => entry.player_key === options.playerKey) ?? null : null;

  if (options.role === 'host' && syncedSession.host_user_id !== options.hostUserId) {
    throw new Error('FORBIDDEN');
  }

  if (options.role === 'player') {
    if (!viewingPlayer) {
      throw new Error('PLAYER_NOT_FOUND');
    }
    viewingPlayer = await refreshPlayerPresence(viewingPlayer);
  }

  const payload: PartySessionPayload = {
    joinCode: syncedSession.join_code,
    status: syncedSession.status,
    roundsCount: syncedSession.rounds_count,
    roundTimeSeconds: getSessionRoundTimeSeconds(syncedSession),
    currentRoundIndex: syncedSession.current_round_index,
    secondsRemaining:
      syncedSession.status === 'round_active'
        ? getSecondsRemaining(syncedSession)
        : syncedSession.status === 'round_countdown'
          ? getRoundCountdownSecondsRemaining(syncedSession)
          : syncedSession.status === 'round_loading'
            ? getRoundLoadingSecondsRemaining(syncedSession)
          : 0,
    serverNow: nowIso(),
    roundStartsAt:
      syncedSession.status === 'round_countdown' || syncedSession.status === 'round_active'
        ? syncedSession.current_round_started_at
        : null,
    loadingDeadlineAt: syncedSession.status === 'round_loading' ? syncedSession.round_loading_deadline_at : null,
    readyCount:
      syncedSession.status === 'round_loading' || syncedSession.status === 'round_countdown' || syncedSession.status === 'round_active'
        ? getReadyPlayerCount(players, syncedSession.current_round_index)
        : undefined,
    readyTarget:
      syncedSession.status === 'round_loading' || syncedSession.status === 'round_countdown' || syncedSession.status === 'round_active'
        ? players.length
        : undefined,
    playerIsReadyForCurrentRound: viewingPlayer
      ? viewingPlayer.round_ready_index === syncedSession.current_round_index
      : undefined,
    players: await mapPlayerSummaries(players),
  };

  if (
    ((syncedSession.status === 'round_loading' || syncedSession.status === 'round_countdown' || syncedSession.status === 'round_active') &&
      options.role === 'host') ||
    syncedSession.status === 'round_result'
  ) {
    const photoId = getPartyPhotoId(syncedSession, syncedSession.current_round_index);
    const location = photoId ? await getStoredLocation(photoId) : null;
    if (location) {
      payload.hostRound = {
        photoUrl: getPhotoUrl(location.id),
        photoLabel: location.label || location.id,
        actualCoords: location.coordinates,
      };
    }
  }

  if (
    (syncedSession.status === 'round_loading' ||
      syncedSession.status === 'round_countdown' ||
      syncedSession.status === 'round_active') &&
    viewingPlayer
  ) {
    const guesses = await getPartyGuesses(syncedSession.id, syncedSession.current_round_index);
    payload.playerHasSubmittedCurrentRound = guesses.some((guess) => guess.player_id === viewingPlayer.id);
  }

  if (syncedSession.status === 'round_result') {
    const guesses = await getPartyGuesses(syncedSession.id, syncedSession.current_round_index);
    payload.roundTopFive = buildTopEntries(guesses, players, 5);
    if (options.playerKey) {
      const photoId = getPartyPhotoId(syncedSession, syncedSession.current_round_index);
      const location = photoId ? await getStoredLocation(photoId) : null;
      const self = getPlayerResult(guesses, players, options.playerKey);

      payload.self = self
        ? {
            ...self,
            actualCoords: location?.coordinates ?? null,
            photoLabel: location?.label || location?.id || null,
          }
        : null;
    }
  }

  if (syncedSession.status === 'finished') {
    const topPlayers = [...players]
      .sort((a, b) => {
        if ((a.current_rank || 999) !== (b.current_rank || 999)) {
          return (a.current_rank || 999) - (b.current_rank || 999);
        }
        return b.total_points - a.total_points;
      })
      .slice(0, 5);

    payload.finalStandings = topPlayers.map((player) => ({
      displayName: player.display_name,
      points: player.total_points || 0,
      rank: player.current_rank || null,
    }));

    if (options.playerKey) {
      const player = players.find((entry) => entry.player_key === options.playerKey);
      if (player) {
        payload.self = {
          roundPoints: null,
          roundRank: null,
          totalPoints: player.total_points || 0,
          totalRank: player.current_rank || null,
        };
      }
    }
  }

  return {
    session: syncedSession,
    response: {
      role: options.role,
      session: payload,
    } satisfies PartyStatusResponse,
  };
}

export async function buildPartyProgressResponse(options: {
  joinCode: string;
  role: PartyViewerRole;
  hostUserId?: string;
  playerKey?: string;
}) {
  const session = await getPartySessionByCode(options.joinCode);
  if (!session) {
    throw new Error('PARTY_NOT_FOUND');
  }

  const syncedSession = await syncPartySession(session);
  const players = await getPartyPlayers(syncedSession.id);
  let viewingPlayer =
    options.role === 'player' ? players.find((entry) => entry.player_key === options.playerKey) ?? null : null;

  if (options.role === 'host' && syncedSession.host_user_id !== options.hostUserId) {
    throw new Error('FORBIDDEN');
  }

  if (options.role === 'player') {
    if (!viewingPlayer) {
      throw new Error('PLAYER_NOT_FOUND');
    }
    viewingPlayer = await refreshPlayerPresence(viewingPlayer);
  }

  const payload: PartyProgressResponse['session'] = {
    joinCode: syncedSession.join_code,
    status: syncedSession.status,
    roundsCount: syncedSession.rounds_count,
    roundTimeSeconds: getSessionRoundTimeSeconds(syncedSession),
    currentRoundIndex: syncedSession.current_round_index,
    secondsRemaining:
      syncedSession.status === 'round_active'
        ? getSecondsRemaining(syncedSession)
        : syncedSession.status === 'round_countdown'
          ? getRoundCountdownSecondsRemaining(syncedSession)
          : syncedSession.status === 'round_loading'
            ? getRoundLoadingSecondsRemaining(syncedSession)
          : 0,
    serverNow: nowIso(),
    roundStartsAt:
      syncedSession.status === 'round_countdown' || syncedSession.status === 'round_active'
        ? syncedSession.current_round_started_at
        : null,
    loadingDeadlineAt: syncedSession.status === 'round_loading' ? syncedSession.round_loading_deadline_at : null,
    readyCount:
      syncedSession.status === 'round_loading' || syncedSession.status === 'round_countdown' || syncedSession.status === 'round_active'
        ? getReadyPlayerCount(players, syncedSession.current_round_index)
        : undefined,
    readyTarget:
      syncedSession.status === 'round_loading' || syncedSession.status === 'round_countdown' || syncedSession.status === 'round_active'
        ? players.length
        : undefined,
    playerIsReadyForCurrentRound: viewingPlayer
      ? viewingPlayer.round_ready_index === syncedSession.current_round_index
      : undefined,
    submittedCount: 0,
    totalPlayers: players.length,
  };

  if (
    syncedSession.status === 'round_loading' ||
    syncedSession.status === 'round_countdown' ||
    syncedSession.status === 'round_active' ||
    syncedSession.status === 'round_result' ||
    syncedSession.status === 'finalizing'
  ) {
    const guesses = await getPartyGuesses(syncedSession.id, syncedSession.current_round_index);
    const submittedPlayerIds = new Set(guesses.map((guess) => guess.player_id));

    payload.submittedCount = guesses.length;

    if (options.role === 'host') {
      payload.players = players.map((player) => mapProgressPlayer(player, submittedPlayerIds, syncedSession.current_round_index));
    }

    if (viewingPlayer) {
      payload.playerHasSubmittedCurrentRound = submittedPlayerIds.has(viewingPlayer.id);
    }
  } else {
    if (options.role === 'host') {
      payload.players = players.map((player) => mapProgressPlayer(player, new Set<string>(), syncedSession.current_round_index));
    }

    if (viewingPlayer) {
      payload.playerHasSubmittedCurrentRound = false;
    }
  }

  return {
    session: syncedSession,
    response: {
      role: options.role,
      session: payload,
    } satisfies PartyProgressResponse,
  };
}
