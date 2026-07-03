/**
 * orchestration/src/lib/telemetry.ts
 *
 * Minimal App Insights `customEvents` emitter — the decision-telemetry channel ADR-0019
 * §"decision telemetry" / rules-engine-v2 Phase 2 relies on ("every policy decision …
 * logged to App Insights customEvents always-on … rather than a shadow-write into gated
 * tables"). No SDK dependency (no new npm package): parses the standard
 * `APPLICATIONINSIGHTS_CONNECTION_STRING` app-setting (the same one App Insights
 * auto-instrumentation already reads) and POSTs the classic "track" envelope straight to
 * the ingestion endpoint's `/v2/track` route.
 *
 * Fire-and-forget, ~2s-bounded, and NEVER throws — a telemetry miss must never affect
 * intake (mirrors this app's "additive, best-effort" convention for anything that isn't
 * core intake — extractImages/boxArchive/enrich). Silent no-op when the connection string
 * is absent (local dev / `func start` without App Insights wired).
 */

/** The two connection-string parts this module needs — deliberately not the FULL parsed
 *  key set (LiveEndpoint, ApplicationId, etc. are irrelevant to a bare `/v2/track` POST). */
interface ConnectionStringParts {
  instrumentationKey: string;
  ingestionEndpoint: string;
}

/** Documented default ingestion endpoint when the connection string omits one (older
 *  instrumentation-key-only strings). */
const DEFAULT_INGESTION_ENDPOINT = 'https://dc.services.visualstudio.com';
const TRACK_TIMEOUT_MS = 2_000;

/**
 * Parse the standard `InstrumentationKey=<guid>;IngestionEndpoint=https://…;…`
 * connection-string format (order-independent, extra segments ignored). Pure — no I/O, no
 * env reads — so it is unit-testable on its own (per the task's "add a small unit test
 * for the connection-string parser (pure part)"). Returns `undefined` when the string is
 * empty/absent or carries no `InstrumentationKey` segment — nothing to send to.
 */
export function parseConnectionString(raw: string | undefined): ConnectionStringParts | undefined {
  const value = (raw ?? '').trim();
  if (!value) return undefined;

  const parts: Record<string, string> = {};
  for (const segment of value.split(';')) {
    const eq = segment.indexOf('=');
    if (eq <= 0) continue; // no '=', or a segment starting with '=' — not a valid Key=Value pair
    const key = segment.slice(0, eq).trim().toLowerCase();
    const val = segment.slice(eq + 1).trim();
    if (key && val) parts[key] = val;
  }

  const instrumentationKey = parts['instrumentationkey'];
  if (!instrumentationKey) return undefined;

  const ingestionEndpoint = (parts['ingestionendpoint'] || DEFAULT_INGESTION_ENDPOINT).replace(/\/+$/, '');
  return { instrumentationKey, ingestionEndpoint };
}

/** App Insights `customEvents` properties are a string->string bag — stringify anything
 *  that is not already a string (numbers/booleans/arrays/objects) so structured decision
 *  inputs / gate snapshots are never silently dropped by the ingestion schema. `undefined`
 *  values are omitted outright (an absent taxonomy version etc. should not appear as the
 *  literal text "undefined"). */
function stringifyProperties(properties: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value === undefined) continue;
    out[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  return out;
}

/**
 * Fire ONE `customEvent` at App Insights (the classic track envelope, `POST
 * <ingestionEndpoint>/v2/track`). Fire-and-forget: callers never get — and never need —
 * meaningful failure detail back; this resolves once the request settles (or the ~2s
 * timeout aborts it) and NEVER throws or rejects. Silent no-op when
 * `APPLICATIONINSIGHTS_CONNECTION_STRING` is absent (local dev).
 */
export async function trackEvent(name: string, properties: Record<string, unknown>): Promise<void> {
  try {
    const parsed = parseConnectionString(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING);
    if (!parsed) return;

    const envelope = [
      {
        name: 'Microsoft.ApplicationInsights.Event',
        time: new Date().toISOString(),
        iKey: parsed.instrumentationKey,
        data: {
          baseType: 'EventData',
          baseData: {
            ver: 2,
            name,
            properties: stringifyProperties(properties),
          },
        },
      },
    ];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TRACK_TIMEOUT_MS);
    try {
      await fetch(`${parsed.ingestionEndpoint}/v2/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(envelope),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Fire-and-forget: a telemetry failure (network, abort, malformed connection string,
    // …) must never surface to the caller — decision telemetry is an observation channel,
    // never a dependency of intake.
  }
}
