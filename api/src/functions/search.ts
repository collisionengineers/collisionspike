/**
 * api/src/functions/search.ts — global search (TKT-072).
 *
 *   GET /api/search?q=   ONE normalised query across cases / inbound email / providers.
 *
 * Staff-role only (withRole). Behind `GLOBAL_SEARCH_ENABLED` (default OFF) for a soak — while
 * off the route is an honest 200-disabled no-op so the SPA search box degrades gracefully.
 * READ-ONLY (SELECT-only). Space-insensitive on VRM / Case-PO via the shared `canonicalizeVrm`
 * (a spaced "YT13 UTV" matches the compacted stored mark) — so ALL cases sharing a registration
 * surface together (the SPA renders "N other cases share this registration"). Honest-empty on no
 * match; short-query guard; per-group caps so no firehose.
 */

import { app, type HttpRequest, type InvocationContext } from '@azure/functions';
import { gates } from '@cs/domain/gates';
import { canonicalizeVrm, statusToQueue, type CaseStatus } from '@cs/domain';
import { caseStatusCodec, inboundCategoryCodec, statusToInt } from '@cs/domain/codecs';
import { withRole } from '../lib/auth.js';
import { query } from '../lib/db.js';
import type { Row } from '../lib/mappers.js';

const MIN_QUERY_CHARS = 2;
const CASE_CAP = 25;
const EMAIL_CAP = 15;
const PROVIDER_CAP = 10;

export interface CaseHit {
  id: string;
  casePo: string | null;
  vrm: string | null;
  vrmCanonical: string | null;
  ref: string | null;
  queue: string;
  /** The raw status name (TKT-096 terminal-scope fold-in) — lets the SPA render a
   *  real StatusBadge on result rows, since terminal cases ARE in scope (a delivered
   *  case must be findable) while `removed` rows are excluded server-side. */
  status: string;
  claimant: string | null;
  provider: string | null;
}
export interface EmailHit {
  id: string;
  subject: string | null;
  from: string | null;
  received: string | null;
  category: string;
  caseId: string | null;
}
export interface ProviderHit {
  id: string;
  displayName: string | null;
  principalCode: string | null;
}
export interface SearchResults {
  query: string;
  tooShort: boolean;
  cases: CaseHit[];
  emails: EmailHit[];
  providers: ProviderHit[];
  truncated: { cases: boolean; emails: boolean; providers: boolean };
}

function statusName(code: unknown): string {
  try {
    return (typeof code === 'number' ? caseStatusCodec.toName(code) : String(code)) ?? 'unknown';
  } catch {
    return 'unknown';
  }
}
function queueLabel(statusCode: unknown, onHold: unknown): string {
  if (onHold) return 'Held';
  const q = statusToQueue(statusName(statusCode) as CaseStatus);
  return q === 'not-ready' ? 'Not ready' : q === 'review' ? 'Review' : q === 'held' ? 'Held' : 'Closed';
}
function categoryName(code: unknown): string {
  try {
    return (typeof code === 'number' ? inboundCategoryCodec.toName(code) : String(code)) ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function emptyResults(query: string, tooShort: boolean): SearchResults {
  return {
    query,
    tooShort,
    cases: [],
    emails: [],
    providers: [],
    truncated: { cases: false, emails: false, providers: false },
  };
}

/**
 * Run the global search. Pure over `query` — the gate + auth live in the route. Short queries
 * (< 2 chars) short-circuit to an honest-empty result (no firehose). All three arms are SELECTs.
 */
export async function runSearch(qRaw: string): Promise<SearchResults> {
  const q = (qRaw ?? '').trim().slice(0, 80);
  if (q.length < MIN_QUERY_CHARS) return emptyResults(q, true);

  const like = `%${q}%`;
  const canon = canonicalizeVrm(q);
  const useCanon = canon.length >= 2;

  // ---- cases: Case/PO, VRM (space-insensitive), ref, claimant ----
  const casePreds = ['c.case_ref ILIKE $1', 'c.eva_claimant_name ILIKE $1'];
  const caseParams: unknown[] = [like];
  if (useCanon) {
    caseParams.push(`%${canon}%`);
    casePreds.push("regexp_replace(upper(c.vrm), '[^A-Z0-9]', '', 'g') LIKE $2");
    casePreds.push("regexp_replace(upper(c.case_po), '[^A-Z0-9]', '', 'g') LIKE $2");
  }
  // TKT-096 scope decision (ADR-0023): terminal cases (eva_submitted / done /
  // box_synced) are IN scope — search is a primary way to reach a delivered case —
  // but `removed` is excluded (PII anonymised on soft-remove; the row must never
  // resurface through search).
  caseParams.push(statusToInt('removed'));
  const removedParam = caseParams.length;
  caseParams.push(CASE_CAP + 1);
  const caseRows = await query<Row>(
    `SELECT c.id, c.case_po, c.vrm, c.case_ref, c.status_code, c.on_hold,
            c.eva_claimant_name AS claimant, wp.display_name AS provider
       FROM case_ c LEFT JOIN work_provider wp ON wp.id = c.work_provider_id
      WHERE (${casePreds.join(' OR ')})
        AND c.status_code <> $${removedParam}
      ORDER BY regexp_replace(upper(c.vrm), '[^A-Z0-9]', '', 'g'), c.created_at DESC
      LIMIT $${caseParams.length}`,
    caseParams,
  );
  const casesTruncated = caseRows.length > CASE_CAP;
  const cases: CaseHit[] = caseRows.slice(0, CASE_CAP).map((r) => ({
    id: r.id ?? '',
    casePo: r.case_po ?? null,
    vrm: r.vrm ?? null,
    vrmCanonical: r.vrm ? canonicalizeVrm(String(r.vrm)) : null,
    ref: r.case_ref ?? null,
    queue: queueLabel(r.status_code, r.on_hold),
    status: statusName(r.status_code),
    claimant: r.claimant ?? null,
    provider: r.provider ?? null,
  }));

  // ---- inbound emails: subject, sender ----
  const emailRows = await query<Row>(
    `SELECT id, subject, from_address, received_on, category_code, case_id
       FROM inbound_email WHERE subject ILIKE $1 OR from_address ILIKE $1
      ORDER BY received_on DESC LIMIT $2`,
    [like, EMAIL_CAP + 1],
  );
  const emailsTruncated = emailRows.length > EMAIL_CAP;
  const emails: EmailHit[] = emailRows.slice(0, EMAIL_CAP).map((r) => ({
    id: r.id ?? '',
    subject: r.subject ?? null,
    from: r.from_address ?? null,
    received: r.received_on ?? null,
    category: categoryName(r.category_code),
    caseId: r.case_id ?? null,
  }));

  // ---- work providers: name, principal code ----
  const provRows = await query<Row>(
    `SELECT id, display_name, principal_code
       FROM work_provider WHERE display_name ILIKE $1 OR principal_code ILIKE $1
      ORDER BY display_name LIMIT $2`,
    [like, PROVIDER_CAP + 1],
  );
  const providersTruncated = provRows.length > PROVIDER_CAP;
  const providers: ProviderHit[] = provRows.slice(0, PROVIDER_CAP).map((r) => ({
    id: r.id ?? '',
    displayName: r.display_name ?? null,
    principalCode: r.principal_code ?? null,
  }));

  return {
    query: q,
    tooShort: false,
    cases,
    emails,
    providers,
    truncated: { cases: casesTruncated, emails: emailsTruncated, providers: providersTruncated },
  };
}

// GET /api/search?q=
app.http('globalSearch', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'search',
  handler: withRole('CollisionSpike.User', async (req: HttpRequest, _ctx: InvocationContext) => {
    const q = req.query.get('q') ?? '';
    // Gate OFF → honest 200-disabled (empty) so the SPA degrades gracefully (dark soak).
    if (!gates.globalSearch()) {
      return { status: 200, jsonBody: { disabled: true, ...emptyResults(q.trim().slice(0, 80), false) } };
    }
    const results = await runSearch(q);
    return { status: 200, jsonBody: results };
  }),
});
