/**
 * Validates the per-school deployment configuration.
 *
 *   node scripts/setup-check.mjs             # check env vars are present
 *   node scripts/setup-check.mjs --connect   # also probe each service live
 *
 * Reads .env.local automatically if present (no dependency on dotenv).
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const CONNECT = process.argv.includes('--connect');

// --- load .env.local ---------------------------------------------------------
try {
  const envFile = await readFile(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of envFile.split('\n')) {
    const match = line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*)\s*$/);
    if (match && !(match[1] in process.env)) {
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  }
  console.log('Loaded .env.local');
} catch {
  console.log('No .env.local found — checking process env only');
}

// --- read school config defaults (plain-text extraction, no TS runtime) ------
let schoolSource = '';
try {
  schoolSource = await readFile(resolve(process.cwd(), 'src/config/school.ts'), 'utf8');
} catch {
  /* handled below */
}
const configField = (name) => schoolSource.match(new RegExp(`${name}:\\s*'([^']+)'`))?.[1] ?? '';

const env = (name) => process.env[name]?.trim() || '';
const results = [];
let failures = 0;

function check(group, label, ok, hint) {
  results.push({ group, label, ok, hint });
  if (!ok) failures += 1;
}

// --- env presence checks -----------------------------------------------------
check('School config', 'src/config/school.ts readable', Boolean(schoolSource), 'file missing?');
check('School config', `slug set (${configField('slug') || 'MISSING'})`, Boolean(configField('slug')), 'fill in src/config/school.ts');

check('Clerk', 'VITE_CLERK_PUBLISHABLE_KEY', Boolean(env('VITE_CLERK_PUBLISHABLE_KEY')), 'Clerk Dashboard → API keys');
check('Clerk', 'CLERK_ISSUER (or CLERK_JWKS_URL)', Boolean(env('CLERK_ISSUER') || env('CLERK_JWKS_URL') || env('CLERK_FAPI') || env('CLERK_FRONTEND_API')), 'e.g. https://your-app.clerk.accounts.dev');
check('Clerk', 'CLERK_WEBHOOK_SIGNING_SECRET', Boolean(env('CLERK_WEBHOOK_SIGNING_SECRET') || env('CLERK_WEBHOOK_SECRET')), 'Clerk Dashboard → Webhooks (needed for user deletion cleanup)');

const locationsBackend = (env('LOCATIONS_BACKEND') || 'dynamo').toLowerCase() === 'supabase' ? 'supabase' : 'dynamo';
const dynamoTable = env('DYNAMO_TABLE_NAME') || configField('dynamoTableName');
const locationsTable = env('LOCATIONS_TABLE') || 'locations';

if (locationsBackend === 'supabase') {
  check('Locations', `backend: supabase (table "${locationsTable}")`, true, 'LOCATIONS_BACKEND=supabase — no AWS credentials needed for locations');
} else {
  check('Locations', 'backend: dynamo', true, 'set LOCATIONS_BACKEND=supabase to use Postgres instead');
  check('AWS', 'AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY', Boolean(env('AWS_ACCESS_KEY_ID') && env('AWS_SECRET_ACCESS_KEY')), 'IAM user with DynamoDB read access');
  check('AWS', `DynamoDB table name (${dynamoTable || 'MISSING'})`, Boolean(dynamoTable), 'DYNAMO_TABLE_NAME or backendDefaults.dynamoTableName');
}
const photoBase = env('PHOTO_BASE_URL') || env('PHOTO_CDN_BASE_URL') || configField('photoBaseUrl');
check('Photos', `photo base URL (${photoBase || 'MISSING'})`, Boolean(photoBase), 'PHOTO_BASE_URL or backendDefaults.photoBaseUrl');
check('Photos', 'VITE_PHOTO_BASE_URL (client)', Boolean(env('VITE_PHOTO_BASE_URL') || configField('photoBaseUrl')), 'set for the client bundle too');

check('Vercel KV', 'KV_REST_API_URL + KV_REST_API_TOKEN', Boolean(env('KV_REST_API_URL') && env('KV_REST_API_TOKEN')), 'attach a KV store to the Vercel project');
check('Supabase', 'SUPABASE_URL', Boolean(env('SUPABASE_URL') || env('VITE_SUPABASE_URL')), 'Supabase project settings → API');
check('Supabase', 'SUPABASE_SERVICE_ROLE_KEY (or anon key)', Boolean(env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_ANON_KEY') || env('VITE_SUPABASE_ANON_KEY')), 'Supabase project settings → API');
check('Cron', 'CRON_SECRET', Boolean(env('CRON_SECRET')), 'any long random string, also set in Vercel');

// --- live probes -------------------------------------------------------------
async function probe(group, label, fn) {
  try {
    await fn();
    check(group, label, true);
  } catch (error) {
    check(group, label, false, error?.message ?? String(error));
  }
}

if (CONNECT) {
  console.log('\nRunning live connectivity probes...');

  if (locationsBackend === 'supabase') {
    const supabaseUrl = env('SUPABASE_URL') || env('VITE_SUPABASE_URL');
    const supabaseKey = env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_ANON_KEY') || env('VITE_SUPABASE_ANON_KEY');
    if (supabaseUrl && supabaseKey) {
      await probe('Locations', `Supabase table "${locationsTable}" readable`, async () => {
        const response = await fetch(`${supabaseUrl}/rest/v1/${locationsTable}?select=id&limit=1`, {
          headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        const rows = await response.json();
        if (!Array.isArray(rows) || rows.length === 0) {
          throw new Error('table is empty — run scripts/seedLocations.mjs');
        }
      });
    }
  } else if (dynamoTable && env('AWS_ACCESS_KEY_ID')) {
    await probe('AWS', `DynamoDB DescribeTable ${dynamoTable}`, async () => {
      const { DynamoDBClient, DescribeTableCommand } = await import('@aws-sdk/client-dynamodb');
      const client = new DynamoDBClient({ region: env('AWS_REGION') || 'us-west-1' });
      await client.send(new DescribeTableCommand({ TableName: dynamoTable }));
    });
  }

  if (env('KV_REST_API_URL')) {
    await probe('Vercel KV', 'KV ping', async () => {
      const response = await fetch(`${env('KV_REST_API_URL')}/ping`, {
        headers: { Authorization: `Bearer ${env('KV_REST_API_TOKEN')}` },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    });
  }

  const supabaseUrl = env('SUPABASE_URL') || env('VITE_SUPABASE_URL');
  const supabaseKey = env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_ANON_KEY') || env('VITE_SUPABASE_ANON_KEY');
  if (supabaseUrl && supabaseKey) {
    await probe('Supabase', 'party_sessions table reachable', async () => {
      const response = await fetch(`${supabaseUrl}/rest/v1/party_sessions?select=id&limit=1`, {
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} — did you run supabase/party_mode_schema.sql?`);
    });
  }

  if (photoBase) {
    await probe('Photos', 'first location photo reachable', async () => {
      const locationsFile = process.env.LOCATIONS_FILE || 'locations.ubc.json';
      const locations = JSON.parse(await readFile(resolve(process.cwd(), 'src/data', locationsFile), 'utf8'));
      const first = locations.find((loc) => loc.filename);
      if (!first) throw new Error(`no entries in ${locationsFile}`);
      const response = await fetch(`${photoBase.replace(/\/+$/, '')}/${encodeURIComponent(first.filename)}`, { method: 'HEAD' });
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${first.filename} — check bucket policy/CORS`);
    });
  }

  const issuer = env('CLERK_ISSUER');
  if (issuer) {
    await probe('Clerk', 'JWKS endpoint reachable', async () => {
      const base = /^https?:\/\//i.test(issuer) ? issuer : `https://${issuer}`;
      const response = await fetch(`${base.replace(/\/+$/, '')}/.well-known/jwks.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    });
  }
}

// --- report ------------------------------------------------------------------
console.log('');
let lastGroup = '';
for (const { group, label, ok, hint } of results) {
  if (group !== lastGroup) {
    console.log(`\n${group}`);
    lastGroup = group;
  }
  console.log(`  ${ok ? '✔' : '✘'} ${label}${!ok && hint ? `  → ${hint}` : ''}`);
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
if (!CONNECT) console.log('Tip: run with --connect to probe each service live.');
process.exitCode = failures === 0 ? 0 : 1;
