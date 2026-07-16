/**
 * services/data-api/src/shared/maps.ts — postcode → centroid geocode + great-circle distance (TKT-076).
 *
 * Used ONLY to compute a proximity ORDERING signal for the inspection-address shortlist
 * (ADR-0016 helper #2b): distance from the case's accident/claimant postcode to each corpus
 * site. It NEVER auto-selects an address (ADR-0013) and is a pure ordering hint.
 *
 * In-tenant Azure Maps (cespkmaps-dev) Search-Address geocode, keyed by AZURE_MAPS_KEY. If the
 * key is absent or the call fails, geocodePostcode resolves null and proximity simply doesn't
 * apply — the shortlist falls back to frequency/recency ordering (honest degradation). Results
 * are cached per-instance (postcodes repeat across a case's suggestions).
 */

const MAPS_HOST = 'https://atlas.microsoft.com/search/address/json';

// UK postcode (full only — ADR-0013 forbids partial/bare postcodes as a signal).
const UK_POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;

export interface LatLon {
  lat: number;
  lon: number;
}

const cache = new Map<string, LatLon | null>();

/** Extract + normalise the first full UK postcode from free text, or null. */
export function extractPostcode(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(UK_POSTCODE);
  if (!m) return null;
  return `${m[1].toUpperCase()} ${m[2].toUpperCase()}`;
}

/** Great-circle distance in miles between two lat/lon points. */
export function haversineMiles(a: LatLon, b: LatLon): number {
  const R = 3958.7613; // Earth radius, miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Geocode a UK postcode to a centroid via Azure Maps. Returns null (never throws) when the key
 * is absent or the call fails — the caller treats that as "no proximity signal".
 */
export async function geocodePostcode(postcode: string | null | undefined): Promise<LatLon | null> {
  const pc = extractPostcode(postcode);
  if (!pc) return null;
  if (cache.has(pc)) return cache.get(pc) ?? null;

  const key = process.env.AZURE_MAPS_KEY ?? '';
  if (!key) {
    cache.set(pc, null);
    return null;
  }
  try {
    const url =
      `${MAPS_HOST}?api-version=1.0&countrySet=GB&limit=1` +
      `&subscription-key=${encodeURIComponent(key)}&query=${encodeURIComponent(pc)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) {
      cache.set(pc, null);
      return null;
    }
    const body = (await res.json()) as { results?: Array<{ position?: { lat?: number; lon?: number } }> };
    const pos = body.results?.[0]?.position;
    const geo =
      pos && typeof pos.lat === 'number' && typeof pos.lon === 'number'
        ? { lat: pos.lat, lon: pos.lon }
        : null;
    cache.set(pc, geo);
    return geo;
  } catch {
    cache.set(pc, null);
    return null;
  }
}
