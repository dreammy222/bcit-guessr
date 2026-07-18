import { SCHOOL } from '../src/config/school.js';
import {
  RATE_LIMITS,
  buildRateLimitExceededResponse,
  buildRateLimitHeaders,
  checkRateLimit,
} from './_lib/security.js';
import { getOptionalClerkUserFromRequest } from './_lib/clerk.js';
import { listStoredLocations } from './_lib/awsLocations.js';
import { createSinglePlayerSession } from './_lib/singlePlayer.js';
import { isValidSinglePlayerClientToken } from './_lib/validation.js';

export const config = {
  runtime: 'edge',
};

const ROUNDS_PER_GAME = SCHOOL.scoring.roundsPerGame;

function sampleWithoutReplacement<T>(items: T[], count: number) {
  const sampleSize = Math.min(count, items.length);
  const pool = [...items];

  for (let index = 0; index < sampleSize; index += 1) {
    const swapIndex = index + Math.floor(Math.random() * (pool.length - index));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }

  return pool.slice(0, sampleSize);
}

export default async function handler(request: Request) {
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const clientTokenHeader = request.headers.get('x-single-player-client');
  const clientToken = isValidSinglePlayerClientToken(clientTokenHeader) ? clientTokenHeader : null;

  const clientRateLimit = await checkRateLimit(request, RATE_LIMITS.singlePlayerStart, {
    includeIp: !clientToken,
    keyParts: clientToken ? [clientToken] : undefined,
  });
  if (!clientRateLimit.allowed) {
    return buildRateLimitExceededResponse(clientRateLimit, 'Too many game starts. Please wait a moment and try again.');
  }

  const ipRateLimit = await checkRateLimit(request, RATE_LIMITS.singlePlayerStartIp);
  if (!ipRateLimit.allowed) {
    return buildRateLimitExceededResponse(ipRateLimit, 'Too many game starts from this network. Please wait a moment.');
  }

  try {
    const user = await getOptionalClerkUserFromRequest(request);
    const storedLocations = await listStoredLocations();
    const selectedLocations = sampleWithoutReplacement(storedLocations, ROUNDS_PER_GAME);

    if (selectedLocations.length === 0) {
      return new Response(JSON.stringify({ error: 'No playable locations available' }), {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          ...buildRateLimitHeaders(clientRateLimit),
        },
      });
    }

    const gameSession = await createSinglePlayerSession(
      selectedLocations.map((item) => ({
        id: item.id,
        filename: `${item.id}.JPG`,
        label: item.label,
      })),
      clientToken,
      user?.userId ?? null,
    );
    const locations = selectedLocations.map((item) => ({
      id: item.id,
      filename: `${item.id}.JPG`,
      label: item.label,
      coordinates: null as [number, number] | null,
    }));

    return new Response(JSON.stringify({
      gameSessionId: gameSession.id,
      leaderboardEligible: Boolean(gameSession.ownerUserId),
      locations,
    }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, max-age=0',
          ...buildRateLimitHeaders(clientRateLimit),
        }
    });
    
  } catch (error: any) {
    console.error('Error fetching locations [Detailed]:', error.message, error.stack);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...buildRateLimitHeaders(clientRateLimit),
      }
    });
  }
}
