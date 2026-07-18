/**
 * UBC Guessr — Photo Location Data
 *
 * Data structure for organizing 360° panoramic photo locations across UBC campus.
 *
 * ADDING COORDINATES:
 *   Set `coordinates: [latitude, longitude]` for each photo.
 *   UBC campus bounding box: lat 49.255–49.270, lng -123.260 to -123.225
 *
 * CLOUD MIGRATION (future):
 *   Replace `filename` with `url: string` pointing to S3/CDN.
 *   Update `getPhotoUrl()` in `photoService.ts`.
 *
 * SCORING NOTE:
 *   Only photos with non-null coordinates are used in gameplay.
 *   Photos labelled `coordinates: null` are excluded from random selection.
 */

export interface PhotoLocation {
  /** Unique identifier (matches filename without extension) */
  id: string;
  /** Local filename, e.g. "GS__0210.JPG" — swap for `url` in cloud version */
  filename: string;
  /**
   * [latitude, longitude] in decimal degrees.
   * Set to null if coordinates haven't been assigned yet.
   * UBC campus centre: [49.2606, -123.2460]
   */
  coordinates: [number, number] | null;
  /** Human-readable location label, e.g. "Main Mall & University Blvd" */
  label?: string;
  /** Optional hint shown briefly before the round starts */
  hint?: string;
}

/**
 * All available photo locations.
 *
 * Coordinates below are PLACEHOLDER values spread across UBC campus.
 * Replace with actual GPS coordinates from your GoPro photo metadata
 * or by manually pinning each photo on the map.
 *
 * UBC campus approximate grid used for placeholders:
 *   Lat range: 49.255 – 49.272
 *   Lng range: -123.260 – -123.224
 */
export const photoLocations: PhotoLocation[] = [
  { id: 'GS__0210', filename: 'GS__0210.JPG', coordinates: [49.264486, -123.24409], label: 'next to ubc hospital' },
  { id: 'GS__0211', filename: 'GS__0211.JPG', coordinates: [49.264869, -123.245572], label: 'Behind IRC' },
  { id: 'GS__0212', filename: 'GS__0212.JPG', coordinates: [49.264405, -123.246967], label: 'Behind IRC' },
  { id: 'GS__0213', filename: 'GS__0213.JPG', coordinates: [49.262995, -123.246814], label: 'UBC Healthsci parkade' },
  { id: 'GS__0214', filename: 'GS__0214.JPG', coordinates: [49.265018, -123.246117], label: 'Next to IRC' },
  { id: 'GS__0215', filename: 'GS__0215.JPG', coordinates: [49.263655, -123.245869], label: 'Inbetween UBC Hospital' },
  { id: 'GS__0216', filename: 'GS__0216.JPG', coordinates: [49.261873, -123.24566], label: 'UBC Life sci center' },
  { id: 'GS__0217', filename: 'GS__0217.JPG', coordinates: [49.263661, -123.249263], label: 'Behind Beaty' },
  { id: 'GS__0218', filename: 'GS__0218.JPG', coordinates: [49.263428, -123.251463], label: 'Infront of Beaty' },
  { id: 'GS__0219', filename: 'GS__0219.JPG', coordinates: [49.264537, -123.252419], label: 'Infront of Bio building' },
  { id: 'GS__0220', filename: 'GS__0220.JPG', coordinates: [49.265582, -123.253193], label: 'Infront of Sauder' },
  { id: 'GS__0221', filename: 'GS__0221.JPG', coordinates: [49.266097, -123.253603], label: 'Infront of Sauder' },
  { id: 'GS__0222', filename: 'GS__0222.JPG', coordinates: [49.266546, -123.252959], label: 'Hennings' },
  { id: 'GS__0223', filename: 'GS__0223.JPG', coordinates: [49.267056, -123.251572], label: 'trees near gage' },
  { id: 'GS__0224', filename: 'GS__0224.JPG', coordinates: [49.268032, -123.249539], label: 'near src' },
  { id: 'GS__0226', filename: 'GS__0226.JPG', coordinates: [49.268417, -123.250998], label: 'JACS Vancouver' },
  { id: 'GS__0227', filename: 'GS__0227.JPG', coordinates: [49.269105, -123.250167], label: 'near gage' },
  { id: 'GS__0228', filename: 'GS__0228.JPG', coordinates: [49.269888, -123.249616], label: 'gage' },
  { id: 'GS__0229', filename: 'GS__0229.JPG', coordinates: [49.270034, -123.248297], label: 'gage' },
  { id: 'GS__0230', filename: 'GS__0230.JPG', coordinates: [49.269914, -123.250724], label: 'gage road' },
  { id: 'GS__0231', filename: 'GS__0231.JPG', coordinates: [49.270774, -123.250373], label: 'Iona Park' },
  { id: 'GS__0232', filename: 'GS__0232.JPG', coordinates: [49.271198, -123.251221], label: 'Iona Park' },
  { id: 'GS__0233', filename: 'GS__0233.JPG', coordinates: [49.271295, -123.252341], label: 'Chapel of Epiphany' },
  { id: 'GS__0234', filename: 'GS__0234.JPG', coordinates: [49.271015, -123.253344], label: 'Chapel of Epiphany' },
  { id: 'GS__0235', filename: 'GS__0235.JPG', coordinates: [49.270276, -123.252862], label: 'Next to allard' },
  { id: 'GS__0236', filename: 'GS__0236.JPG', coordinates: [49.270604, -123.252814], label: 'next to allard' },
  { id: 'GS__0237', filename: 'GS__0237.JPG', coordinates: [49.269076, -123.253158], label: 'allard' },
  { id: 'GS__0238', filename: 'GS__0238.JPG', coordinates: [49.269645, -123.256098], label: 'behind chan center' },
  { id: 'GS__0239', filename: 'GS__0239.JPG', coordinates: [49.269309, -123.256432], label: 'Rose garden' },
  { id: 'GS__0240', filename: 'GS__0240.JPG', coordinates: [49.269040, -123.256569], label: 'behind rose garden' },
  { id: 'GS__0241', filename: 'GS__0241.JPG', coordinates: [49.269202, -123.257138], label: 'behind koerner' },
  { id: 'GS__0242', filename: 'GS__0242.JPG', coordinates: [49.268844, -123.257967], label: 'behind koerner' },
  { id: 'GS__0243', filename: 'GS__0243.JPG', coordinates: [49.268188, -123.25758], label: 'infront of koerner' },
  { id: 'GS__0244', filename: 'GS__0244.JPG', coordinates: [49.268034, -123.257923], label: 'infront of koerner' },
  { id: 'GS__0245', filename: 'GS__0245.JPG', coordinates: [49.266979, -123.257496], label: 'infront of asian center' },
  { id: 'GS__0246', filename: 'GS__0246.JPG', coordinates: [49.266792, -123.257404], label: 'Tagore Statue' },
  { id: 'GS__0247', filename: 'GS__0247.JPG', coordinates: [49.266642, -123.258268], label: 'Forest next to asian center' },
  { id: 'GS__0248', filename: 'GS__0248.JPG', coordinates: [49.26626, -123.258853], label: 'Next to nitobe' },
  { id: 'GS__0249', filename: 'GS__0249.JPG', coordinates: [49.265406, -123.257999], label: 'in front of vanier' },
  { id: 'GS__0250', filename: 'GS__0250.JPG', coordinates: [49.264546, -123.258935], label: 'behind vanier field' },
  { id: 'GS__0251', filename: 'GS__0251.JPG', coordinates: [49.264205, -123.258312], label: 'behind vanier field' },
  { id: 'GS__0252', filename: 'GS__0252.JPG', coordinates: [49.263855, -123.258024], label: 'near tweedsmuir' },
  { id: 'GS__0253', filename: 'GS__0253.JPG', coordinates: [49.263642, -123.256872], label: 'forest near vanier' },
  { id: 'GS__0254', filename: 'GS__0254.JPG', coordinates: [49.26341, -123.256268], label: 'corner of ponderosa' },
  { id: 'GS__0255', filename: 'GS__0255.JPG', coordinates: [49.262904, -123.25652], label: 'St Johns college' },
  { id: 'GS__0256', filename: 'GS__0256.JPG', coordinates: [49.262513, -123.255634], label: 'Infront of westparkade' },
  { id: 'GS__0257', filename: 'GS__0257.JPG', coordinates: [49.262012, -123.255192], label: 'Infront of marine drive' },
  { id: 'GS__0258', filename: 'GS__0258.JPG', coordinates: [49.261838, -123.255644], label: 'marine drive' },
  { id: 'GS__0260', filename: 'GS__0260.JPG', coordinates: [49.261001, -123.254408], label: 'edge of marine drive' },
  { id: 'GS__0262', filename: 'GS__0262.JPG', coordinates: [49.259527, -123.253219], label: 'behind totem' },
  { id: 'GS__0263', filename: 'GS__0263.JPG', coordinates: [49.258637, -123.252162], label: 'behind nootka' },
  { id: 'GS__0265', filename: 'GS__0265.JPG', coordinates: [49.259126, -123.252537], label: 'Totem' },
  { id: 'GS__0267', filename: 'GS__0267.JPG', coordinates: [49.258527, -123.250658], label: 'new totem' },
  { id: 'GS__0268', filename: 'GS__0268.JPG', coordinates: [49.258592, -123.2505], label: 'thunderbird blvd' },
  { id: 'GS__0269', filename: 'GS__0269.JPG', coordinates: [49.258833, -123.249621], label: 'thunderbird blvd' },
  { id: 'GS__0270', filename: 'GS__0270.JPG', coordinates: [49.25913, -123.248743], label: 'larkin drive' },
  { id: 'GS__0271', filename: 'GS__0271.JPG', coordinates: [49.259205, -123.248843], label: 'behind forestry' },
  { id: 'GS__0272', filename: 'GS__0272.JPG', coordinates: [49.259993, -123.248705], label: 'reconciliation pole' },
  { id: 'GS__0273', filename: 'GS__0273.JPG', coordinates: [49.260594, -123.24912], label: 'infront of forestry' },
  { id: 'GS__0274', filename: 'GS__0274.JPG', coordinates: [49.26099, -123.248099], label: 'agronomy rd' },
  { id: 'GS__0276', filename: 'GS__0276.JPG', coordinates: [49.261004, -123.248056], label: 'Hugh dempster pavilion' },
  { id: 'GS__0279', filename: 'GS__0279.JPG', coordinates: [49.261937, -123.245353], label: 'in front of life sci center' },
  { id: 'GS__0280', filename: 'GS__0280.JPG', coordinates: [49.261793, -123.244329], label: 'in front of life sci center' },
  { id: 'GS__0281', filename: 'GS__0281.JPG', coordinates: [49.261643, -123.244261], label: 'in front of life sci center' },
  { id: 'GS__0282', filename: 'GS__0282.JPG', coordinates: [49.262612, -123.243598], label: 'infront of pharm sci' },
  { id: 'GS__0283', filename: 'GS__0283.JPG', coordinates: [49.263065, -123.242602], label: 'infront of pharm sci' },
  { id: 'GS__0284', filename: 'GS__0284.JPG', coordinates: [49.263622, -123.243085], label: 'in front of wesbrook mall' },
];

/** Filter to only photos that have coordinates assigned — used for gameplay */
export const playableLocations = photoLocations.filter(
  (p): p is PhotoLocation & { coordinates: [number, number] } => p.coordinates !== null
);

