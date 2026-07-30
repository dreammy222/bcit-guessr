/**
 * Seed the location catalog from src/data/locations.<slug>.json into whichever
 * backend the deployment uses.
 *
 *   LOCATIONS_FILE=locations.bcit.json LOCATIONS_BACKEND=supabase \
 *     node scripts/seedLocations.mjs
 *
 * Reads .env.local automatically. Supabase upserts on id, so re-running after
 * fixing a coordinate updates in place rather than duplicating. Photos with
 * coordinates: null are skipped — they are deliberately out of rotation.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

try {
  process.loadEnvFile(path.resolve(process.cwd(), '.env.local'));
} catch {
  // Fine — env may come from the shell instead.
}

const BACKEND = (process.env.LOCATIONS_BACKEND || 'dynamo').toLowerCase();
const LOCATIONS_FILE = process.env.LOCATIONS_FILE;

if (!LOCATIONS_FILE) {
  console.error('LOCATIONS_FILE env var is required (e.g. LOCATIONS_FILE=locations.bcit.json)');
  process.exit(1);
}

const locationsPath = path.join(__dirname, '../src/data', LOCATIONS_FILE);
const locations = JSON.parse(fs.readFileSync(locationsPath, 'utf8'))
  .filter((loc) => Array.isArray(loc.coordinates) && loc.coordinates.length === 2)
  .map((loc) => ({
    id: loc.id,
    lat: loc.coordinates[0],
    lng: loc.coordinates[1],
    label: loc.label ?? '',
  }));

const skipped = JSON.parse(fs.readFileSync(locationsPath, 'utf8')).length - locations.length;
console.log(
  `${LOCATIONS_FILE}: ${locations.length} playable locations` +
    (skipped ? ` (${skipped} skipped, no coordinates)` : '') +
    ` → ${BACKEND}`
);

async function seedSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const table = process.env.LOCATIONS_TABLE || 'locations';

  if (!url || !key) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for the supabase backend.');
    process.exit(1);
  }

  const response = await fetch(`${url}/rest/v1/${table}?on_conflict=id`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(locations),
  });

  if (!response.ok) {
    console.error(`Supabase upsert failed (${response.status}): ${await response.text()}`);
    console.error('Did you run supabase/locations_schema.sql against the project?');
    process.exit(1);
  }

  console.log(`Upserted ${locations.length} rows into "${table}".`);
}

async function seedDynamo() {
  const [{ DynamoDBClient }, { DynamoDBDocumentClient, PutCommand }] = await Promise.all([
    import('@aws-sdk/client-dynamodb'),
    import('@aws-sdk/lib-dynamodb'),
  ]);

  const tableName = process.env.DYNAMO_TABLE_NAME;
  if (!tableName) {
    console.error('DYNAMO_TABLE_NAME env var is required for the dynamo backend.');
    process.exit(1);
  }

  const docClient = DynamoDBDocumentClient.from(
    new DynamoDBClient({
      region: process.env.AWS_REGION || 'us-west-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    })
  );

  let ok = 0;
  let failed = 0;

  for (const location of locations) {
    try {
      await docClient.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            id: location.id,
            label: location.label,
            coordinates: [location.lat, location.lng],
          },
        })
      );
      ok += 1;
      if (ok % 10 === 0) process.stdout.write('.');
    } catch (error) {
      console.error(`\nFailed ${location.id}: ${error.message}`);
      failed += 1;
    }
  }

  console.log(`\nSeeded ${ok} items into "${tableName}"${failed ? `, ${failed} failed` : ''}.`);
  if (failed) process.exit(1);
}

await (BACKEND === 'supabase' ? seedSupabase() : seedDynamo());
