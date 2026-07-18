import { kv } from '@vercel/kv';
import { Webhook } from 'svix';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  RATE_LIMITS,
  applyRateLimitHeaders,
  checkRateLimit,
  sendRateLimitExceeded,
} from '../_lib/security.js';

interface ClerkUserWebhookEvent {
  type: string;
  data: {
    id?: string;
    username?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    email_addresses?: Array<{ email_address?: string | null }>;
  };
}

export const config = {
  runtime: 'nodejs',
};

function getWebhookSecrets() {
  return [process.env.CLERK_WEBHOOK_SIGNING_SECRET, process.env.CLERK_WEBHOOK_SECRET]
    .filter((secret): secret is string => Boolean(secret))
    .filter((secret, index, secrets) => secrets.indexOf(secret) === index);
}

function getDisplayName(data: ClerkUserWebhookEvent['data']) {
  const fullName = [data.first_name, data.last_name].filter(Boolean).join(' ').trim();
  return data.username || fullName || data.email_addresses?.[0]?.email_address?.split('@')[0] || null;
}

async function readRawBody(req: VercelRequest) {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf8');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const rateLimit = await checkRateLimit(req, RATE_LIMITS.webhook);
  if (!rateLimit.allowed) {
    return sendRateLimitExceeded(res, rateLimit);
  }

  applyRateLimitHeaders(res, rateLimit);

  if (req.method === 'GET') {
    return res.status(200).json({ status: 'active', message: 'Clerk Webhook endpoint is reachable' });
  }

  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const webhookSecrets = getWebhookSecrets();
  if (webhookSecrets.length === 0) {
    console.error('Missing CLERK_WEBHOOK_SIGNING_SECRET or CLERK_WEBHOOK_SECRET');
    return res.status(500).send('Server misconfigured');
  }

  const svix_id = req.headers['svix-id'] as string;
  const svix_timestamp = req.headers['svix-timestamp'] as string;
  const svix_signature = req.headers['svix-signature'] as string;

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return res.status(400).send('Missing svix headers');
  }

  const bodyText = await readRawBody(req);
  let event: ClerkUserWebhookEvent | null = null;
  let verificationError: unknown = null;

  for (const webhookSecret of webhookSecrets) {
    try {
      event = new Webhook(webhookSecret).verify(bodyText, {
        'svix-id': svix_id,
        'svix-timestamp': svix_timestamp,
        'svix-signature': svix_signature,
      }) as ClerkUserWebhookEvent;
      break;
    } catch (err) {
      verificationError = err;
    }
  }

  if (!event) {
    console.error('Webhook verification failed:', verificationError);
    return res.status(400).send('Invalid webhook signature');
  }

  const { id } = event.data;
  const eventType = event.type;

  if (eventType === 'user.created') {
    if (!id) {
      return res.status(400).send('Missing Clerk user id');
    }

    const username = getDisplayName(event.data) || `player_${id.slice(-4)}`;

    try {
      await kv.hset(`user:${id}`, {
        id,
        username,
        bestScore: 0,
        coinBalance: 0,
        joinedAt: Date.now(),
      });

      console.log(`[Webhook] Success: Profile created for ${id}`);
    } catch (err) {
      console.error('[Webhook] Database Error:', err);
      return res.status(500).send('Database error');
    }
  }

  if (eventType === 'user.deleted') {
    if (!id) {
      return res.status(400).send('Missing Clerk user id');
    }

    try {
      await kv.zrem('ubc_leaderboard', id);
      await kv.del(`user:${id}`);
      await kv.del(`user:${id}:ownedCosmetics`);
      console.log(`[Webhook] Success: Removed data for ${id}`);
    } catch (err) {
      console.error('[Webhook] Failed to clean up user data:', err);
      return res.status(500).send('Failed to clean up user data');
    }
  }

  return res.status(200).json({ received: true });
}
