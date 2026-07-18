const SINGLE_PLAYER_CLIENT_TOKEN_KEY = 'ubc_guessr_single_player_client_token';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function getOrCreateSinglePlayerClientToken() {
  if (typeof window === 'undefined') {
    return '';
  }

  const existingToken = window.localStorage.getItem(SINGLE_PLAYER_CLIENT_TOKEN_KEY);
  if (isNonEmptyString(existingToken)) {
    return existingToken;
  }

  const nextToken = `spc_${crypto.randomUUID()}`;
  window.localStorage.setItem(SINGLE_PLAYER_CLIENT_TOKEN_KEY, nextToken);
  return nextToken;
}
