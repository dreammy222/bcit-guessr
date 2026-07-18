import { haversineDistance, calculateScore, ROUND_TIMER_SECONDS } from './_lib/gameMath.js';
import {
  RATE_LIMITS,
  buildRateLimitExceededResponse,
  buildRateLimitHeaders,
  checkRateLimit,
} from './_lib/security.js';
import { getStoredLocation } from './_lib/awsLocations.js';
import {
  getSinglePlayerActivePhoto,
  getSinglePlayerCurrentRoundIndex,
  getSinglePlayerRoundDeadlineAt,
  getSinglePlayerSession,
  type SinglePlayerSessionRecord,
  saveSinglePlayerSession,
  tryAcquireSinglePlayerSubmitLock,
} from './_lib/singlePlayer.js';
import {
  isValidSinglePlayerClientToken,
  isValidSinglePlayerGameSessionId,
  parseGuessCoords,
} from './_lib/validation.js';

export const config = {
  runtime: 'edge',
};

const ROUND_IMAGE_LOAD_GRACE_SECONDS = 8;

function getAction(request: Request) {
  return new URL(request.url).searchParams.get('action')?.trim().toLowerCase() ?? 'submit';
}

function getRoundTimeRemaining(startedAt: number | null) {
  if (startedAt === null) {
    return 0;
  }

  const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
  return Math.max(0, ROUND_TIMER_SECONDS - elapsedSeconds);
}

async function getVerifiedSession(
  request: Request,
  gameSessionId: string,
  sessionRateLimitHeaders: Record<string, string>,
) {
  const gameSession = await getSinglePlayerSession(gameSessionId);
  if (!gameSession) {
    return {
      response: new Response(JSON.stringify({ error: 'Game session expired. Please start a new game.' }), {
        status: 409,
        headers: {
          'Content-Type': 'application/json',
          ...sessionRateLimitHeaders,
        },
      }),
    };
  }

  const clientTokenHeader = request.headers.get('x-single-player-client');
  if (!isValidSinglePlayerClientToken(clientTokenHeader) || gameSession.clientToken !== clientTokenHeader) {
    return {
      response: new Response(JSON.stringify({ error: 'Game session could not be verified. Please start a new game.' }), {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          ...sessionRateLimitHeaders,
        },
      }),
    };
  }

  return { gameSession };
}

async function handleBeginRound(gameSession: SinglePlayerSessionRecord, sessionRateLimitHeaders: Record<string, string>) {
  if (getSinglePlayerCurrentRoundIndex(gameSession) >= gameSession.selectedPhotos.length) {
    return new Response(JSON.stringify({ error: 'This game has already finished.' }), {
      status: 409,
      headers: {
        'Content-Type': 'application/json',
        ...sessionRateLimitHeaders,
      },
    });
  }

  if (gameSession.status === 'round-result' || gameSession.status === 'finished') {
    return new Response(JSON.stringify({ error: 'The active round cannot be started.' }), {
      status: 409,
      headers: {
        'Content-Type': 'application/json',
        ...sessionRateLimitHeaders,
      },
    });
  }

  if (gameSession.status === 'playing' && gameSession.currentRoundStartedAt !== null) {
    const serverNow = Date.now();

    return new Response(JSON.stringify({
      serverNow,
      roundDeadlineAt: getSinglePlayerRoundDeadlineAt(gameSession, ROUND_TIMER_SECONDS),
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...sessionRateLimitHeaders,
      },
    });
  }

  const preparedAt = gameSession.currentRoundPreparedAt ?? Date.now();
  const startCapAt = preparedAt + ROUND_IMAGE_LOAD_GRACE_SECONDS * 1000;
  const now = Date.now();
  const startedAt = Math.min(now, startCapAt);
  const updatedSession: SinglePlayerSessionRecord = {
    ...gameSession,
    status: 'playing',
    currentRoundStartedAt: startedAt,
  };

  await saveSinglePlayerSession(updatedSession);

  const serverNow = Date.now();

  return new Response(JSON.stringify({
    serverNow,
    roundDeadlineAt: getSinglePlayerRoundDeadlineAt(updatedSession, ROUND_TIMER_SECONDS),
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ...sessionRateLimitHeaders,
    },
  });
}

async function handleSubmit(
  gameSession: SinglePlayerSessionRecord,
  guessCoords: unknown,
  sessionRateLimitHeaders: Record<string, string>
) {
  const parsedGuessCoords = guessCoords === null ? null : parseGuessCoords(guessCoords);

  if (guessCoords !== null && parsedGuessCoords === null) {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  if (gameSession.status === 'loading') {
    return new Response(JSON.stringify({ error: 'This round is still loading.' }), {
      status: 409,
      headers: {
        'Content-Type': 'application/json',
        ...sessionRateLimitHeaders,
      },
    });
  }

  if (gameSession.status !== 'playing') {
    return new Response(JSON.stringify({ error: 'This round is no longer accepting guesses.' }), {
      status: 409,
      headers: {
        'Content-Type': 'application/json',
        ...sessionRateLimitHeaders,
      },
    });
  }

  const activePhoto = getSinglePlayerActivePhoto(gameSession);
  if (!activePhoto) {
    return new Response(JSON.stringify({ error: 'No active round found for this game session.' }), {
      status: 409,
      headers: {
        'Content-Type': 'application/json',
        ...sessionRateLimitHeaders,
      },
    });
  }

  const submitLockAcquired = await tryAcquireSinglePlayerSubmitLock(
    gameSession.id,
    getSinglePlayerCurrentRoundIndex(gameSession),
  );
  if (!submitLockAcquired) {
    return new Response(JSON.stringify({ error: 'This round is already being scored. Please try again.' }), {
      status: 409,
      headers: {
        'Content-Type': 'application/json',
        ...sessionRateLimitHeaders,
      },
    });
  }

  const photo = await getStoredLocation(activePhoto.id);
  if (!photo) {
    return new Response(JSON.stringify({ error: 'Photo location not found in database' }), {
      status: 404,
      headers: {
        'Content-Type': 'application/json',
        ...sessionRateLimitHeaders,
      },
    });
  }

  const timeRemaining = getRoundTimeRemaining(gameSession.currentRoundStartedAt);
  let distanceKm: number | null = null;
  let points = 0;

  if (parsedGuessCoords) {
    distanceKm = haversineDistance(
      parsedGuessCoords[0],
      parsedGuessCoords[1],
      photo.coordinates[0],
      photo.coordinates[1],
    );
    points = calculateScore(distanceKm, timeRemaining);
  }

  const result = {
    photoId: activePhoto.id,
    photoLabel: activePhoto.label ?? photo.label ?? activePhoto.id,
    guessCoords: parsedGuessCoords,
    actualCoords: photo.coordinates,
    distanceKm,
    timeRemaining,
    points,
    submittedAt: Date.now(),
  };

  const nextRoundResults = [...gameSession.roundResults, result];
  const nextRoundIndex = nextRoundResults.length;
  const isGameFinished = nextRoundIndex >= gameSession.selectedPhotos.length;
  const updatedSession: SinglePlayerSessionRecord = {
    ...gameSession,
    status: isGameFinished ? 'finished' : 'round-result',
    currentRoundPreparedAt: null,
    currentRoundStartedAt: null,
    roundResults: nextRoundResults,
    totalScore: gameSession.totalScore + points,
  };

  await saveSinglePlayerSession(updatedSession);

  return new Response(JSON.stringify({
    isGameFinished,
    result,
    totalScore: updatedSession.totalScore,
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ...sessionRateLimitHeaders,
    },
  });
}

async function handleNextRound(gameSession: SinglePlayerSessionRecord, sessionRateLimitHeaders: Record<string, string>) {
  if (gameSession.status !== 'round-result') {
    return new Response(JSON.stringify({ error: 'The next round is not available yet.' }), {
      status: 409,
      headers: {
        'Content-Type': 'application/json',
        ...sessionRateLimitHeaders,
      },
    });
  }

  if (getSinglePlayerCurrentRoundIndex(gameSession) >= gameSession.selectedPhotos.length) {
    return new Response(JSON.stringify({ error: 'This game has already finished.' }), {
      status: 409,
      headers: {
        'Content-Type': 'application/json',
        ...sessionRateLimitHeaders,
      },
    });
  }

  const updatedSession: SinglePlayerSessionRecord = {
    ...gameSession,
    status: 'loading',
    currentRoundPreparedAt: Date.now(),
    currentRoundStartedAt: null,
  };

  await saveSinglePlayerSession(updatedSession);

  return new Response(JSON.stringify({
    ok: true,
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ...sessionRateLimitHeaders,
    },
  });
}

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json().catch(() => null);
    const gameSessionId =
      body && typeof body === 'object' && 'gameSessionId' in body
        ? (body as { gameSessionId?: unknown }).gameSessionId
        : null;

    if (!isValidSinglePlayerGameSessionId(gameSessionId)) {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    const preflightSession = await getVerifiedSession(request, gameSessionId, {});
    if ('response' in preflightSession) {
      return preflightSession.response;
    }

    const sessionRateLimit = await checkRateLimit(request, RATE_LIMITS.scoreSession, {
      includeIp: false,
      keyParts: [gameSessionId],
    });
    if (!sessionRateLimit.allowed) {
      return buildRateLimitExceededResponse(
        sessionRateLimit,
        'Too many round actions submitted for this game session. Please start a new game.'
      );
    }

    const ipRateLimit = await checkRateLimit(request, RATE_LIMITS.scoreIp);
    if (!ipRateLimit.allowed) {
      return buildRateLimitExceededResponse(
        ipRateLimit,
        'Too many scoring requests from this network. Please wait a moment and try again.'
      );
    }

    const action = getAction(request);
    const sessionRateLimitHeaders = buildRateLimitHeaders(sessionRateLimit);

    if (action === 'begin') {
      return handleBeginRound(preflightSession.gameSession, sessionRateLimitHeaders);
    }

    if (action === 'next') {
      return handleNextRound(preflightSession.gameSession, sessionRateLimitHeaders);
    }

    return handleSubmit(
      preflightSession.gameSession,
      body && typeof body === 'object' && 'guessCoords' in body
        ? (body as { guessCoords?: unknown }).guessCoords
        : undefined,
      sessionRateLimitHeaders,
    );
  } catch (error) {
    console.error('Error scoring guess:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}
