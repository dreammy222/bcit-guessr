/**
 * Photo location data — loaded from the per-school JSON file.
 *
 * To stand up a new school, create src/data/locations.<slug>.json with the
 * same shape and point the import below at it (see NEW_SCHOOL.md).
 * Only photos with non-null coordinates are used in gameplay.
 */

import rawLocations from './locations.ubc.json' with { type: 'json' };

export interface PhotoLocation {
  /** Unique identifier (matches filename without extension) */
  id: string;
  /** Photo filename appended to the photo base URL, e.g. "GS__0210.JPG" */
  filename: string;
  /** [latitude, longitude] in decimal degrees, or null to exclude from play */
  coordinates: [number, number] | null;
  /** Human-readable location label */
  label?: string;
  /** Optional hint shown briefly before the round starts */
  hint?: string;
}

export const photoLocations = rawLocations as PhotoLocation[];

/** Filter to only photos that have coordinates assigned — used for gameplay */
export const playableLocations = photoLocations.filter(
  (p): p is PhotoLocation & { coordinates: [number, number] } => p.coordinates !== null
);
