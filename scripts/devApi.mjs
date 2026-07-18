/**
 * Local development API server — runs the real Vercel serverless handlers in
 * a plain Node HTTP server so the game is fully playable with zero cloud
 * backends (locations fall back to the local JSON, sessions to in-memory
 * stores, rate limiting to memory).
 *
 *   npm run dev:api          # serves http://localhost:3001/api/*
 *   npm run dev              # vite proxies /api here when VITE_DEV_API_PROXY is set
 *
 * Auth-gated endpoints (account, avatar) will 401 without a real Clerk setup —
 * that's expected; guest play, scoring, and party UI flows all work.
 */

import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const PORT = Number(process.env.DEV_API_PORT || 3001);

// Local-dev safety defaults: keep server modules importable without real services.
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.CLERK_ISSUER = process.env.CLERK_ISSUER || 'https://placeholder-dev.clerk.accounts.dev';

const HANDLER_CACHE = new Map();

async function loadHandler(apiPath) {
  // /api/locations → api/locations.ts ; /api/avatar/equip → api/avatar/equip.ts
  const segments = apiPath.replace(/^\/api\//, '').replace(/\/+$/, '').split('/');
  if (segments.some((part) => !/^[a-z0-9_-]+$/i.test(part))) {
    return null;
  }
  const key = segments.join('/');
  if (!HANDLER_CACHE.has(key)) {
    const filePath = resolve(process.cwd(), 'api', ...segments) + '.ts';
    try {
      const module = await import(pathToFileURL(filePath).href);
      const handler = module.default ?? null;
      const isEdge = module.config?.runtime === 'edge';
      HANDLER_CACHE.set(key, handler ? { handler, isEdge } : null);
    } catch (error) {
      if (error?.code === 'ERR_MODULE_NOT_FOUND') {
        HANDLER_CACHE.set(key, null);
      } else {
        throw error;
      }
    }
  }
  return HANDLER_CACHE.get(key);
}

function parseCookies(header = '') {
  const cookies = {};
  for (const pair of header.split(';')) {
    const index = pair.indexOf('=');
    if (index > 0) cookies[pair.slice(0, index).trim()] = decodeURIComponent(pair.slice(index + 1).trim());
  }
  return cookies;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return undefined;
  const contentType = req.headers['content-type'] ?? '';
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // --- Vercel-style request/response shims ---
  req.query = Object.fromEntries(url.searchParams.entries());
  req.cookies = parseCookies(req.headers.cookie);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    req.body = await readBody(req);
  }

  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (value) => {
    if (!res.headersSent) res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(value));
    return res;
  };
  res.send = (value) => {
    if (value === undefined || value === null) {
      res.end();
    } else if (typeof value === 'object' && !Buffer.isBuffer(value)) {
      res.json(value);
    } else {
      res.end(value);
    }
    return res;
  };
  res.redirect = (codeOrUrl, maybeUrl) => {
    const [code, location] = typeof codeOrUrl === 'number' ? [codeOrUrl, maybeUrl] : [307, codeOrUrl];
    res.statusCode = code;
    res.setHeader('location', location);
    res.end();
    return res;
  };

  try {
    const entry = url.pathname.startsWith('/api/') ? await loadHandler(url.pathname) : null;
    if (!entry) {
      res.status(404).json({ error: `No handler for ${url.pathname}` });
      return;
    }

    if (entry.isEdge) {
      // Edge handlers take a web Request and return a web Response.
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) {
        if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      }
      const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
      const webRequest = new Request(url, {
        method: req.method,
        headers,
        body: hasBody ? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {})) : undefined,
      });
      const webResponse = await entry.handler(webRequest);
      res.statusCode = webResponse.status;
      webResponse.headers.forEach((value, name) => res.setHeader(name, value));
      res.end(Buffer.from(await webResponse.arrayBuffer()));
    } else {
      await entry.handler(req, res);
      if (!res.writableEnded) res.end();
    }
  } catch (error) {
    console.error(`[dev-api] ${req.method} ${url.pathname} failed:`, error);
    if (!res.writableEnded) {
      res.status(500).json({ error: error?.message ?? 'Internal error' });
    }
  }
  console.log(`[dev-api] ${req.method} ${url.pathname} → ${res.statusCode}`);
});

server.listen(PORT, () => {
  console.log(`Dev API listening on http://localhost:${PORT} (handlers from ./api, TS via tsx)`);
});
