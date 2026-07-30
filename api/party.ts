import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getOptionalClerkUser, requireClerkUser } from './_lib/clerk.js';
import type { PartyViewerRole } from '../src/party/types.js';
import {
  advancePartySession,
  buildPartyProgressResponse,
  buildPartyStatusResponse,
  createPartySession,
  endPartySession,
  getPartySessionByCode,
  joinPartySession,
  markPartyPlayerReadyForRound,
  startPartySession,
  submitPartyGuess,
} from './_lib/party.js';
import {
  RATE_LIMITS,
  applyRateLimitHeaders,
  checkRateLimit,
  sendRateLimitExceeded,
} from './_lib/security.js';
import {
  isValidDisplayName,
  isValidGuestToken,
  isValidJoinCode,
  isValidPartyRole,
  isValidPlayerKey,
  normalizeDisplayName,
  parseGuessCoords,
} from './_lib/validation.js';

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

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const rateLimit = await checkRateLimit(req, RATE_LIMITS.partyCreate);
  if (!rateLimit.allowed) {
    return sendRateLimitExceeded(res, rateLimit);
  }

  applyRateLimitHeaders(res, rateLimit);

  try {
    const { userId } = await requireClerkUser(req);
    const roundsCountRaw = Number(req.body?.roundsCount ?? 5);
    const roundsCount = Number.isFinite(roundsCountRaw) ? roundsCountRaw : 5;
    const roundTimeSecondsRaw = Number(req.body?.roundTimeSeconds ?? 30);
    const roundTimeSeconds = Number.isFinite(roundTimeSecondsRaw) ? roundTimeSecondsRaw : 30;
    const hostDisplayName = normalizeDisplayName(req.body?.hostDisplayName, 'Host') || 'Host';
    const session = await createPartySession(userId, hostDisplayName, roundsCount, roundTimeSeconds);
    return res.status(200).json({ joinCode: session.join_code });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return res.status(401).json({ error: 'Sign in required to host a party.' });
    }

    if (error instanceof Error && error.message === 'ROUND_TIME_TOO_SHORT') {
      return res.status(400).json({ error: 'Time too short' });
    }

    console.error('Party create error:', error);
    return res.status(500).json({ error: 'Failed to create party.' });
  }
}

async function handleJoin(req: VercelRequest, res: VercelResponse) {
  const rateLimit = await checkRateLimit(req, RATE_LIMITS.partyJoin);
  if (!rateLimit.allowed) {
    return sendRateLimitExceeded(res, rateLimit);
  }

  applyRateLimitHeaders(res, rateLimit);

  try {
    const authUser = await getOptionalClerkUser(req);
    const joinCode = String(req.body?.joinCode || '').trim();
    const displayName = normalizeDisplayName(req.body?.displayName);
    const guestToken = String(req.body?.guestToken || '').trim();

    if (!isValidJoinCode(joinCode) || !isValidDisplayName(displayName)) {
      return res.status(400).json({ error: 'Enter a valid code and username.' });
    }

    if (!authUser && !isValidGuestToken(guestToken)) {
      return res.status(400).json({ error: 'Guest token missing.' });
    }

    const session = await getPartySessionByCode(joinCode);
    if (!session) {
      return res.status(404).json({ error: 'Party not found.' });
    }

    const playerKey = authUser?.userId || guestToken;
    if (!playerKey) {
      return res.status(400).json({ error: 'Guest token missing.' });
    }

    const player = await joinPartySession(session, playerKey, displayName);
    return res.status(200).json({
      joinCode: session.join_code,
      playerKey,
      displayName: player.display_name,
    });
  } catch (error) {
    if (!(error instanceof Error)) {
      return res.status(500).json({ error: 'Failed to join party.' });
    }

    const errorMap: Record<string, [number, string]> = {
      PARTY_ALREADY_STARTED: [409, 'That party has already started.'],
      PARTY_FULL: [409, 'That party is full.'],
      USERNAME_TAKEN: [409, 'That username is already taken in this party.'],
      PLAYER_NAME_MISMATCH: [409, 'Rejoin with your original username for this party.'],
    };

    if (errorMap[error.message]) {
      const [status, message] = errorMap[error.message];
      return res.status(status).json({ error: message });
    }

    console.error('Party join error:', error);
    return res.status(500).json({ error: 'Failed to join party.' });
  }
}

async function handleControl(
  req: VercelRequest,
  res: VercelResponse,
  mode: 'start' | 'next' | 'end'
) {
  const rateLimit = await checkRateLimit(req, RATE_LIMITS.partyControl);
  if (!rateLimit.allowed) {
    return sendRateLimitExceeded(res, rateLimit);
  }

  applyRateLimitHeaders(res, rateLimit);

  try {
    const { userId } = await requireClerkUser(req);
    const joinCode = String(req.body?.joinCode || '').trim();

    if (!isValidJoinCode(joinCode)) {
      return res.status(400).json({ error: 'Party not found.' });
    }

    const session = await getPartySessionByCode(joinCode);
    if (!session) {
      return res.status(404).json({ error: 'Party not found.' });
    }

    if (mode === 'start') {
      await startPartySession(session, userId);
    } else if (mode === 'next') {
      await advancePartySession(session, userId);
    } else {
      await endPartySession(session, userId);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    if (!(error instanceof Error)) {
      return res.status(500).json({
        error:
          mode === 'start'
            ? 'Failed to start party.'
            : mode === 'next'
              ? 'Failed to continue party.'
              : 'Failed to end party.',
      });
    }

    const errorMaps: Record<'start' | 'next' | 'end', Record<string, [number, string]>> = {
      start: {
        UNAUTHORIZED: [401, 'Sign in required.'],
        FORBIDDEN: [403, 'Only the host can start the party.'],
        INVALID_PARTY_STATE: [409, 'Party is not in the lobby.'],
        NO_PLAYERS: [409, 'At least one player must join before starting.'],
      },
      next: {
        UNAUTHORIZED: [401, 'Sign in required.'],
        FORBIDDEN: [403, 'Only the host can move to the next round.'],
        INVALID_PARTY_STATE: [409, 'That party is not ready to continue yet.'],
      },
      end: {
        UNAUTHORIZED: [401, 'Sign in required.'],
        FORBIDDEN: [403, 'Only the host can end the party.'],
        INVALID_PARTY_STATE: [409, 'That party can no longer be ended from this screen.'],
      },
    };

    if (errorMaps[mode][error.message]) {
      const [status, message] = errorMaps[mode][error.message];
      return res.status(status).json({ error: message });
    }

    console.error(`Party ${mode} error:`, error);
    return res.status(500).json({
      error:
        mode === 'start'
          ? 'Failed to start party.'
          : mode === 'next'
            ? 'Failed to continue party.'
            : 'Failed to end party.',
    });
  }
}

async function handleSubmit(req: VercelRequest, res: VercelResponse) {
  const joinCode = String(req.body?.joinCode || '').trim();
  const rateLimit = await checkRateLimit(req, RATE_LIMITS.partySubmit, {
    keyParts: [joinCode],
  });

  if (!rateLimit.allowed) {
    return sendRateLimitExceeded(res, rateLimit);
  }

  applyRateLimitHeaders(res, rateLimit);

  try {
    const authUser = await getOptionalClerkUser(req);
    const playerKey = authUser?.userId || String(req.body?.playerKey || '').trim();
    const guessCoords = parseGuessCoords(req.body?.guessCoords);

    if (!isValidJoinCode(joinCode) || !guessCoords || (!authUser && !isValidPlayerKey(playerKey))) {
      return res.status(400).json({ error: 'Invalid guess payload.' });
    }

    const session = await getPartySessionByCode(joinCode);
    if (!session) {
      return res.status(404).json({ error: 'Party not found.' });
    }

    await submitPartyGuess(session, playerKey, guessCoords);
    return res.status(200).json({ success: true });
  } catch (error) {
    if (!(error instanceof Error)) {
      return res.status(500).json({ error: 'Failed to submit guess.' });
    }

    const errorMap: Record<string, [number, string]> = {
      ROUND_NOT_ACTIVE: [409, 'This round is no longer accepting guesses.'],
      ROUND_EXPIRED: [409, 'Time is up for this round.'],
      PLAYER_NOT_FOUND: [404, 'Player not found in party.'],
    };

    if (errorMap[error.message]) {
      const [status, message] = errorMap[error.message];
      return res.status(status).json({ error: message });
    }

    console.error('Party submit error:', error);
    return res.status(500).json({ error: 'Failed to submit guess.' });
  }
}

async function handleReady(req: VercelRequest, res: VercelResponse) {
  const joinCode = String(req.body?.joinCode || '').trim();
  const rateLimit = await checkRateLimit(req, RATE_LIMITS.partyReady, {
    keyParts: [joinCode],
  });

  if (!rateLimit.allowed) {
    return sendRateLimitExceeded(res, rateLimit);
  }

  applyRateLimitHeaders(res, rateLimit);

  try {
    const authUser = await getOptionalClerkUser(req);
    const playerKey = authUser?.userId || String(req.body?.playerKey || '').trim();

    if (!isValidJoinCode(joinCode) || (!authUser && !isValidPlayerKey(playerKey))) {
      return res.status(400).json({ error: 'Invalid ready payload.' });
    }

    const session = await getPartySessionByCode(joinCode);
    if (!session) {
      return res.status(404).json({ error: 'Party not found.' });
    }

    await markPartyPlayerReadyForRound(session, playerKey);
    return res.status(200).json({ success: true });
  } catch (error) {
    if (!(error instanceof Error)) {
      return res.status(500).json({ error: 'Failed to mark round ready.' });
    }

    const errorMap: Record<string, [number, string]> = {
      PLAYER_NOT_FOUND: [404, 'Player not found in party.'],
    };

    if (errorMap[error.message]) {
      const [status, message] = errorMap[error.message];
      return res.status(status).json({ error: message });
    }

    console.error('Party ready error:', error);
    return res.status(500).json({ error: 'Failed to mark round ready.' });
  }
}

async function handleStatus(req: VercelRequest, res: VercelResponse) {
  const joinCode = String(req.query.joinCode || '').trim();
  const role = String(req.query.role || '').trim();
  const playerKey = String(req.query.playerKey || '').trim();
  const rateLimit = await checkRateLimit(req, RATE_LIMITS.partyStatus, {
    keyParts: [joinCode],
  });

  if (!rateLimit.allowed) {
    return sendRateLimitExceeded(res, rateLimit);
  }

  applyRateLimitHeaders(res, rateLimit);

  if (!isValidJoinCode(joinCode) || !isValidPartyRole(role)) {
    return res.status(400).json({ error: 'Invalid party request.' });
  }

  if (role === 'player' && !isValidPlayerKey(playerKey)) {
    return res.status(400).json({ error: 'Player key missing.' });
  }

  const viewerRole: PartyViewerRole = role;

  try {
    const authUser = await getOptionalClerkUser(req);
    const { response } = await buildPartyStatusResponse({
      joinCode,
      role: viewerRole,
      hostUserId: authUser?.userId,
      playerKey,
    });

    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(200).json(response);
  } catch (error) {
    if (!(error instanceof Error)) {
      return res.status(500).json({ error: 'Failed to load party.' });
    }

    const errorMap: Record<string, [number, string]> = {
      PARTY_NOT_FOUND: [404, 'Party not found.'],
      FORBIDDEN: [403, 'You do not have access to this party view.'],
      PLAYER_NOT_FOUND: [404, 'Player not found in this party.'],
    };

    if (errorMap[error.message]) {
      const [status, message] = errorMap[error.message];
      return res.status(status).json({ error: message });
    }

    console.error('Party status error:', error);
    return res.status(500).json({ error: 'Failed to load party.' });
  }
}

async function handleProgress(req: VercelRequest, res: VercelResponse) {
  const joinCode = String(req.query.joinCode || '').trim();
  const role = String(req.query.role || '').trim();
  const playerKey = String(req.query.playerKey || '').trim();
  const rateLimit = await checkRateLimit(req, RATE_LIMITS.partyProgress, {
    keyParts: [joinCode],
  });

  if (!rateLimit.allowed) {
    return sendRateLimitExceeded(res, rateLimit);
  }

  applyRateLimitHeaders(res, rateLimit);

  if (!isValidJoinCode(joinCode) || !isValidPartyRole(role)) {
    return res.status(400).json({ error: 'Invalid party request.' });
  }

  if (role === 'player' && !isValidPlayerKey(playerKey)) {
    return res.status(400).json({ error: 'Player key missing.' });
  }

  const viewerRole: PartyViewerRole = role;

  try {
    const authUser = await getOptionalClerkUser(req);
    const { response } = await buildPartyProgressResponse({
      joinCode,
      role: viewerRole,
      hostUserId: authUser?.userId,
      playerKey,
    });

    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(200).json(response);
  } catch (error) {
    if (!(error instanceof Error)) {
      return res.status(500).json({ error: 'Failed to load party progress.' });
    }

    const errorMap: Record<string, [number, string]> = {
      PARTY_NOT_FOUND: [404, 'Party not found.'],
      FORBIDDEN: [403, 'You do not have access to this party view.'],
      PLAYER_NOT_FOUND: [404, 'Player not found in this party.'],
    };

    if (errorMap[error.message]) {
      const [status, message] = errorMap[error.message];
      return res.status(status).json({ error: message });
    }

    console.error('Party progress error:', error);
    return res.status(500).json({ error: 'Failed to load party progress.' });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = getAction(req);

  if (req.method === 'GET') {
    if (action === 'status') {
      return handleStatus(req, res);
    }

    if (action === 'progress') {
      return handleProgress(req, res);
    }

    return res.status(400).json({ error: 'Unsupported party action.' });
  }

  if (req.method === 'POST') {
    if (action === 'create') {
      return handleCreate(req, res);
    }

    if (action === 'join') {
      return handleJoin(req, res);
    }

    if (action === 'start' || action === 'next' || action === 'end') {
      return handleControl(req, res, action);
    }

    if (action === 'submit') {
      return handleSubmit(req, res);
    }

    if (action === 'ready') {
      return handleReady(req, res);
    }

    return res.status(400).json({ error: 'Unsupported party action.' });
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
