import type { PartyViewerRole } from '../../src/party/types';

export const MAX_DISPLAY_NAME_LENGTH = 40;
export const MAX_LEADERBOARD_USERNAME_LENGTH = 40;

const JOIN_CODE_PATTERN = /^\d{6}$/;
const PARTY_ROLE_PATTERN = /^(host|player)$/;
const PLAYER_KEY_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const GUEST_TOKEN_PATTERN = /^guest_[0-9a-f-]{36}$/i;
const PHOTO_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const SINGLE_PLAYER_CLIENT_TOKEN_PATTERN = /^spc_[0-9a-f-]{36}$/i;
const SINGLE_PLAYER_GAME_SESSION_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeDisplayName(value: unknown, fallback = '') {
  if (typeof value !== 'string') {
    return fallback;
  }

  return value.trim().slice(0, MAX_DISPLAY_NAME_LENGTH);
}

export function isValidDisplayName(value: string) {
  return value.length > 0 && value.length <= MAX_DISPLAY_NAME_LENGTH;
}

export function normalizeLeaderboardUsername(value: unknown) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().slice(0, MAX_LEADERBOARD_USERNAME_LENGTH);
}

export function isValidJoinCode(value: string) {
  return JOIN_CODE_PATTERN.test(value);
}

export function isValidPartyRole(value: string): value is PartyViewerRole {
  return PARTY_ROLE_PATTERN.test(value);
}

export function isValidPlayerKey(value: string) {
  return PLAYER_KEY_PATTERN.test(value);
}

export function isValidGuestToken(value: string) {
  return GUEST_TOKEN_PATTERN.test(value);
}

export function isValidPhotoId(value: unknown): value is string {
  return typeof value === 'string' && PHOTO_ID_PATTERN.test(value);
}

export function isValidSinglePlayerClientToken(value: unknown): value is string {
  return typeof value === 'string' && SINGLE_PLAYER_CLIENT_TOKEN_PATTERN.test(value);
}

export function isValidSinglePlayerGameSessionId(value: unknown): value is string {
  return typeof value === 'string' && SINGLE_PLAYER_GAME_SESSION_PATTERN.test(value);
}

export function parseGuessCoords(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length !== 2) {
    return null;
  }

  const lat = Number(value[0]);
  const lng = Number(value[1]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }

  return [lat, lng];
}

export function parseTimeRemaining(value: unknown, maxSeconds: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > maxSeconds) {
    return null;
  }

  return parsed;
}
