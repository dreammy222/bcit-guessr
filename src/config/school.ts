/**
 * Central school configuration for the campus-guessr template.
 *
 * This is THE file to edit when standing up a new school (see NEW_SCHOOL.md).
 * PUBLIC constants only — everything here ships in the client bundle.
 * No secrets, no process.env reads, and no imports of app code
 * (vite.config.ts also imports this file at build time).
 */

export interface ScoreTitle {
  /** Minimum fraction of the max total score (0–1) required for this title */
  minPct: number;
  title: string;
}

/**
 * Round-result reaction popup tier. Checked in order against the guess distance,
 * so these must be listed nearest-first. Scale the distances to the campus —
 * tiers wider than the campus itself can never be reached.
 */
export interface ReactionTier {
  /** Inclusive upper bound in km, or null for the catch-all worst tier */
  maxKm: number | null;
  label: string;
  showConfetti?: boolean;
}

export interface SchoolConfig {
  /** Lowercase identifier — drives storage prefixes and backend defaults, e.g. 'ubc' */
  slug: string;
  /** Short display name, e.g. 'UBC' */
  shortName: string;
  /** Full game name, e.g. 'UBCGuessr' */
  gameName: string;
  tagline: string;
  metaDescription: string;
  /** Production site URL — sitemap, share links, dev API proxy target */
  siteUrl: string;
  instagramUrl: string | null;

  map: {
    center: [number, number];
    bounds: [[number, number], [number, number]];
    defaultZoom: number;
    minZoom: number;
    maxZoom: number;
    /** Leaflet tile layer URL template (defaults to OpenStreetMap) */
    tileUrl: string;
    tileAttribution: string;
  };

  scoring: {
    maxPointsPerRound: number;
    roundsPerGame: number;
    roundTimerSeconds: number;
    /**
     * Gaussian falloff constant (km) in score = max * e^(-d² / 2c²).
     * Tune per campus size: 0.46 keeps ~95% credit at 150m.
     */
    falloffC: number;
    /** Grade-title ladder, checked top-down against totalScore / maxTotal */
    titles: ScoreTitle[];
    /** Round-result reaction popup tiers, nearest-first */
    reactionTiers: ReactionTier[];
  };

  /** IANA timezone for daily-challenge rollover */
  timezone: string;

  /** Prefix for client localStorage/sessionStorage keys, e.g. 'ubc' */
  storagePrefix: string;

  /** Server-side defaults — each overridable via env (see api/_lib/serverConfig.ts) */
  backendDefaults: {
    dynamoTableName: string;
    kvKeyPrefix: string;
    photoBaseUrl: string;
  };

  /** Which cosmetics pack to merge with the generic catalog (src/data/cosmeticsPacks/) */
  cosmeticsPackId: string;
}

export const SCHOOL: SchoolConfig = {
  slug: 'bcit',
  shortName: 'BCIT',
  gameName: 'BCITGuessr',
  tagline: 'Know Your Campus',
  metaDescription: 'A GeoGuessr-style game for BCIT campus :)',
  siteUrl: 'https://bcitguessr.com',
  instagramUrl: null,

  map: {
    // Burnaby campus spans ~950 m N-S x ~525 m E-W (from locations.bcit.json).
    center: [49.2498, -123.0017],
    bounds: [
      [49.2415, -123.0105],
      [49.258, -122.994],
    ],
    defaultZoom: 15,
    minZoom: 14,
    maxZoom: 18,
    tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    tileAttribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },

  scoring: {
    maxPointsPerRound: 2000,
    roundsPerGame: 5,
    roundTimerSeconds: 30,
    // Retuned for BCIT's ~1 km campus (UBC uses 0.46 for ~2 km):
    // a 150 m miss keeps ~87%, 300 m ~56%, 600 m ~10%.
    falloffC: 0.28,
    titles: [
      { minPct: 0.95, title: 'BCIT Legend' },
      { minPct: 0.85, title: 'Campus Master' },
      { minPct: 0.7, title: 'BCIT Navigator' },
      { minPct: 0.55, title: 'Campus Scout' },
      { minPct: 0.4, title: 'Campus Wanderer' },
      { minPct: 0.2, title: 'First-Term Frosh' },
      { minPct: 0, title: 'Lost on Campus' },
    ],
    // Scaled to BCIT (UBC uses 0.15/0.3/0.6/1.0 on a campus twice the size).
    // The worst tier needs a ~600 m+ miss, which spans most of campus.
    reactionTiers: [
      { maxKm: 0.09, label: 'An IQ too high?', showConfetti: true },
      { maxKm: 0.18, label: '13 habits of highly intelligent people' },
      { maxKm: 0.35, label: 'Those who know' },
      { maxKm: 0.6, label: 'Why is he lying?' },
      { maxKm: null, label: 'Put the fries in the bag bro.' },
    ],
  },

  timezone: 'America/Vancouver',

  storagePrefix: 'bcit',

  backendDefaults: {
    dynamoTableName: 'BCITGuessrLocations',
    kvKeyPrefix: 'bcit',
    // Cloudflare R2 behind a custom domain (free egress, CDN-cached).
    // Override with PHOTO_BASE_URL / VITE_PHOTO_BASE_URL, or set them to
    // '/photos' to play offline against the local symlinks.
    photoBaseUrl: 'https://photos.bcitguessr.com',
  },

  // No BCIT art pack yet — the 14 generic cosmetics apply.
  cosmeticsPackId: 'none',
};

/**
 * Two-part logo rendering (accented prefix + plain suffix), derived from the
 * game name: 'UBCGuessr' → { prefix: 'UBC', suffix: 'Guessr' }.
 */
export const LOGO = SCHOOL.gameName.startsWith(SCHOOL.shortName)
  ? { prefix: SCHOOL.shortName, suffix: SCHOOL.gameName.slice(SCHOOL.shortName.length) }
  : { prefix: SCHOOL.gameName, suffix: '' };
