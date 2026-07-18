import * as jose from 'jose';
import type { VercelRequest } from '@vercel/node';

const DEFAULT_CLERK_ISSUER = 'https://crisp-mudfish-45.clerk.accounts.dev';

function cleanEnvValue(value: string | undefined) {
  return value?.trim().replace(/^['"]|['"]$/g, '') ?? '';
}

function normalizeClerkIssuer(value: string) {
  const issuer = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return issuer.replace(/\/+$/, '');
}

function getIssuerFromJwksUrl(value: string) {
  if (!value) {
    return '';
  }

  try {
    const url = new URL(value);
    const jwksPath = '/.well-known/jwks.json';
    if (!url.pathname.endsWith(jwksPath)) {
      return '';
    }

    url.pathname = url.pathname.slice(0, -jwksPath.length) || '/';
    url.search = '';
    url.hash = '';
    return normalizeClerkIssuer(url.toString());
  } catch {
    return '';
  }
}

const configuredJwksUrl = cleanEnvValue(process.env.CLERK_JWKS_URL);
const CLERK_ISSUER = normalizeClerkIssuer(
  cleanEnvValue(process.env.CLERK_ISSUER) ||
    cleanEnvValue(process.env.CLERK_FAPI) ||
    cleanEnvValue(process.env.CLERK_FRONTEND_API) ||
    getIssuerFromJwksUrl(configuredJwksUrl) ||
    DEFAULT_CLERK_ISSUER,
);
const jwksUrl = new URL(configuredJwksUrl || `${CLERK_ISSUER}/.well-known/jwks.json`);
const JWKS = jose.createRemoteJWKSet(jwksUrl);

export interface ClerkUser {
  userId: string;
}

type HeaderSource = Headers | VercelRequest['headers'];

function getAuthorizationHeader(headers: HeaderSource) {
  if (headers instanceof Headers) {
    return headers.get('authorization');
  }

  const rawValue = headers.authorization;
  if (Array.isArray(rawValue)) {
    return rawValue[0] ?? null;
  }

  return rawValue ?? null;
}

async function getOptionalClerkUserFromHeaders(headers: HeaderSource): Promise<ClerkUser | null> {
  const authHeader = getAuthorizationHeader(headers);
  const token = authHeader?.split('Bearer ')[1];

  if (!token) {
    return null;
  }

  try {
    const { payload } = await jose.jwtVerify(token, JWKS, {
      issuer: CLERK_ISSUER,
    });
    if (!payload.sub) {
      return null;
    }

    return { userId: payload.sub };
  } catch {
    return null;
  }
}

export async function getOptionalClerkUser(req: VercelRequest): Promise<ClerkUser | null> {
  return getOptionalClerkUserFromHeaders(req.headers);
}

export async function getOptionalClerkUserFromRequest(req: Request): Promise<ClerkUser | null> {
  return getOptionalClerkUserFromHeaders(req.headers);
}

export async function requireClerkUser(req: VercelRequest): Promise<ClerkUser> {
  const user = await getOptionalClerkUser(req);
  if (!user) {
    throw new Error('UNAUTHORIZED');
  }
  return user;
}
