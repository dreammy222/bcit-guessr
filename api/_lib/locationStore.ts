/**
 * Canonical location catalog — the server's source of truth for the true
 * coordinates behind every photo.
 *
 * Two interchangeable backends, chosen with LOCATIONS_BACKEND:
 *   'dynamo'   (default) AWS DynamoDB, table from DYNAMO_TABLE_NAME
 *   'supabase' Postgres via PostgREST, table from LOCATIONS_TABLE
 *
 * Everything above the provider layer — the 10 minute cache, single-flight
 * de-duping, and the dev-only fallback to the local JSON — is shared, so
 * callers never care which backend a school uses.
 */

import { DYNAMO_TABLE, LOCATIONS_BACKEND, LOCATIONS_TABLE } from './serverConfig.js';
import { selectRows, selectSingle } from './supabase.js';

export interface StoredLocation {
  id: string;
  label?: string;
  coordinates: [number, number];
}

interface LocationProvider {
  fetchAll(): Promise<StoredLocation[]>;
  fetchOne(photoId: string): Promise<StoredLocation | null>;
}

const LOCATION_CACHE_TTL_MS = 10 * 60 * 1000;
const SHOULD_FALLBACK_TO_LOCAL_LOCATIONS = process.env.NODE_ENV !== 'production';

const cleanKey = (value?: string) => (value ? value.replace(/^"|"$/g, '') : '');

function isValidCoordinatePair(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((part) => typeof part === 'number' && Number.isFinite(part))
  );
}

/* ------------------------------- DynamoDB -------------------------------- */

// Imported on demand so schools on Supabase never pay the AWS SDK's load cost.
let dynamoClientPromise: Promise<any> | null = null;

async function getDynamoClient() {
  dynamoClientPromise ??= (async () => {
    const [{ DynamoDBClient }, { DynamoDBDocumentClient }] = await Promise.all([
      import('@aws-sdk/client-dynamodb'),
      import('@aws-sdk/lib-dynamodb'),
    ]);

    return DynamoDBDocumentClient.from(
      new DynamoDBClient({
        region: cleanKey(process.env.AWS_REGION) || 'us-west-1',
        credentials: {
          accessKeyId: cleanKey(process.env.AWS_ACCESS_KEY_ID),
          secretAccessKey: cleanKey(process.env.AWS_SECRET_ACCESS_KEY),
          sessionToken: cleanKey(process.env.AWS_SESSION_TOKEN) || undefined,
        },
      })
    );
  })();

  return dynamoClientPromise;
}

const dynamoProvider: LocationProvider = {
  async fetchAll() {
    const [client, { ScanCommand }] = await Promise.all([
      getDynamoClient(),
      import('@aws-sdk/lib-dynamodb'),
    ]);

    const response = await client.send(
      new ScanCommand({ TableName: DYNAMO_TABLE, ProjectionExpression: 'id, label, coordinates' })
    );

    return (response.Items || [])
      .filter((item: any) => isValidCoordinatePair(item.coordinates))
      .map((item: any) => ({
        id: item.id as string,
        label: item.label as string | undefined,
        coordinates: item.coordinates as [number, number],
      }));
  },

  async fetchOne(photoId: string) {
    const [client, { GetCommand }] = await Promise.all([
      getDynamoClient(),
      import('@aws-sdk/lib-dynamodb'),
    ]);

    const response = await client.send(
      new GetCommand({ TableName: DYNAMO_TABLE, Key: { id: photoId } })
    );
    const item = response.Item;

    return item && isValidCoordinatePair(item.coordinates)
      ? {
          id: item.id as string,
          label: item.label as string | undefined,
          coordinates: item.coordinates as [number, number],
        }
      : null;
  },
};

/* -------------------------------- Supabase -------------------------------- */

interface LocationRow {
  id: string;
  label: string | null;
  lat: number | null;
  lng: number | null;
}

function rowToStoredLocation(row: LocationRow): StoredLocation | null {
  // PostgREST returns numerics as numbers, but be defensive about strings.
  const lat = typeof row.lat === 'string' ? Number(row.lat) : row.lat;
  const lng = typeof row.lng === 'string' ? Number(row.lng) : row.lng;

  if (!isValidCoordinatePair([lat, lng])) {
    return null;
  }

  return {
    id: row.id,
    label: row.label ?? undefined,
    coordinates: [lat as number, lng as number],
  };
}

const supabaseProvider: LocationProvider = {
  async fetchAll() {
    const rows = await selectRows<LocationRow>(LOCATIONS_TABLE, { select: 'id,label,lat,lng' });
    return rows
      .map(rowToStoredLocation)
      .filter((location): location is StoredLocation => location !== null);
  },

  async fetchOne(photoId: string) {
    const row = await selectSingle<LocationRow>(LOCATIONS_TABLE, {
      select: 'id,label,lat,lng',
      filters: { id: `eq.${photoId}` },
    });

    return row ? rowToStoredLocation(row) : null;
  },
};

const provider: LocationProvider =
  LOCATIONS_BACKEND === 'supabase' ? supabaseProvider : dynamoProvider;

/* ------------------------- cache + local fallback ------------------------- */

let listCache:
  | {
      expiresAt: number;
      value?: StoredLocation[];
      pending?: Promise<StoredLocation[]>;
    }
  | null = null;

const locationCache = new Map<
  string,
  {
    expiresAt: number;
    value?: StoredLocation | null;
    pending?: Promise<StoredLocation | null>;
  }
>();

let localLocationsCache: StoredLocation[] | null = null;

/**
 * Dev-only fallback data, imported on demand rather than at module load.
 *
 * src/data/locations.*.json is a JSON module, and Node ESM refuses to load one
 * without an import attribute — which Vercel's TypeScript step strips. A static
 * import therefore crashed every nodejs-runtime function that could reach this
 * file, even though the fallback never runs in production. Keeping it dynamic
 * means production never loads the JSON at all.
 */
async function getLocalStoredLocations(): Promise<StoredLocation[]> {
  if (!localLocationsCache) {
    const { playableLocations } = await import('../../src/data/locations.js');
    localLocationsCache = playableLocations.map((location) => ({
      id: location.id,
      label: location.label,
      coordinates: location.coordinates,
    }));
  }

  return localLocationsCache;
}

function warnUsingLocalFallback(error: unknown) {
  console.warn(`Falling back to local location data (${LOCATIONS_BACKEND}).`, error);
}

export async function listStoredLocations(): Promise<StoredLocation[]> {
  const now = Date.now();
  if (listCache?.value && listCache.expiresAt > now) {
    return listCache.value;
  }

  if (listCache?.pending) {
    return listCache.pending;
  }

  const pending = provider
    .fetchAll()
    .catch((error) => {
      if (!SHOULD_FALLBACK_TO_LOCAL_LOCATIONS) {
        throw error;
      }

      warnUsingLocalFallback(error);
      return getLocalStoredLocations();
    })
    .then((locations) => {
      listCache = {
        expiresAt: Date.now() + LOCATION_CACHE_TTL_MS,
        value: locations,
      };

      locations.forEach((location) => {
        locationCache.set(location.id, {
          expiresAt: Date.now() + LOCATION_CACHE_TTL_MS,
          value: location,
        });
      });

      return locations;
    })
    .finally(() => {
      if (listCache?.pending === pending) {
        listCache = listCache.value ? listCache : null;
      }
    });

  listCache = {
    expiresAt: now + LOCATION_CACHE_TTL_MS,
    pending,
  };

  return pending;
}

export async function getStoredLocation(photoId: string): Promise<StoredLocation | null> {
  const now = Date.now();
  const cached = locationCache.get(photoId);
  if (cached?.value !== undefined && cached.expiresAt > now) {
    return cached.value;
  }

  if (cached?.pending) {
    return cached.pending;
  }

  const pending = provider
    .fetchOne(photoId)
    .catch(async (error) => {
      if (!SHOULD_FALLBACK_TO_LOCAL_LOCATIONS) {
        throw error;
      }

      warnUsingLocalFallback(error);
      const local = await getLocalStoredLocations();
      return local.find((location) => location.id === photoId) ?? null;
    })
    .then((location) => {
      locationCache.set(photoId, {
        expiresAt: Date.now() + LOCATION_CACHE_TTL_MS,
        value: location,
      });

      return location;
    })
    .finally(() => {
      const entry = locationCache.get(photoId);
      if (entry?.pending === pending && entry.value === undefined) {
        locationCache.delete(photoId);
      }
    });

  locationCache.set(photoId, {
    expiresAt: now + LOCATION_CACHE_TTL_MS,
    pending,
  });

  return pending;
}
