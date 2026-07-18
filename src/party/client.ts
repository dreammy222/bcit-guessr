import { storageKey } from '../config/storage';
import type { PartyProgressResponse, PartyStatusResponse, PartyViewerRole } from './types';

const PARTY_GUEST_TOKEN_KEY = storageKey('party_guest_token');

export function getOrCreateGuestToken() {
  const existing = localStorage.getItem(PARTY_GUEST_TOKEN_KEY);
  if (existing) {
    return existing;
  }

  const token = `guest_${crypto.randomUUID()}`;
  localStorage.setItem(PARTY_GUEST_TOKEN_KEY, token);
  return token;
}

export function setPartyPlayerKey(joinCode: string, playerKey: string) {
  localStorage.setItem(storageKey(`party_player_${joinCode}`), playerKey);
}

export function getPartyPlayerKey(joinCode: string) {
  return localStorage.getItem(storageKey(`party_player_${joinCode}`)) || '';
}

export function setPartyDisplayName(joinCode: string, displayName: string) {
  localStorage.setItem(storageKey(`party_name_${joinCode}`), displayName);
}

export function getPartyDisplayName(joinCode: string) {
  return localStorage.getItem(storageKey(`party_name_${joinCode}`)) || '';
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let payload: Record<string, unknown> | null = null;

  try {
    payload = text ? JSON.parse(text) as Record<string, unknown> : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      (payload && typeof payload.error === 'string' && payload.error) ||
      (text ? text.slice(0, 300) : 'Request failed');
    throw new Error(message);
  }

  return (payload as T) ?? ({} as T);
}

function buildPartyApiUrl(
  action: string,
  query?: Record<string, string | null | undefined>
) {
  const params = new URLSearchParams({ action });

  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (typeof value === 'string') {
        params.set(key, value);
      }
    });
  }

  return `/api/party?${params.toString()}`;
}

export async function createParty(
  roundsCount: number,
  roundTimeSeconds: number,
  hostDisplayName: string,
  token?: string | null
) {
  const response = await fetch(buildPartyApiUrl('create'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ roundsCount, roundTimeSeconds, hostDisplayName }),
  });

  return readJson<{ joinCode: string }>(response);
}

export async function joinParty(joinCode: string, displayName: string, token?: string | null) {
  const response = await fetch(buildPartyApiUrl('join'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      joinCode,
      displayName,
      guestToken: token ? undefined : getOrCreateGuestToken(),
    }),
  });

  return readJson<{ joinCode: string; playerKey: string; displayName: string }>(response);
}

export async function startParty(joinCode: string, token?: string | null) {
  const response = await fetch(buildPartyApiUrl('start'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ joinCode }),
  });

  return readJson<{ success: boolean }>(response);
}

export async function advanceParty(joinCode: string, token?: string | null) {
  const response = await fetch(buildPartyApiUrl('next'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ joinCode }),
  });

  return readJson<{ success: boolean }>(response);
}

export async function endParty(joinCode: string, token?: string | null) {
  const response = await fetch(buildPartyApiUrl('end'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ joinCode }),
  });

  return readJson<{ success: boolean }>(response);
}

export async function submitPartyGuess(
  joinCode: string,
  guessCoords: [number, number],
  playerKey: string,
  token?: string | null
) {
  const response = await fetch(buildPartyApiUrl('submit'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      joinCode,
      guessCoords,
      playerKey,
    }),
  });

  return readJson<{ success: boolean }>(response);
}

export async function markPartyRoundReady(
  joinCode: string,
  playerKey: string,
  token?: string | null
) {
  const response = await fetch(buildPartyApiUrl('ready'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      joinCode,
      playerKey,
    }),
  });

  return readJson<{ success: boolean }>(response);
}

export async function fetchPartyStatus(
  joinCode: string,
  role: PartyViewerRole,
  playerKey?: string,
  token?: string | null
) {
  const response = await fetch(buildPartyApiUrl('status', {
    joinCode,
    role,
    ...(playerKey ? { playerKey } : {}),
  }), {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  return readJson<PartyStatusResponse>(response);
}

export async function fetchPartyProgress(
  joinCode: string,
  role: PartyViewerRole,
  playerKey?: string,
  token?: string | null
) {
  const response = await fetch(buildPartyApiUrl('progress', {
    joinCode,
    role,
    ...(playerKey ? { playerKey } : {}),
  }), {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  return readJson<PartyProgressResponse>(response);
}
