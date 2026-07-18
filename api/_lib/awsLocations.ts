import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { playableLocations } from '../../src/data/locations.js';

export interface StoredLocation {
  id: string;
  label?: string;
  coordinates: [number, number];
}

const cleanKey = (value?: string) => (value ? value.replace(/^"|"$/g, '') : '');

const client = new DynamoDBClient({
  region: cleanKey(process.env.AWS_REGION) || 'us-west-1',
  credentials: {
    accessKeyId: cleanKey(process.env.AWS_ACCESS_KEY_ID),
    secretAccessKey: cleanKey(process.env.AWS_SECRET_ACCESS_KEY),
    sessionToken: cleanKey(process.env.AWS_SESSION_TOKEN) || undefined,
  },
});

const ddbDocClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = 'UBCGuessrLocations';
const LOCATION_CACHE_TTL_MS = 10 * 60 * 1000;
const SHOULD_FALLBACK_TO_LOCAL_LOCATIONS = process.env.NODE_ENV !== 'production';

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

function getLocalStoredLocations(): StoredLocation[] {
  return playableLocations.map((location) => ({
    id: location.id,
    label: location.label,
    coordinates: location.coordinates,
  }));
}

function warnUsingLocalFallback(error: unknown) {
  console.warn('Falling back to local location data.', error);
}

export async function listStoredLocations(): Promise<StoredLocation[]> {
  const now = Date.now();
  if (listCache?.value && listCache.expiresAt > now) {
    return listCache.value;
  }

  if (listCache?.pending) {
    return listCache.pending;
  }

  const pending = ddbDocClient.send(
    new ScanCommand({
      TableName: TABLE_NAME,
      ProjectionExpression: 'id, label, coordinates',
    })
  ).then((response) => (
    (response.Items || [])
      .filter((item) => Array.isArray(item.coordinates) && item.coordinates.length === 2)
      .map((item) => ({
        id: item.id as string,
        label: item.label as string | undefined,
        coordinates: item.coordinates as [number, number],
      }))
  )).catch((error) => {
    if (!SHOULD_FALLBACK_TO_LOCAL_LOCATIONS) {
      throw error;
    }

    warnUsingLocalFallback(error);
    return getLocalStoredLocations();
  }).then((locations) => {

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
  }).finally(() => {
    if (listCache?.pending === pending) {
      listCache = listCache.value
        ? listCache
        : null;
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

  const pending = ddbDocClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { id: photoId },
    })
  ).then((response) => {
    const item = response.Item;

    return item && Array.isArray(item.coordinates) && item.coordinates.length === 2
      ? {
          id: item.id as string,
          label: item.label as string | undefined,
          coordinates: item.coordinates as [number, number],
        }
      : null;
  }).catch((error) => {
    if (!SHOULD_FALLBACK_TO_LOCAL_LOCATIONS) {
      throw error;
    }

    warnUsingLocalFallback(error);
    return getLocalStoredLocations().find((location) => location.id === photoId) ?? null;
  }).then((location) => {

    locationCache.set(photoId, {
      expiresAt: Date.now() + LOCATION_CACHE_TTL_MS,
      value: location,
    });

    return location;
  }).finally(() => {
    const current = locationCache.get(photoId);
    if (current?.pending === pending && current.value === undefined) {
      locationCache.delete(photoId);
    }
  });

  locationCache.set(photoId, {
    expiresAt: now + LOCATION_CACHE_TTL_MS,
    pending,
  });

  return pending;
}
